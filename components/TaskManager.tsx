'use client'

import { useState } from 'react'
import { useTaskStore, type Task, type TaskStatus } from '@/lib/task-store'

interface TaskManagerProps {
  onTaskSelect?: (task: Task) => void
}

export function TaskManager({ onTaskSelect }: TaskManagerProps) {
  const { tasks, pauseAll, resumeAll, cancelAll, clearCompleted } = useTaskStore()
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all')
  const [sortBy, setSortBy] = useState<'priority' | 'time' | 'status'>('time')

  // 过滤任务
  const filteredTasks = tasks.filter(task => {
    if (filter === 'all') return true
    return task.status === filter
  })

  // 排序任务
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    switch (sortBy) {
      case 'priority':
        // 按优先级排序：running > paused > pending > failed > completed > cancelled
        const priorityOrder: Record<TaskStatus, number> = {
          running: 0,
          paused: 1,
          pending: 2,
          failed: 3,
          completed: 4,
          cancelled: 5,
        }
        return priorityOrder[a.status] - priorityOrder[b.status]
      
      case 'time':
        // 按时间排序：最新的在前
        return (b.startTime || 0) - (a.startTime || 0)
      
      case 'status':
        // 按状态分组
        return a.status.localeCompare(b.status)
      
      default:
        return 0
    }
  })

  // 统计信息
  const stats = {
    total: tasks.length,
    running: tasks.filter(t => t.status === 'running').length,
    pending: tasks.filter(t => t.status === 'pending').length,
    paused: tasks.filter(t => t.status === 'paused').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    failed: tasks.filter(t => t.status === 'failed').length,
    cancelled: tasks.filter(t => t.status === 'cancelled').length,
  }

  // 状态颜色映射
  const statusColors: Record<TaskStatus, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    running: 'bg-blue-100 text-blue-800',
    paused: 'bg-orange-100 text-orange-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-800',
  }

  // 状态标签
  const statusLabels: Record<TaskStatus, string> = {
    pending: '等待中',
    running: '执行中',
    paused: '已暂停',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
  }

  return (
    <div className="bg-white rounded-card shadow-lg overflow-hidden">
      {/* 头部 */}
      <div className="bg-gradient-to-r from-gray-700 to-gray-900 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">⚙️ 任务管理器</h2>
            <p className="text-white/80 text-sm mt-1">
              共 {stats.total} 个任务
            </p>
          </div>
          
          <div className="flex items-center space-x-2">
            {stats.running > 0 && (
              <button
                onClick={pauseAll}
                className="px-3 py-1.5 text-sm bg-yellow-500/80 text-white rounded-md hover:bg-yellow-500 transition-colors"
              >
                ⏸️ 全部暂停
              </button>
            )}
            
            {stats.paused > 0 && (
              <button
                onClick={resumeAll}
                className="px-3 py-1.5 text-sm bg-blue-500/80 text-white rounded-md hover:bg-blue-500 transition-colors"
              >
                ▶️ 全部继续
              </button>
            )}
            
            {(stats.running > 0 || stats.pending > 0 || stats.paused > 0) && (
              <button
                onClick={cancelAll}
                className="px-3 py-1.5 text-sm bg-red-500/80 text-white rounded-md hover:bg-red-500 transition-colors"
              >
                ❌ 全部取消
              </button>
            )}
            
            {stats.completed > 0 && (
              <button
                onClick={clearCompleted}
                className="px-3 py-1.5 text-sm bg-gray-500/80 text-white rounded-md hover:bg-gray-500 transition-colors"
              >
                🧹 清除已完成
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 统计面板 */}
      <div className="grid grid-cols-7 gap-2 p-4 bg-gray-50 border-b border-gray-100">
        <div className="text-center p-2 rounded-lg bg-white shadow-sm">
          <div className="text-lg font-bold text-gray-800">{stats.total}</div>
          <div className="text-xs text-gray-500">总计</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-white shadow-sm">
          <div className="text-lg font-bold text-blue-500">{stats.running}</div>
          <div className="text-xs text-gray-500">执行中</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-white shadow-sm">
          <div className="text-lg font-bold text-yellow-500">{stats.pending}</div>
          <div className="text-xs text-gray-500">等待中</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-white shadow-sm">
          <div className="text-lg font-bold text-orange-500">{stats.paused}</div>
          <div className="text-xs text-gray-500">已暂停</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-white shadow-sm">
          <div className="text-lg font-bold text-green-500">{stats.completed}</div>
          <div className="text-xs text-gray-500">已完成</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-white shadow-sm">
          <div className="text-lg font-bold text-red-500">{stats.failed}</div>
          <div className="text-xs text-gray-500">失败</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-white shadow-sm">
          <div className="text-lg font-bold text-gray-500">{stats.cancelled}</div>
          <div className="text-xs text-gray-500">已取消</div>
        </div>
      </div>

      {/* 过滤和排序 */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">状态过滤:</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as TaskStatus | 'all')}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">全部</option>
              <option value="running">执行中</option>
              <option value="pending">等待中</option>
              <option value="paused">已暂停</option>
              <option value="completed">已完成</option>
              <option value="failed">失败</option>
              <option value="cancelled">已取消</option>
            </select>
          </div>
          
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">排序方式:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'priority' | 'time' | 'status')}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="time">按时间</option>
              <option value="priority">按优先级</option>
              <option value="status">按状态</option>
            </select>
          </div>
        </div>
      </div>

      {/* 任务列表 */}
      <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
        {sortedTasks.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-2">📭</div>
            <p>暂无任务</p>
          </div>
        ) : (
          sortedTasks.map(task => (
            <div
              key={task.id}
              className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors cursor-pointer"
              onClick={() => onTaskSelect?.(task)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[task.status]}`}>
                    {statusLabels[task.status]}
                  </span>
                  <div>
                    <div className="font-medium text-gray-800">
                      {task.type === 'job' && '📋 成语任务'}
                      {task.type === 'decompose' && '🤖 场景拆分'}
                      {task.type === 'generate' && '🎨 图像生成'}
                      {task.type === 'save' && '💾 保存绘本'}
                    </div>
                    {task.sceneTitle && (
                      <div className="text-sm text-gray-500">{task.sceneTitle}</div>
                    )}
                  </div>
                </div>
                
                <div className="text-right text-sm text-gray-500">
                  {task.startTime && (
                    <div>
                      {new Date(task.startTime).toLocaleTimeString()}
                    </div>
                  )}
                  {task.progress !== undefined && task.total !== undefined && (
                    <div className="text-xs">
                      {task.progress}/{task.total}
                    </div>
                  )}
                </div>
              </div>
              
              {task.error && (
                <div className="mt-2 text-sm text-red-600 bg-red-50 rounded-md p-2">
                  ❌ {task.error}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* 底部信息 */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 text-sm text-gray-500">
        提示: 点击任务可以查看详情，使用顶部按钮可以批量管理任务
      </div>
    </div>
  )
}
