// worker.ts
// 独立 Worker 进程：轮询 SQLite 任务队列，执行绘本生成管道
// 启动方式: npm run worker (npx tsx worker.ts)

import { pollPendingJob, markRunning, updateTask, getTask, getChildTasks, addChildTasks, recoverInterruptedTasks, closeDb } from './lib/task-db'
import { decomposeSource } from './app/actions/decompose'
import { generateSceneImage } from './app/actions/generate'
import { saveBook } from './lib/save-book'
import type { Task, ChildTaskDef } from './lib/task-types'
import type { ContentCategory, SceneTemplate } from './lib/types'
import { promises as fs } from 'fs'
import path from 'path'

// ── Helpers ─────────────────────────────────────────────────

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(resolve, ms)
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      })
    }
  })

/** 下载远程图片到本地文件系统 */
async function downloadImageToFile(url: string, filePath: string, signal: AbortSignal): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`下载图片失败: ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, buffer)
}

// ── Execution Pipeline ──────────────────────────────────────

async function executeJob(jobId: string, signal: AbortSignal): Promise<void> {
  const job = getTask(jobId)
  if (!job || !job.sourceText) return

  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

  // Step 1: Create decompose child task
  const [decomposeChild] = addChildTasks(jobId, [{ type: 'decompose', sceneTitle: '分析成语含义' }])
  const decomposeId = decomposeChild.id

  // Step 2: Execute decompose
  await executeDecompose(decomposeId, jobId, job.sourceText, job.category as ContentCategory, signal)

  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

  // Step 3: Execute generate + save children sequentially
  const children = getChildTasks(jobId)
  for (const child of children) {
    if (signal.aborted) break
    if (child.status === 'completed') continue

    if (child.type === 'generate') {
      await executeGenerate(child.id, signal)
    } else if (child.type === 'save') {
      await executeSave(child.id, jobId, signal)
    }
  }
}

async function executeDecompose(
  taskId: string,
  jobId: string,
  sourceText: string,
  category: ContentCategory,
  signal: AbortSignal,
): Promise<void> {
  updateTask(taskId, { status: 'running', startTime: Date.now() })

  try {
    const result = await decomposeSource(sourceText, category)

    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

    // Create generate child tasks + save task
    const childDefs: ChildTaskDef[] = result.scenes.map((scene, i) => ({
      type: 'generate' as const,
      sceneId: i + 1,
      sceneTitle: `场景 ${i + 1}：${scene.title}`,
      total: 1,
      maxRetries: 3,
    }))
    childDefs.push({ type: 'save' as const, sceneTitle: '保存绘本', total: 1, maxRetries: 1 })

    addChildTasks(jobId, childDefs)

    updateTask(taskId, {
      status: 'completed',
      progress: 1,
      total: 1,
      endTime: Date.now(),
      decomposeMeaning: result.meaning,
      decomposeCharacterDescription: result.characterDescription,
      decomposeStyleDescription: result.styleDescription,
      decomposeScenesJson: JSON.stringify(result.scenes),
    })
  } catch (error) {
    updateTask(taskId, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      endTime: Date.now(),
    })
    throw error
  }
}

async function executeGenerate(taskId: string, signal: AbortSignal): Promise<void> {
  const task = getTask(taskId)
  if (!task || task.sceneId === undefined) return

  const maxAttempts = 1 + (task.maxRetries ?? 3)

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

    const currentTask = getTask(taskId)
    if (!currentTask) return

    if (attempt > 1) {
      await sleep(1000, signal)
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      updateTask(taskId, { status: 'pending', retryCount: attempt - 1, error: undefined, progress: 0 })
    }

    // Get scene from decompose result
    const job = currentTask.parentId ? getTask(currentTask.parentId) : null
    const decomposeTask = job ? getChildTasks(job.id).find(c => c.type === 'decompose') : null
    if (!decomposeTask?.decomposeScenesJson) {
      updateTask(taskId, { status: 'failed', error: 'No decomposition data found' })
      return
    }

    const scenes: SceneTemplate[] = JSON.parse(decomposeTask.decomposeScenesJson)
    // sceneId 是 1-based index
    const sceneIndex = (task.sceneId ?? 1) - 1
    const scene = scenes[sceneIndex]
    if (!scene) {
      updateTask(taskId, { status: 'failed', error: `Scene ${task.sceneId} not found` })
      return
    }

    updateTask(taskId, { status: 'running', startTime: Date.now() })

    try {
      const imageUrl = await generateSceneImage(scene.prompt)
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

      // 下载图片到本地持久保存
      const job = getTask(currentTask.parentId!)
      const category = job?.category || 'idiom'
      const sourceText = job?.sourceText || ''
      const localPath = path.join(process.cwd(), 'public', 'generated', category, sourceText, `${task.sceneId}.png`)
      await downloadImageToFile(imageUrl, localPath, signal)

      updateTask(taskId, {
        status: 'completed',
        progress: 1,
        total: 1,
        imageUrl, // 保留远程 URL，也用于 book.json
        endTime: Date.now(),
      })
      return
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      if (attempt < maxAttempts) {
        console.log(`图像生成重试 ${attempt}/${maxAttempts - 1}...`)
        continue
      }
      updateTask(taskId, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        endTime: Date.now(),
      })
      return
    }
  }
}

async function executeSave(taskId: string, jobId: string, signal: AbortSignal): Promise<void> {
  updateTask(taskId, { status: 'running', startTime: Date.now() })

  try {
    const job = getTask(jobId)
    const decomposeTask = getChildTasks(jobId).find(c => c.type === 'decompose')
    const generateTasks = getChildTasks(jobId).filter(c => c.type === 'generate')

    if (!job || !decomposeTask) {
      throw new Error('缺少任务数据')
    }

    // Build PictureBook from task data
    const scenes: SceneTemplate[] = decomposeTask.decomposeScenesJson
      ? JSON.parse(decomposeTask.decomposeScenesJson)
      : []

    const book = {
      id: jobId,
      category: (job.category || 'idiom') as ContentCategory,
      sourceText: job.sourceText || '',
      title: job.sourceText || '',
      idiom: job.sourceText || '',
      meaning: decomposeTask.decomposeMeaning || '',
      createdAt: new Date().toISOString(),
      scenes: scenes.map((s, i) => {
        const genTask = generateTasks.find(g => g.sceneId === i + 1)
        const localImageUrl = `/generated/${job.category || 'idiom'}/${job.sourceText || ''}/${i + 1}.png`
        return {
          ...s,
          id: i + 1,
          imageUrl: genTask?.imageUrl || localImageUrl, // 优先远程，降级本地
        }
      }) as any[],
    }

    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

    await saveBook(book as any)

    updateTask(taskId, {
      status: 'completed',
      progress: 1,
      total: 1,
      endTime: Date.now(),
    })
  } catch (error) {
    updateTask(taskId, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      endTime: Date.now(),
    })
    throw error
  }
}

// ── Main Loop ───────────────────────────────────────────────

async function main() {
  console.log('🔧 Worker 启动...')

  // Recover interrupted tasks from previous run
  const recovered = recoverInterruptedTasks()
  if (recovered > 0) {
    console.log(`♻️ 恢复了 ${recovered} 个中断的任务`)
  }

  const abortController = new AbortController()
  const signal = abortController.signal

  process.on('SIGINT', () => {
    console.log('\n🛑 收到 SIGINT，正在停止...')
    abortController.abort()
  })
  process.on('SIGTERM', () => {
    console.log('\n🛑 收到 SIGTERM，正在停止...')
    abortController.abort()
  })

  console.log('🔄 开始轮询任务队列...')

  while (!signal.aborted) {
    const job = pollPendingJob()
    if (!job) {
      await sleep(500, signal).catch(() => {})
      continue
    }

    console.log(`📋 开始执行: ${job.sourceText} (${job.category})`)
    markRunning(job.id)

    try {
      await executeJob(job.id, signal)
      console.log(`✅ 完成: ${job.sourceText}`)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        updateTask(job.id, { status: 'cancelled', error: '任务已取消', endTime: Date.now() })
      } else {
        updateTask(job.id, {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          endTime: Date.now(),
        })
      }
      console.log(`❌ 失败: ${job.sourceText} - ${error}`)
    }
  }

  closeDb()
  console.log('👋 Worker 已停止')
}

main()
