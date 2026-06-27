'use client'

import { useState, useCallback } from 'react'
import { useTaskStore, type TaskStatus } from '@/lib/task-store'
import type { Task } from '@/lib/task-store'
import { TaskCard } from './TaskCard'

interface TaskQueueProps {
  compact?: boolean
}

type FilterStatus = TaskStatus | 'all'

export function TaskQueue({ compact = false }: TaskQueueProps) {
  const { getJobQueue, pauseAll, resumeAll, cancelAll, clearCompleted } = useTaskStore()
  const jobs = getJobQueue()
  const [filter, setFilter] = useState<FilterStatus>('all')

  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set())

  const toggleExpand = useCallback((jobId: string) => {
    setExpandedJobs(prev => {
      const next = new Set(prev)
      next.has(jobId) ? next.delete(jobId) : next.add(jobId)
      return next
    })
  }, [])

  const filtered = filter === 'all' ? jobs : jobs.filter(j => j.status === filter)

  const runningJobs = filtered.filter(j => j.status === 'running')
  const pausedJobs = filtered.filter(j => j.status === 'paused')
  const pendingJobs = filtered.filter(j => j.status === 'pending')
  const failedJobs = filtered.filter(j => j.status === 'failed')
  const completedJobs = filtered.filter(j => j.status === 'completed' || j.status === 'cancelled')

  const statusLabels: Record<FilterStatus, string> = {
    all: '全部', pending: '等待中', running: '执行中', paused: '已暂停',
    completed: '已完成', failed: '失败', cancelled: '已取消',
  }

  const orderedGroups: { label: string; color: string; jobs: Task[] }[] = [
    { label: '执行中', color: 'bg-blue-500 animate-pulse', jobs: runningJobs },
    { label: '已暂停', color: 'bg-orange-500', jobs: pausedJobs },
    { label: '等待中', color: 'bg-yellow-500', jobs: pendingJobs },
    { label: '失败', color: 'bg-red-500', jobs: failedJobs },
    { label: '已完成', color: 'bg-green-500', jobs: completedJobs },
  ]

  const maxItems = compact ? 3 : 10
  const hasActive = runningJobs.length > 0 || pendingJobs.length > 0 || pausedJobs.length > 0

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">📋 任务队列</h2>
          <p className="text-white/70 text-xs mt-0.5">
            {jobs.length} 个任务 | {completedJobs.length} 完成 | {failedJobs.length} 失败
          </p>
        </div>
        {hasActive && (
          <div className="flex gap-2">
            {runningJobs.length > 0 && (
              <button onClick={pauseAll} className="px-2 py-1 text-xs bg-white/20 text-white rounded hover:bg-white/30">⏸ 全部暂停</button>
            )}
            {pausedJobs.length > 0 && (
              <button onClick={resumeAll} className="px-2 py-1 text-xs bg-white/20 text-white rounded hover:bg-white/30">▶ 全部继续</button>
            )}
            <button onClick={cancelAll} className="px-2 py-1 text-xs bg-red-500/80 text-white rounded hover:bg-red-500">✕ 取消全部</button>
          </div>
        )}
      </div>

      {/* Stats */}
      {jobs.length > 0 && (
        <div className="grid grid-cols-5 gap-2 p-3 bg-gray-50 border-b border-gray-100 text-center">
          <div><div className="text-lg font-bold text-yellow-500">{pendingJobs.length}</div><div className="text-xs text-gray-500">等待</div></div>
          <div><div className="text-lg font-bold text-blue-500">{runningJobs.length + pausedJobs.length}</div><div className="text-xs text-gray-500">执行中</div></div>
          <div><div className="text-lg font-bold text-green-500">{completedJobs.length}</div><div className="text-xs text-gray-500">完成</div></div>
          <div><div className="text-lg font-bold text-red-500">{failedJobs.length}</div><div className="text-xs text-gray-500">失败</div></div>
          <div><div className="text-lg font-bold text-gray-700">{jobs.length}</div><div className="text-xs text-gray-500">总计</div></div>
        </div>
      )}

      {/* Filter */}
      {jobs.length > 0 && (
        <div className="px-3 pt-3">
          <select value={filter} onChange={e => setFilter(e.target.value as FilterStatus)}
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200">
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Job list */}
      <div className="p-3 space-y-3 max-h-[400px] overflow-y-auto">
        {jobs.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <div className="text-3xl mb-2">📭</div><p>暂无任务</p>
          </div>
        ) : (
          orderedGroups.map(group =>
            group.jobs.length > 0 ? (
              <div key={group.label} className="space-y-2">
                <h3 className="text-sm font-medium text-gray-500 flex items-center">
                  <span className={`w-2 h-2 rounded-full mr-2 ${group.color}`}></span>
                  {group.label} ({group.jobs.length})
                </h3>
                {group.jobs.slice(0, maxItems).map(job => (
                  <TaskCard key={job.id} task={job} expanded={expandedJobs.has(job.id)} onToggle={() => toggleExpand(job.id)} />
                ))}
              </div>
            ) : null
          )
        )}
      </div>

      {/* Footer */}
      {(completedJobs.length > 0 || failedJobs.length > 0) && (
        <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
          <button onClick={clearCompleted} className="text-xs text-gray-500 hover:text-gray-700">🧹 清除已完成和失败</button>
        </div>
      )}
    </div>
  )
}
