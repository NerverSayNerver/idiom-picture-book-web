'use client'

import type { Task, TaskStatus } from '@/lib/task-store'
import { useTaskStore } from '@/lib/task-store'

interface TaskCardProps {
  task: Task
  showActions?: boolean
}

// 状态配置
const statusConfig: Record<TaskStatus, { color: string; icon: string; label: string }> = {
  pending: { color: 'bg-yellow-100 text-yellow-800', icon: '⏳', label: '等待中' },
  running: { color: 'bg-blue-100 text-blue-800', icon: '🔄', label: '执行中' },
  paused: { color: 'bg-orange-100 text-orange-800', icon: '⏸️', label: '已暂停' },
  completed: { color: 'bg-green-100 text-green-800', icon: '✅', label: '已完成' },
  failed: { color: 'bg-red-100 text-red-800', icon: '❌', label: '失败' },
  cancelled: { color: 'bg-gray-100 text-gray-800', icon: '🚫', label: '已取消' },
}

// 任务类型配置
const typeConfig: Record<string, { icon: string; label: string }> = {
  job: { icon: '📋', label: '成语任务' },
  decompose: { icon: '🤖', label: '场景拆分' },
  generate: { icon: '🎨', label: '图像生成' },
  save: { icon: '💾', label: '保存绘本' },
}

export function TaskCard({ task, showActions = true }: TaskCardProps) {
  const { pauseTask, resumeTask, cancelTask, retryTask } = useTaskStore()
  
  const status = statusConfig[task.status]
  const type = typeConfig[task.type] || { icon: '❓', label: '未知任务' }
  
  // 计算进度百分比
  const progressPercent = task.total ? Math.round((task.progress / task.total) * 100) : 0
  
  // 格式化时间
  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) {
      return `${hours}小时${minutes % 60}分钟`
    }
    if (minutes > 0) {
      return `${minutes}分钟${seconds % 60}秒`
    }
    return `${seconds}秒`
  }
  
  // 计算预计剩余时间
  const getEstimatedTime = () => {
    if (!task.startTime || task.status !== 'running') return null
    
    const elapsed = Date.now() - task.startTime
    if (task.progress === 0) return null
    
    const rate = task.progress / elapsed
    const remaining = (task.total || 0) - task.progress
    const estimatedMs = remaining / rate
    
    return formatTime(estimatedMs)
  }
  
  // 计算已用时间
  const getElapsedTime = () => {
    if (!task.startTime) return null
    
    const endTime = task.endTime || Date.now()
    const elapsed = endTime - task.startTime
    
    return formatTime(elapsed)
  }

  return (
    <div className="bg-white rounded-card p-4 shadow-md border border-gray-100 hover:shadow-lg transition-shadow">
      {/* 头部：任务类型和状态 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <span className="text-lg">{type.icon}</span>
          <span className="font-medium text-gray-800">{type.label}</span>
          {task.sceneTitle && (
            <span className="text-sm text-gray-500">- {task.sceneTitle}</span>
          )}
        </div>
        
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
          {status.icon} {status.label}
        </span>
      </div>

      {/* 进度条 */}
      {(task.status === 'running' || task.status === 'paused') && (
        <div className="mb-3">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>进度</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* 信息行 */}
      <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
        <div className="flex items-center space-x-4">
          {task.startTime && (
            <span>⏱️ 已用: {getElapsedTime()}</span>
          )}
          {task.status === 'running' && (
            <span>⏳ 剩余: {getEstimatedTime()}</span>
          )}
        </div>
        
        {task.retryCount > 0 && (
          <span className="text-orange-500">
            🔄 重试 {task.retryCount}/{task.maxRetries}
          </span>
        )}
      </div>

      {/* 错误信息 */}
      {task.error && (
        <div className="bg-red-50 rounded-md p-2 mb-3 text-sm text-red-700">
          ❌ {task.error}
        </div>
      )}

      {/* 操作按钮 */}
      {showActions && (
        <div className="flex items-center justify-end space-x-2">
          {task.status === 'running' && (
            <button
              onClick={() => pauseTask(task.id)}
              className="px-3 py-1 text-sm bg-yellow-100 text-yellow-700 rounded-md hover:bg-yellow-200 transition-colors"
            >
              ⏸️ 暂停
            </button>
          )}
          
          {task.status === 'paused' && (
            <button
              onClick={() => resumeTask(task.id)}
              className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors"
            >
              ▶️ 继续
            </button>
          )}
          
          {(task.status === 'pending' || task.status === 'running' || task.status === 'paused') && (
            <button
              onClick={() => cancelTask(task.id)}
              className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors"
            >
              ❌ 取消
            </button>
          )}
          
          {task.status === 'failed' && task.retryCount < task.maxRetries && (
            <button
              onClick={() => retryTask(task.id)}
              className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded-md hover:bg-green-200 transition-colors"
            >
              🔄 重试
            </button>
          )}
        </div>
      )}
    </div>
  )
}
