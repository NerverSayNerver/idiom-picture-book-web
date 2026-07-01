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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// ── TaskExecutor ─────────────────────────────────────────

export class TaskExecutor {
  // ── 启动执行循环 ──────────────────────────────────────
  async start(): Promise<void> {
    useTaskStore.setState({ isRunning: true })

    while (useTaskStore.getState().isRunning) {
      const { isPaused } = useTaskStore.getState()

      // 暂停时等待恢复
      if (isPaused) {
        await sleep(200)
        continue
      }

      // 取出下一个 pending job（dequeueNextJob 会将其标记为 running）
      const job = useTaskStore.getState().dequeueNextJob()
      if (!job) break // 没有更多 job，退出循环

      useTaskStore.setState({ currentTaskId: job.id })

      try {
        await this.executeJob(job.id)
      } catch (error) {
        useTaskStore.getState().updateTask(job.id, {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    useTaskStore.setState({ isRunning: false, currentTaskId: null })
  }

  // ── 停止执行 ──────────────────────────────────────────
  stop(): void {
    useTaskStore.setState({ isRunning: false })
  }

  // ── 执行单个 Job ──────────────────────────────────────
  private async executeJob(jobId: string): Promise<void> {
    const store = useTaskStore.getState()
    const job = store.getTaskById(jobId)
    if (!job || !job.idiom) return

    // Step 1: 创建 decompose 子任务
    const [decomposeId] = store.addChildTasks(jobId, [{ type: 'decompose' }])

    // Step 2: 执行 decompose（会动态创建 generate + save 子任务）
    await this.executeDecompose(decomposeId, jobId, job.idiom)

    // Step 3: 顺序执行 generate + save 子任务
    const childTasks = useTaskStore.getState().getChildTasks(jobId)
    for (const child of childTasks) {
      if (!useTaskStore.getState().isRunning) break
      if (child.status === 'completed') continue

      if (child.type === 'generate') {
        await this.executeGenerate(child.id)
      } else if (child.type === 'save') {
        await this.executeSave(child.id)
      }
    }
  }

  // ── 执行 Decompose 任务 ───────────────────────────────
  private async executeDecompose(
    taskId: string,
    jobId: string,
    idiom: string,
  ): Promise<void> {
    useTaskStore.getState().updateTask(taskId, { status: 'running' })
    useAppStore.getState().setCurrentIdiom(idiom)
    useAppStore.getState().setDecomposing(true)

    try {
      const result = await decomposeIdiom(idiom)

      // 设置 appStore 中的分解结果
      useAppStore.getState().setDecomposition(result.meaning, result.scenes)

      // 为每个场景创建 generate 子任务 + 末尾一个 save 子任务
      const childDefs: ChildTaskDef[] = result.scenes.map((scene, i) => ({
        type: 'generate' as const,
        sceneId: i + 1,
        sceneTitle: scene.title,
        total: 1,
        maxRetries: 3,
      }))
      childDefs.push({ type: 'save' as const, total: 1, maxRetries: 1 })

      useTaskStore.getState().addChildTasks(jobId, childDefs)

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
      throw error // 传播错误，让 executeJob 知道 decompose 失败了
    } finally {
      useAppStore.getState().setDecomposing(false)
    }
  }

  // ── 执行 Generate 任务 ────────────────────────────────
  private async executeGenerate(taskId: string): Promise<void> {
    const task = useTaskStore.getState().getTaskById(taskId)
    if (!task || task.sceneId === undefined) return

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
      // 使用循环代替递归，避免栈溢出
      let retryCount = 0
      const maxRetries = task.maxRetries

      while (retryCount <= maxRetries) {
        try {
          // 生成图像 URL
          const imageUrl = await generateSceneImage(scene.prompt)
          // 下载为 base64
          const base64 = await downloadImageAsBase64(imageUrl)
          // 转换为 Blob
          const blob = base64ToBlob(base64)
          // 保存到 appStore
          useAppStore.getState().setSceneImage(task.sceneId, imageUrl, blob)

          useTaskStore.getState().updateTask(taskId, {
            status: 'completed',
            progress: 1,
            total: 1,
          })
          return // 成功，退出
        } catch (error) {
          if (retryCount < maxRetries) {
            // 自动重试：增加重试计数
            retryCount++
            useTaskStore.getState().updateTask(taskId, {
              status: 'pending',
              retryCount,
              error: undefined,
              progress: 0,
            })
            await sleep(1000)
            // 标记为 running 继续重试
            useTaskStore.getState().updateTask(taskId, { status: 'running' })
          } else {
            // 重试次数耗尽，标记失败
            useTaskStore.getState().updateTask(taskId, {
              status: 'failed',
              error: error instanceof Error ? error.message : String(error),
            })
            return
          }
        }
      }
    } finally {
      useAppStore.getState().setGeneratingScene(null)
      useAppStore.getState().setGenerating(false)
    }
  }

  // ── 执行 Save 任务 ────────────────────────────────────
  private async executeSave(taskId: string): Promise<void> {
    useTaskStore.getState().updateTask(taskId, { status: 'running' })

    try {
      // 保存当前绘本到 appStore（内存）
      const book = useAppStore.getState().saveCurrentBook()

      // 持久化到 IndexedDB
      await savePictureBook(book)

      // 保存每个场景的图像到 IndexedDB
      for (const scene of book.scenes) {
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
