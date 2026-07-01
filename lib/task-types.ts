// ── 任务类型定义（共享） ──────────────────────────────────
// 供 API route、worker、前端共用，不依赖 Zustand store

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
  category?: string
  sourceText?: string
  idiom?: string
  sceneId?: number
  sceneTitle?: string
  imageUrl?: string
  progress: number
  total: number
  error?: string
  startTime?: number
  endTime?: number
  retryCount: number
  maxRetries: number
  childTaskIds: string[]
  decomposeMeaning?: string
  decomposeCharacterDescription?: string
  decomposeStyleDescription?: string
  decomposeScenesJson?: string
  createdAt?: number
  updatedAt?: number
  /** 使用的完整 prompt 文本（LLM 或生图 prompt） */
  prompt?: string
  /** 等待中任务的排序序号（越小越前） */
  sortOrder?: number
}

export interface ChildTaskDef {
  type: TaskType
  sceneId?: number
  sceneTitle?: string
  total?: number
  maxRetries?: number
}

/**
 * 根据子任务状态推导 job 状态
 */
export function deriveJobStatus(childTasks: Task[]): TaskStatus {
  if (childTasks.length === 0) return 'pending'

  const statuses = new Set(childTasks.map(t => t.status))

  if (childTasks.every(t => t.status === 'completed')) return 'completed'
  if (statuses.has('running')) return 'running'
  if (statuses.has('failed')) return 'failed'
  if (statuses.has('paused')) return 'paused'
  if (statuses.has('cancelled')) return 'cancelled'
  return 'pending'
}
