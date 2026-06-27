import { useTaskStore } from './task-store'
import type { ChildTaskDef } from './task-store'
import { useAppStore } from './store'
import { decomposeIdiom } from '@/app/actions/decompose'
import { generateSceneImage, downloadImageAsBase64 } from '@/app/actions/generate'
import { savePictureBook, saveSceneImage } from '@/lib/db'

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

export class TaskExecutor {
  private isRunning = false
  private abortController: AbortController | null = null

  async start(): Promise<void> {
    if (this.isRunning) {
      return
    }

    this.isRunning = true
    this.abortController = new AbortController()
    useTaskStore.setState({ isRunning: true })

    try {
      while (this.isRunning && !this.abortController.signal.aborted) {
        const state = useTaskStore.getState()
        if (!state.isRunning) break

        if (state.isPaused) {
          await sleep(200)
          continue
        }

        const job = state.dequeueNextJob()
        if (!job) break

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
    } finally {
      this.isRunning = false
      this.abortController = null
      useTaskStore.setState({ isRunning: false, currentTaskId: null })
    }
  }

  stop(): void {
    this.isRunning = false
    if (this.abortController) {
      this.abortController.abort()
    }
    useTaskStore.setState({ isRunning: false })
  }

  isExecutorRunning(): boolean {
    return this.isRunning
  }

  private async executeJob(jobId: string): Promise<void> {
    const store = useTaskStore.getState()
    const job = store.getTaskById(jobId)
    if (!job || !job.idiom) return

    const [decomposeId] = store.addChildTasks(jobId, [{ type: 'decompose' }])
    await this.executeDecompose(decomposeId, jobId, job.idiom)

    const maxIterations = 100
    let iterations = 0

    while (iterations < maxIterations) {
      iterations++
      if (!this.isRunning || this.abortController?.signal.aborted) break
      if (useTaskStore.getState().isPaused) {
        await sleep(200)
        continue
      }

      const childTasks = useTaskStore.getState().getChildTasks(jobId)
      const nextTask = childTasks.find(
        (t) => t.status === 'pending' && t.type !== 'decompose',
      )

      if (!nextTask) break

      if (nextTask.type === 'generate') {
        await this.executeGenerate(nextTask.id)
      } else if (nextTask.type === 'save') {
        await this.executeSave(nextTask.id)
      }
    }
  }

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
      useAppStore.getState().setDecomposition(result.meaning, result.scenes)

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
      throw error
    } finally {
      useAppStore.getState().setDecomposing(false)
    }
  }

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

    let attempt = 0
    const maxAttempts = task.maxRetries + 1
    let lastError: unknown = null

    while (attempt < maxAttempts) {
      if (!this.isRunning || this.abortController?.signal.aborted) {
        useAppStore.getState().setGeneratingScene(null)
        useAppStore.getState().setGenerating(false)
        return
      }

      try {
        const imageUrl = await generateSceneImage(scene.prompt)
        const base64 = await downloadImageAsBase64(imageUrl)
        const blob = base64ToBlob(base64)
        useAppStore.getState().setSceneImage(task.sceneId, imageUrl, blob)

        useTaskStore.getState().updateTask(taskId, {
          status: 'completed',
          progress: 1,
          total: 1,
          error: undefined,
        })

        useAppStore.getState().setGeneratingScene(null)
        useAppStore.getState().setGenerating(false)
        return
      } catch (error) {
        lastError = error
        attempt++

        if (attempt < maxAttempts) {
          useTaskStore.getState().updateTask(taskId, {
            retryCount: attempt,
            error: `重试 ${attempt}/${maxAttempts - 1}: ${error instanceof Error ? error.message : String(error)}`,
          })
          await sleep(1000 * attempt)
        }
      }
    }

    useTaskStore.getState().updateTask(taskId, {
      status: 'failed',
      error: lastError instanceof Error ? lastError.message : String(lastError),
    })
    useAppStore.getState().setGeneratingScene(null)
    useAppStore.getState().setGenerating(false)
  }

  private async executeSave(taskId: string): Promise<void> {
    useTaskStore.getState().updateTask(taskId, { status: 'running' })

    try {
      const book = useAppStore.getState().saveCurrentBook()
      await savePictureBook(book)

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
