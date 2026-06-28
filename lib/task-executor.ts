import { useTaskStore } from './task-store'
import type { ChildTaskDef } from './task-store'
import { useAppStore } from './store'
import { decomposeIdiom } from '@/app/actions/decompose'
import { generateSceneImage, downloadImageAsBase64 } from '@/app/actions/generate'
import { savePictureBook, saveSceneImage } from '@/lib/db'

// ── 辅助函数 ─────────────────────────────────────────────

/**
 * 将 base64 数据 URL 转换为 Blob
 */
function base64ToBlob(base64: string): Blob {
  const [header, data] = base64.split(',')
  const mimeMatch = header.match(/:(.*?);/)
  const mime = mimeMatch?.[1] ?? 'image/png'
  const binary = atob(data)
  const array = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i)
  }
  return new Blob([array], { type: mime })
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

// ── TaskExecutor ─────────────────────────────────────────

export class TaskExecutor {
  private abortController: AbortController | null = null

  // ── 启动执行循环 ──────────────────────────────────────
  async start(): Promise<void> {
    // 防止重复启动 — 同步检查并立即设置 isRunning
    const state = useTaskStore.getState()
    if (state.isRunning) {
      console.warn('TaskExecutor: 已在运行中，忽略重复启动')
      return
    }
    useTaskStore.setState({ isRunning: true })

    // 加载持久化任务（可能在页面刷新后恢复）
    await useTaskStore.getState().loadPersistedTasks()

    // 创建新的 AbortController
    this.abortController = new AbortController()
    const signal = this.abortController.signal

    while (useTaskStore.getState().isRunning) {
      // 响应取消信号
      if (signal.aborted) {
        useTaskStore.setState({ isRunning: false, currentTaskId: null })
        return
      }

      const { isPaused } = useTaskStore.getState()

      // 暂停时等待恢复（缩短轮询间隔以提高响应速度）
      if (isPaused) {
        await sleep(100, signal).catch(() => {})
        continue
      }

      // 取出下一个 pending job（dequeueNextJob 会将其标记为 running）
      const job = useTaskStore.getState().dequeueNextJob()
      if (!job) {
        // 没有更多 job，短暂等待后检查是否有新 job 添加
        await sleep(200, signal).catch(() => {})
        continue
      }

      useTaskStore.setState({ currentTaskId: job.id })

      try {
        await this.executeJob(job.id, signal)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          useTaskStore.getState().updateTask(job.id, {
            status: 'cancelled',
            error: '任务已取消',
          })
        } else {
          useTaskStore.getState().updateTask(job.id, {
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }

    useTaskStore.setState({ isRunning: false, currentTaskId: null })
    this.abortController = null
  }

  // ── 停止执行 ──────────────────────────────────────────
  stop(): void {
    useTaskStore.setState({ isRunning: false })
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
  }

  // ── 执行单个 Job ──────────────────────────────────────
  private async executeJob(jobId: string, signal: AbortSignal): Promise<void> {
    const store = useTaskStore.getState()
    const job = store.getTaskById(jobId)
    if (!job || !job.idiom) return

    // 响应取消
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

    // Step 1: 创建 decompose 子任务
    const [decomposeId] = store.addChildTasks(jobId, [{ type: 'decompose', sceneTitle: '分析成语含义' }])

    // Step 2: 执行 decompose（会动态创建 generate + save 子任务）
    await this.executeDecompose(decomposeId, jobId, job.idiom, signal)

    // 响应取消
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

    // Step 3: 顺序执行 generate + save 子任务
    const childTasks = useTaskStore.getState().getChildTasks(jobId)
    for (const child of childTasks) {
      if (!useTaskStore.getState().isRunning || signal.aborted) break
      if (child.status === 'completed') continue

      if (child.type === 'generate') {
        await this.executeGenerate(child.id, signal)
      } else if (child.type === 'save') {
        await this.executeSave(child.id, signal)
      }
    }
  }

  // ── 执行 Decompose 任务 ───────────────────────────────
  private async executeDecompose(
    taskId: string,
    jobId: string,
    idiom: string,
    signal: AbortSignal,
  ): Promise<void> {
    useTaskStore.getState().updateTask(taskId, { status: 'running' })
    useAppStore.getState().setCurrentIdiom(idiom)
    useAppStore.getState().setDecomposing(true)

    try {
      const result = await decomposeIdiom(idiom)

      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

      // 设置 appStore 中的分解结果（含角色/风格描述）
      useAppStore.getState().setDecomposition(
        result.meaning, result.scenes,
        result.characterDescription,
        result.styleDescription,
      )

      // 为每个场景创建 generate 子任务 + 末尾一个 save 子任务
      const childDefs: ChildTaskDef[] = result.scenes.map((scene, i) => ({
        type: 'generate' as const,
        sceneId: i + 1,
        sceneTitle: `场景 ${i + 1}：${scene.title}`,
        total: 1,
        maxRetries: 3,
      }))
      childDefs.push({ type: 'save' as const, sceneTitle: '保存绘本', total: 1, maxRetries: 1 })

      useTaskStore.getState().addChildTasks(jobId, childDefs)

      useTaskStore.getState().updateTask(taskId, {
        status: 'completed',
        progress: 1,
        total: 1,
        // 将分解结果存储到 task 本身上，避免批量生成时被后续 job 覆盖
        decomposeMeaning: result.meaning,
        decomposeCharacterDescription: result.characterDescription,
        decomposeStyleDescription: result.styleDescription,
        decomposeScenesJson: JSON.stringify(result.scenes),
      })
    } catch (error) {
      useTaskStore.getState().updateTask(taskId, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error // 传播错误，让 executeJob 知道 decompose 失败了
    } finally {
      useAppStore.getState().setDecomposing(false)
    }
  }

  // ── 执行 Generate 任务 ────────────────────────────────
  private async executeGenerate(taskId: string, signal: AbortSignal): Promise<void> {
    const maxAttempts = 1 + (useTaskStore.getState().getTaskById(taskId)?.maxRetries ?? 3)

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // 每次循环前检查取消/暂停状态
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      if (!useTaskStore.getState().isRunning) return

      const task = useTaskStore.getState().getTaskById(taskId)
      if (!task || task.sceneId === undefined) return

      // 从第二次循环开始，说明是重试
      if (attempt > 1) {
        // 重试前等待，但要响应取消
        await sleep(1000, signal)
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

        useTaskStore.getState().updateTask(taskId, {
          status: 'pending',
          retryCount: attempt - 1,
          error: undefined,
          progress: 0,
        })
      }

      const appState = useAppStore.getState()
      const scene = appState.currentScenes.find((s) => s.id === task.sceneId)
      if (!scene) {
        useTaskStore.getState().updateTask(taskId, {
          status: 'failed',
          error: `Scene ${task.sceneId} not found`,
        })
        return
      }

      useTaskStore.getState().updateTask(taskId, { status: 'running' })
      useAppStore.getState().setGeneratingScene(task.sceneId)
      useAppStore.getState().setGenerating(true)

      try {
        const imageUrl = await generateSceneImage(scene.prompt)
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

        const base64 = await downloadImageAsBase64(imageUrl)
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

        const blob = base64ToBlob(base64)
        useAppStore.getState().setSceneImage(task.sceneId, imageUrl, blob)

        useTaskStore.getState().updateTask(taskId, {
          status: 'completed',
          progress: 1,
          total: 1,
          imageUrl, // 把图片 URL 记在 task 上，跨 job 持久
        })
        return // 成功则退出
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error
        if (attempt < maxAttempts) {
          console.log(`图像生成重试 ${attempt}/${maxAttempts - 1}...`)
          continue // 继续下次循环（重试）
        }
        // 最后一次尝试也失败
        useTaskStore.getState().updateTask(taskId, {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        })
        return
      } finally {
        useAppStore.getState().setGeneratingScene(null)
        useAppStore.getState().setGenerating(false)
      }
    }
  }

  // ── 执行 Save 任务 ────────────────────────────────────
  private async executeSave(taskId: string, signal: AbortSignal): Promise<void> {
    useTaskStore.getState().updateTask(taskId, { status: 'running' })

    try {
      // 保存当前绘本到 appStore（内存），传 existingId 防止 retry 重复
      const task = useTaskStore.getState().getTaskById(taskId)
      const parentJob = task?.parentId ? useTaskStore.getState().getTaskById(task.parentId) : null
	      const existingBook = parentJob
	        ? undefined
	        : undefined
	      const book = useAppStore.getState().saveCurrentBook(undefined)

      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

      // 持久化到 IndexedDB
      await savePictureBook(book)

      // 保存每个场景的图像到 IndexedDB
      for (const scene of book.scenes) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
        if (scene.imageBlob) {
          await saveSceneImage(book.id, scene.id, scene.imageBlob)
        }
      }

      useTaskStore.getState().updateTask(taskId, {
        status: 'completed',
        progress: 1,
        total: 1,
      })
    } catch (error) {
      useTaskStore.getState().updateTask(taskId, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }
}
