'use client'

import type { Task, TaskStatus, TaskType } from '@/lib/task-store'
import { useTaskStore } from '@/lib/task-store'
import Link from 'next/link'

interface TaskCardProps {
  task: Task
  expanded?: boolean
  onToggle?: () => void
  showActions?: boolean
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

const statusConfig: Record<TaskStatus, { color: string; icon: string; label: string }> = {
  pending: { color: 'bg-yellow-100 text-yellow-800', icon: '⏳', label: '等待中' },
  running: { color: 'bg-blue-100 text-blue-800', icon: '🔄', label: '执行中' },
  paused: { color: 'bg-orange-100 text-orange-800', icon: '⏸️', label: '已暂停' },
  completed: { color: 'bg-green-100 text-green-800', icon: '✅', label: '已完成' },
  failed: { color: 'bg-red-100 text-red-800', icon: '❌', label: '失败' },
  cancelled: { color: 'bg-gray-100 text-gray-800', icon: '🚫', label: '已取消' },
}

const typeIcons: Record<TaskType, string> = {
  job: '📋',
  decompose: '🤖',
  generate: '🎨',
  save: '💾',
}

const indicatorColor: Record<TaskStatus, string> = {
  pending: 'bg-gray-300',
  running: 'bg-blue-500 animate-pulse',
  paused: 'bg-orange-500',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  cancelled: 'bg-gray-400',
}

const indicatorIcon: Record<TaskStatus, string> = {
  pending: '',
  running: '↻',
  paused: '⏸',
  completed: '✓',
  failed: '✕',
  cancelled: '',
}

// ── Child Task Row ──────────────────────────────────────────

function ChildTaskRow({ task, showActions }: { task: Task; showActions: boolean }) {
  const { retryTask } = useTaskStore()
  const elapsed = task.startTime ? formatDuration((task.endTime || Date.now()) - task.startTime) : null
  const progressPercent = task.total > 0 ? Math.round((task.progress / task.total) * 100) : 0

  return (
    <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
      <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold ${indicatorColor[task.status]}`}>
        {indicatorIcon[task.status]}
      </div>
      <span className="text-lg">{typeIcons[task.type] ?? '❓'}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800 truncate">{task.sceneTitle ?? '未命名'}</div>
        {task.status === 'running' && task.total > 0 && (
          <div className="mt-1">
            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
            </div>
            <span className="text-xs text-gray-500">{progressPercent}%</span>
          </div>
        )}
        {task.status === 'failed' && task.retryCount > 0 && (
          <span className="text-xs text-orange-500">🔄 重试 {task.retryCount}/{task.maxRetries}</span>
        )}
      </div>
      {elapsed && <span className="text-xs text-gray-400 flex-shrink-0">⏱️ {elapsed}</span>}
      {showActions && task.status === 'failed' && task.retryCount < (task.maxRetries ?? 3) && (
        <button onClick={() => retryTask(task.id)} className="flex-shrink-0 px-2 py-1 text-xs bg-green-100 text-green-700 rounded-md hover:bg-green-200 transition-colors">🔄 重试</button>
      )}
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────

export function TaskCard({ task, expanded = false, onToggle, showActions = true }: TaskCardProps) {
  const { pauseTask, resumeTask, cancelTask, getChildTasks, getJobProgress } = useTaskStore()
  const status = statusConfig[task.status]
  const elapsed = task.startTime ? formatDuration((task.endTime || Date.now()) - task.startTime) : null

  if (task.type === 'job') {
    const progress = getJobProgress(task.id)
    const childTasks = getChildTasks(task.id)

    return (
      <div className="bg-white rounded-lg border border-gray-100 overflow-hidden shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors" onClick={onToggle}>
          <div className="flex items-center space-x-2">
            <span className="text-xs text-gray-400 w-4">{expanded ? '▼' : '▶'}</span>
            <span className="text-lg">📚</span>
            <span className="font-medium text-gray-800">{task.idiom ?? '未知成语'}</span>
          </div>
          <div className="flex items-center space-x-3">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>{status.icon} {status.label}</span>
            {elapsed && <span className="text-xs text-gray-400">⏱️ {elapsed}</span>}
          </div>
        </div>

        {/* Progress */}
        {progress.total > 0 && (
          <div className="px-4 pb-2">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>进度</span><span>{progress.completed}/{progress.total} ({progress.percent}%)</span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-300" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        )}

        {/* Actions */}
        {showActions && (
          <div className="flex items-center justify-end space-x-2 px-4 pb-3">
            {task.status === 'running' && <button onClick={() => pauseTask(task.id)} className="px-3 py-1 text-xs bg-yellow-100 text-yellow-700 rounded-md hover:bg-yellow-200 transition-colors">⏸️ 暂停</button>}
            {task.status === 'paused' && <button onClick={() => resumeTask(task.id)} className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors">▶️ 继续</button>}
            {['pending', 'running', 'paused'].includes(task.status) && <button onClick={() => cancelTask(task.id)} className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors">❌ 取消</button>}
            {task.status === 'completed' && <Link href="/library" className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded-md hover:bg-green-200 transition-colors">📖 查看绘本</Link>}
          </div>
        )}

        {/* Expanded children */}
        {expanded && childTasks.length > 0 && (
          <div className="px-4 pb-3 pl-8 space-y-2 border-l-2 border-gray-200 ml-4">
            {childTasks.map(child => <ChildTaskRow key={child.id} task={child} showActions={showActions} />)}
          </div>
        )}
      </div>
    )
  }

  return <ChildTaskRow task={task} showActions={showActions} />
}
