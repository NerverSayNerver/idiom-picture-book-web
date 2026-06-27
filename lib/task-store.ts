import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { saveTasks, loadTasks } from './db'

// ── 类型定义 ──────────────────────────────────────────────

export type TaskStatus =
  | 'pending'    // 等待执行
  | 'running'    // 正在执行
  | 'paused'     // 已暂停
  | 'completed'  // 已完成
  | 'failed'     // 失败
  | 'cancelled'  // 已取消

export type TaskType = 'job' | 'decompose' | 'generate' | 'save'

export interface Task {
  id: string
  type: TaskType
  parentId: string | null
  status: TaskStatus
  idiom?: string
  sceneId?: number
  sceneTitle?: string
  progress: number
  total: number
  error?: string
  startTime?: number
  endTime?: number
  retryCount: number
  maxRetries: number
  childTaskIds: string[]
}

// ── 子任务定义（用于 addChildTasks） ─────────────────────

export interface ChildTaskDef {
  type: TaskType
  sceneId?: number
  sceneTitle?: string
  total?: number
  maxRetries?: number
}

// ── 辅助函数 ─────────────────────────────────────────────

/**
 * 根据子任务状态推导 job 状态
 */
export function deriveJobStatus(childTasks: Task[]): TaskStatus {
  if (childTasks.length === 0) return 'pending'

  const statuses = new Set(childTasks.map(t => t.status))

  // 所有完成 → completed
  if (childTasks.every(t => t.status === 'completed')) return 'completed'

  // 有任何 running → running
  if (statuses.has('running')) return 'running'

  // 有任何 failed 且无 running → failed
  if (statuses.has('failed')) return 'failed'

  // 有任何 paused 且无 running → paused
  if (statuses.has('paused')) return 'paused'

  // 有任何 cancelled → cancelled
  if (statuses.has('cancelled')) return 'cancelled'

  // 其余情况（全部 pending）→ pending
  return 'pending'
}

// ── Store 接口 ───────────────────────────────────────────

interface TaskQueueState {
  // 任务列表
  tasks: Task[]

  // 全局状态（向后兼容）
  isRunning: boolean
  isPaused: boolean
  currentTaskId: string | null

  // 统计信息（向后兼容）
  totalTasks: number
  completedTasks: number
  failedTasks: number

  // ── Job 相关 actions ──────────────────────────────────
  createJob: (idiom: string) => string
  addChildTasks: (jobId: string, childDefs: ChildTaskDef[]) => string[]
  createJobs: (idioms: string[]) => string[]

  // ── 通用 task actions ─────────────────────────────────
  addTask: (taskData: {
    type: TaskType
    parentId?: string | null
    idiom?: string
    sceneId?: number
    sceneTitle?: string
    total?: number
    error?: string
    startTime?: number
    endTime?: number
    maxRetries?: number
    childTaskIds?: string[]
  }) => string
  updateTask: (taskId: string, updates: Partial<Task>) => void
  removeTask: (taskId: string) => void

  // ── 任务控制 ─────────────────────────────────────────
  pauseTask: (taskId: string) => void
  resumeTask: (taskId: string) => void
  cancelTask: (taskId: string) => void
  retryTask: (taskId: string) => void

  // ── 全局控制 ─────────────────────────────────────────
  pauseAll: () => void
  resumeAll: () => void
  cancelAll: () => void
  clearCompleted: () => void

  // ── 查询 ─────────────────────────────────────────────
  getTaskById: (taskId: string) => Task | undefined
  getChildTasks: (jobId: string) => Task[]
  getJobProgress: (jobId: string) => { completed: number; total: number; percent: number }
  getJobQueue: () => Task[]

  // ── 队列调度 ─────────────────────────────────────────
  dequeueNextJob: () => Task | undefined

  // ── 向后兼容查询 ─────────────────────────────────────
  getTasksByStatus: (status: TaskStatus) => Task[]
  getTasksByType: (type: TaskType) => Task[]

  // ── 重置 ─────────────────────────────────────────────
  reset: () => void

  // ── 持久化 ─────────────────────────────────────────────
  persistTasks: () => void
  loadPersistedTasks: () => Promise<void>
}

// ── Store 实现 ───────────────────────────────────────────

export const useTaskStore = create<TaskQueueState>((set, get) => ({
  tasks: [],
  isRunning: false,
  isPaused: false,
  currentTaskId: null,
  totalTasks: 0,
  completedTasks: 0,
  failedTasks: 0,

  // ── createJob ─────────────────────────────────────────
  createJob: (idiom: string) => {
    const id = uuidv4()
    const job: Task = {
      id,
      type: 'job',
      parentId: null,
      status: 'pending',
      idiom,
      progress: 0,
      total: 0,
      retryCount: 0,
      maxRetries: 0,
      childTaskIds: [],
    }

    set((state) => ({
      tasks: [...state.tasks, job],
      totalTasks: state.totalTasks + 1,
    }))

    get().persistTasks()
    return id
  },

  // ── addChildTasks ─────────────────────────────────────
  addChildTasks: (jobId: string, childDefs: ChildTaskDef[]) => {
    const newChildIds: string[] = []

    set((state) => {
      const job = state.tasks.find(t => t.id === jobId)
      if (!job || job.type !== 'job') return state

      const newChildren: Task[] = childDefs.map(def => {
        const childId = uuidv4()
        newChildIds.push(childId)
        return {
          id: childId,
          type: def.type,
          parentId: jobId,
          status: 'pending' as TaskStatus,
          sceneId: def.sceneId,
          sceneTitle: def.sceneTitle,
          progress: 0,
          total: def.total ?? 1,
          retryCount: 0,
          maxRetries: def.maxRetries ?? 3,
          childTaskIds: [],
        }
      })

      const updatedTasks = state.tasks.map(t => {
        if (t.id === jobId) {
          return {
            ...t,
            childTaskIds: [...t.childTaskIds, ...newChildIds],
            total: t.total + newChildren.length,
          }
        }
        return t
      })

      return {
        tasks: [...updatedTasks, ...newChildren],
        totalTasks: state.totalTasks + newChildren.length,
      }
    })

    get().persistTasks()
    return newChildIds
  },

  // ── createJobs ────────────────────────────────────────
  createJobs: (idioms: string[]) => {
    return idioms.map(idiom => get().createJob(idiom))
  },

  // ── addTask（向后兼容） ───────────────────────────────
  addTask: (taskData) => {
    const taskId = uuidv4()
    const newTask: Task = {
      id: taskId,
      type: taskData.type,
      parentId: taskData.parentId ?? null,
      status: 'pending',
      idiom: taskData.idiom,
      sceneId: taskData.sceneId,
      sceneTitle: taskData.sceneTitle,
      progress: 0,
      total: taskData.total ?? 1,
      error: taskData.error,
      startTime: taskData.startTime,
      endTime: taskData.endTime,
      retryCount: 0,
      maxRetries: taskData.maxRetries ?? 3,
      childTaskIds: taskData.childTaskIds ?? [],
    }

    set((state) => ({
      tasks: [...state.tasks, newTask],
      totalTasks: state.totalTasks + 1,
    }))

    return taskId
  },

  // ── updateTask ────────────────────────────────────────
  updateTask: (taskId, updates) => {
    set((state) => {
      let newTasks = state.tasks.map((task) => {
        if (task.id === taskId) {
          const updatedTask = { ...task, ...updates }

          // 自动设置时间戳
          if (updates.status === 'completed' && task.status !== 'completed') {
            updatedTask.endTime = Date.now()
          }
          if (updates.status === 'failed' && task.status !== 'failed') {
            updatedTask.endTime = Date.now()
          }
          if (updates.status === 'running' && task.status !== 'running') {
            updatedTask.startTime = Date.now()
          }

          return updatedTask
        }
        return task
      })

      // 如果更新的是子任务，自动推导父 job 状态
      const updatedTask = newTasks.find(t => t.id === taskId)
      if (updatedTask?.parentId) {
        const childTasks = newTasks.filter(t => t.parentId === updatedTask.parentId)
        const derivedStatus = deriveJobStatus(childTasks)

        newTasks = newTasks.map(t => {
          if (t.id === updatedTask.parentId) {
            // 计算 job 的 progress = 已完成子任务数
            const completedChildren = childTasks.filter(c => c.status === 'completed').length
            return {
              ...t,
              status: derivedStatus,
              progress: completedChildren,
              // 如果 job 完成或失败，设置 endTime
              ...(derivedStatus === 'completed' || derivedStatus === 'failed'
                ? { endTime: Date.now() }
                : {}),
            }
          }
          return t
        })
      }

      // 重新计算统计信息
      const completedTasks = newTasks.filter(t => t.status === 'completed').length
      const failedTasks = newTasks.filter(t => t.status === 'failed').length

      return {
        tasks: newTasks,
        completedTasks,
        failedTasks,
      }
    })

    get().persistTasks()
  },

  // ── removeTask ────────────────────────────────────────
  removeTask: (taskId) => {
    set((state) => {
      const task = state.tasks.find(t => t.id === taskId)
      if (!task) return state

      // 收集要删除的 task id（自身 + 所有子任务）
      const idsToRemove = new Set<string>([taskId])
      if (task.childTaskIds) {
        task.childTaskIds.forEach(id => idsToRemove.add(id))
      }

      const removedTasks = state.tasks.filter(t => idsToRemove.has(t.id))
      const removedCompleted = removedTasks.filter(t => t.status === 'completed').length
      const removedFailed = removedTasks.filter(t => t.status === 'failed').length

      const newTasks = state.tasks.filter(t => !idsToRemove.has(t.id))
      return {
        tasks: newTasks,
        totalTasks: state.totalTasks - removedTasks.length,
        completedTasks: state.completedTasks - removedCompleted,
        failedTasks: state.failedTasks - removedFailed,
      }
    })
    get().persistTasks()
  },

  // ── pauseTask ─────────────────────────────────────────
  pauseTask: (taskId) => {
    const task = get().getTaskById(taskId)
    if (!task) return

    if (task.type === 'job') {
      // 对 job：暂停正在运行的子任务
      const childTasks = get().getChildTasks(taskId)
      const runningChild = childTasks.find(t => t.status === 'running')
      if (runningChild) {
        get().updateTask(runningChild.id, { status: 'paused' })
      }
    } else {
      // 对普通任务：如果正在运行则暂停
      if (task.status === 'running') {
        get().updateTask(taskId, { status: 'paused' })
      }
    }
  },

  // ── resumeTask ────────────────────────────────────────
  resumeTask: (taskId) => {
    const task = get().getTaskById(taskId)
    if (!task) return

    if (task.type === 'job') {
      // 对 job：恢复已暂停的子任务
      const childTasks = get().getChildTasks(taskId)
      const pausedChild = childTasks.find(t => t.status === 'paused')
      if (pausedChild) {
        get().updateTask(pausedChild.id, { status: 'running' })
      }
    } else {
      // 对普通任务：如果已暂停则恢复
      if (task.status === 'paused') {
        get().updateTask(taskId, { status: 'running' })
      }
    }
  },

  // ── cancelTask ────────────────────────────────────────
  cancelTask: (taskId) => {
    const task = get().getTaskById(taskId)
    if (!task) return

    if (task.type === 'job') {
      // 对 job：取消所有活跃子任务
      const childTasks = get().getChildTasks(taskId)
      childTasks.forEach(child => {
        if (child.status === 'pending' || child.status === 'running' || child.status === 'paused') {
          get().updateTask(child.id, { status: 'cancelled' })
        }
      })
      // 取消 job 自身
      get().updateTask(taskId, { status: 'cancelled' })
    } else {
      // 对普通任务：如果活跃则取消
      if (task.status === 'pending' || task.status === 'running' || task.status === 'paused') {
        get().updateTask(taskId, { status: 'cancelled' })
      }
    }
  },

  // ── retryTask ─────────────────────────────────────────
  retryTask: (taskId) => {
    const task = get().getTaskById(taskId)
    if (task && task.status === 'failed' && task.retryCount < task.maxRetries) {
      get().updateTask(taskId, {
        status: 'pending',
        retryCount: task.retryCount + 1,
        error: undefined,
        progress: 0,
      })
    }
  },

  // ── pauseAll ──────────────────────────────────────────
  pauseAll: () => {
    set({ isPaused: true })
    const { tasks } = get()
    tasks.forEach(task => {
      if (task.status === 'running' && task.type !== 'job') {
        get().updateTask(task.id, { status: 'paused' })
      }
    })
  },

  // ── resumeAll ─────────────────────────────────────────
  resumeAll: () => {
    set({ isPaused: false })
    const { tasks } = get()
    tasks.forEach(task => {
      if (task.status === 'paused' && task.type !== 'job') {
        get().updateTask(task.id, { status: 'running' })
      }
    })
  },

  // ── cancelAll ─────────────────────────────────────────
  cancelAll: () => {
    const { tasks } = get()
    tasks.forEach(task => {
      if (task.type === 'job') {
        get().cancelTask(task.id)
      } else if (task.status === 'pending' || task.status === 'running' || task.status === 'paused') {
        get().updateTask(task.id, { status: 'cancelled' })
      }
    })
  },

  // ── clearCompleted ────────────────────────────────────
  clearCompleted: () => {
    set((state) => ({
      tasks: state.tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled' && t.status !== 'failed'),
    }))
    get().persistTasks()
  },

  // ── getTaskById ───────────────────────────────────────
  getTaskById: (taskId) => {
    return get().tasks.find(t => t.id === taskId)
  },

  // ── getChildTasks ─────────────────────────────────────
  getChildTasks: (jobId) => {
    return get().tasks.filter(t => t.parentId === jobId)
  },

  // ── getJobProgress ────────────────────────────────────
  getJobProgress: (jobId) => {
    const childTasks = get().getChildTasks(jobId)
    const total = childTasks.length
    const completed = childTasks.filter(t => t.status === 'completed').length
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0
    return { completed, total, percent }
  },

  // ── getJobQueue ───────────────────────────────────────
  getJobQueue: () => {
    return get().tasks.filter(t => t.type === 'job')
  },

  // ── dequeueNextJob ────────────────────────────────────
  dequeueNextJob: () => {
    const jobs = get().getJobQueue()
    const nextJob = jobs.find(j => j.status === 'pending')

    if (nextJob) {
      get().updateTask(nextJob.id, { status: 'running' })
      return get().getTaskById(nextJob.id)
    }

    return undefined
  },

  // ── getTasksByStatus（向后兼容） ──────────────────────
  getTasksByStatus: (status) => {
    return get().tasks.filter(t => t.status === status)
  },

  // ── getTasksByType（向后兼容） ────────────────────────
  getTasksByType: (type) => {
    return get().tasks.filter(t => t.type === type)
  },

  // ── reset ─────────────────────────────────────────────
  reset: () => {
    set({
      tasks: [],
      isRunning: false,
      isPaused: false,
      currentTaskId: null,
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
    })
  },

  // ── 持久化 ─────────────────────────────────────────────
  persistTasks: () => {
    const { tasks } = get()
    saveTasks(tasks).catch(console.error)
  },

  loadPersistedTasks: async () => {
    const tasks = await loadTasks()
    if (tasks.length === 0) return
    // 恢复任务，但将 running 状态标记为 failed（页面刷新意味着中断）
    const restored = tasks.map(t => ({
      ...t,
      status: t.status === 'running' ? 'failed' as const : t.status,
      error: t.status === 'running' ? '页面刷新，执行中断' : t.error,
    }))
    set({ tasks: restored })
  },
}))
