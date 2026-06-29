// worker.ts
// 独立 Worker 进程：轮询 SQLite 任务队列，执行绘本生成管道
// 启动方式: npm run worker (npx tsx worker.ts)

import { config } from 'dotenv'
import { resolve } from 'path'
// 在首次 import 时加载 .env.local（dotenv 同步执行，比后续模块调用先完成）
config({ path: resolve(__dirname || process.cwd(), '.env.local') })

import { pollPendingJob, updateTask, getTask, getChildTasks, addChildTasks, recoverInterruptedTasks, closeDb } from './lib/task-db'
import { decomposeSource } from './app/actions/decompose'
import { generateSceneImage, generateSceneImageWithRef } from './app/actions/generate'
import { saveBook } from './lib/save-book'
import type { Task, ChildTaskDef } from './lib/task-types'
import type { ContentCategory, SceneTemplate } from './lib/types'
import { promises as fs } from 'fs'
import path from 'path'
import { sanitizeFilename, validateCategory } from './lib/path-security'

// ── Helpers ─────────────────────────────────────────────────

/**
 * S7: 检查任务是否被取消（通过 DB 状态），若已取消则 abort signal
 * 在 executeJob 关键步骤前调用，确保 cancel API 能及时中断执行
 */
function checkCancellation(jobId: string, signal: AbortController): void {
  const task = getTask(jobId)
  if (task && task.status === 'cancelled') {
    signal.abort()
  }
}

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
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  // 外部 signal 也触发中止
  signal.addEventListener('abort', () => controller.abort())
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`下载图片失败: ${response.status}`)
    const buffer = Buffer.from(await response.arrayBuffer())
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, buffer)
  } finally {
    clearTimeout(timeout)
  }
}

// ── Execution Pipeline ──────────────────────────────────────

async function executeJob(jobId: string, abortController: AbortController): Promise<void> {
  const signal = abortController.signal
  const job = getTask(jobId)
  if (!job || !job.sourceText) return

  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

  console.log(`\n>>> 开始执行任务: ${job.sourceText} (${job.category}) [${jobId}]`)

  // Step 1: Create decompose child task
  const [decomposeChild] = addChildTasks(jobId, [{ type: 'decompose', sceneTitle: '分析含义' }])
  const decomposeId = decomposeChild.id

  // Step 2: Execute decompose
  await executeDecompose(decomposeId, jobId, job.sourceText, job.category as ContentCategory, signal)

  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

  // S7: 检查 API 是否已请求取消
  checkCancellation(jobId, abortController)

  // Step 3: Execute generate + save children sequentially
  const children = getChildTasks(jobId)
  for (const child of children) {
    if (signal.aborted) break
    if (child.status === 'completed') continue

    // 每个子任务前也检查取消状态
    checkCancellation(jobId, abortController)

    if (child.type === 'generate') {
      await executeGenerate(child.id, signal)
    } else if (child.type === 'save') {
      await executeSave(child.id, jobId, signal)
    }
  }

  console.log(`<<< 任务完成: ${job.sourceText} (${job.category}) [${jobId}]\n`)
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
      // 构造增强版 prompt：注入绘本概要，帮助模型理解全局
      const enhancedPrompt = buildEnhancedPrompt(decomposeTask, scene, task.sceneId)

      // 查找参考图：优先使用首个已完成的生成场景作为 img2img 参考
      const referenceImageUrl = await findReferenceImage(job?.id, task.sceneId)

      let imageUrl: string
      if (referenceImageUrl) {
        // 图生图：以首图为参考，保持风格和角色一致
        imageUrl = await generateSceneImageWithRef(enhancedPrompt, referenceImageUrl)
      } else {
        // 纯文生图（首个场景）
        imageUrl = await generateSceneImage(enhancedPrompt)
      }

      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

      // 下载图片到本地持久保存（远程链接会过期）
      const jobForPath = getTask(currentTask.parentId!)
      const category = validateCategory(jobForPath?.category || 'idiom')
      const sourceText = sanitizeFilename(jobForPath?.sourceText || 'unknown')
      const localPath = path.join(process.cwd(), 'public', 'generated', category, sourceText, `${task.sceneId}.png`)
      await downloadImageToFile(imageUrl, localPath, signal)

      const localImageUrl = `/generated/${category}/${sourceText}/${task.sceneId}.png`

      updateTask(taskId, {
        status: 'completed',
        progress: 1,
        total: 1,
        imageUrl: localImageUrl, // 用本地路径，远程链接会过期
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

/**
 * 构建增强版生图 prompt：注入绘本主题、角色设定、统一画风，确保同绘本图片连贯。
 */
function buildEnhancedPrompt(
  decomposeTask: Task,
  scene: SceneTemplate,
  sceneId: number
): string {
  const parts: string[] = []

  const meaning = decomposeTask.decomposeMeaning
  if (meaning) {
    parts.push(`【绘本主题】${meaning}`)
  }

  const characterDesc = decomposeTask.decomposeCharacterDescription
  if (characterDesc) {
    parts.push(`【角色设定】${characterDesc}`)
  }

  const styleDesc = decomposeTask.decomposeStyleDescription
  if (styleDesc) {
    parts.push(`【统一画风】${styleDesc}`)
  }

  parts.push(`【当前场景】第${sceneId}幕：${scene.title}`)

  if (scene.description) {
    parts.push(`【场景描述】${scene.description}`)
  }

  if (scene.compositionHint) {
    parts.push(`【构图】${scene.compositionHint}`)
  }

  // 最后附加原始生图 prompt
  parts.push(`【生图提示词】${scene.prompt}`)

  return parts.join('\n')
}

/**
 * 查找可作为 img2img 参考的图片，读取本地文件并转为 base64 Data URI。
 * Agnes API 不支持本地文件路径，必须传 Data URI 或远程 URL。
 */
async function findReferenceImage(
  parentJobId: string | undefined | null,
  currentSceneId: number
): Promise<string | undefined> {
  if (!parentJobId) return undefined

  const allChildren = getChildTasks(parentJobId)
  const firstCompleted = allChildren.find(
    (c) =>
      c.type === 'generate' &&
      c.status === 'completed' &&
      typeof c.sceneId === 'number' &&
      c.sceneId < currentSceneId &&
      c.imageUrl
  )
  const imageUrl = firstCompleted?.imageUrl
  if (!imageUrl) return undefined

  try {
    const absolutePath = path.join(process.cwd(), 'public', imageUrl)
    const buffer = await fs.readFile(absolutePath)
    const base64 = buffer.toString('base64')
    const ext = path.extname(imageUrl).toLowerCase()
    const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png'
    return `data:${mimeType};base64,${base64}`
  } catch {
    return undefined
  }
}

async function executeSave(taskId: string, jobId: string, signal: AbortSignal): Promise<void> {
  updateTask(taskId, { status: 'running', startTime: Date.now() })

  try {
    const job = getTask(jobId)
    const decomposeTask = getChildTasks(jobId).find(c => c.type === 'decompose')

    if (!job || !decomposeTask) {
      throw new Error('缺少任务数据')
    }

    // Build PictureBook from task data
    const safeCategory = validateCategory(job.category || 'idiom')
    const safeSourceText = sanitizeFilename(job.sourceText || 'unknown')
    const scenes: SceneTemplate[] = decomposeTask.decomposeScenesJson
      ? JSON.parse(decomposeTask.decomposeScenesJson)
      : []

    const book = {
      id: jobId,
      category: safeCategory as ContentCategory,
      sourceText: job.sourceText || '',
      title: job.sourceText || '',
      idiom: job.sourceText || '',
      meaning: decomposeTask.decomposeMeaning || '',
      createdAt: new Date().toISOString(),
      scenes: scenes.map((s, i) => {
        const localImageUrl = `/generated/${safeCategory}/${safeSourceText}/${i + 1}.png`
        return {
          ...s,
          id: i + 1,
          imageUrl: localImageUrl, // 只用本地路径，远程链接会过期
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

    try {
      await executeJob(job.id, abortController)
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
