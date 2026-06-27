'use client'

import { useState } from 'react'
import { useTaskStore, type TaskStatus } from '@/lib/task-store'
import { TaskCard } from './TaskCard'

export function TaskManager() {
  const { getJobQueue, pauseAll, resumeAll, cancelAll, clearCompleted } = useTaskStore()
  const jobs = getJobQueue()
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all')
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set())

  const filtered = filter === 'all' ? jobs : jobs.filter(j => j.status === filter)

  const toggleJob = (jobId: string) => {
    setExpandedJobs(prev => {
      const next = new Set(prev)
      next.has(jobId) ? next.delete(jobId) : next.add(jobId)
      return next
    })
  }

  const stats = {
    total: jobs.length,
    running: jobs.filter(j => j.status === 'running').length,
    pending: jobs.filter(j => j.status === 'pending').length,
    paused: jobs.filter(j => j.status === 'paused').length,
    completed: jobs.filter(j => j.status === 'completed').length,
    failed: jobs.filter(j => j.status === 'failed').length,
    cancelled: jobs.filter(j => j.status === 'cancelled').length,
  }

  const statusLabels: Record<string, string> = {
    all: '全部', pending: '等待中', running: '执行中', paused: '已暂停',
    completed: '已完成', failed: '失败', cancelled: '已取消',
  }

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      <div className="bg-gradient-to-r from-gray-700 to-gray-900 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">⚙️ 任务管理器</h2>
            <p className="text-white/70 text-xs">共 {stats.total} 个任务</p>
          </div>
          <div className="flex gap-2">
            {stats.running > 0 && <button onClick={pauseAll} className="px-2 py-1 text-xs bg-yellow-500/80 text-white rounded hover:bg-yellow-500">⏸ 全部暂停</button>}
            {stats.paused > 0 && <button onClick={resumeAll} className="px-2 py-1 text-xs bg-blue-500/80 text-white rounded hover:bg-blue-500">▶ 全部继续</button>}
            {(stats.running + stats.pending + stats.paused) > 0 && <button onClick={cancelAll} className="px-2 py-1 text-xs bg-red-500/80 text-white rounded hover:bg-red-500">✕ 全部取消</button>}
            {stats.completed > 0 && <button onClick={clearCompleted} className="px-2 py-1 text-xs bg-gray-500/80 text-white rounded hover:bg-gray-500">🧹 清除已完成</button>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 p-3 bg-gray-50 border-b border-gray-100 text-center">
        <div><div className="text-lg font-bold text-gray-800">{stats.total}</div><div className="text-xs text-gray-500">总计</div></div>
        <div><div className="text-lg font-bold text-blue-500">{stats.running}</div><div className="text-xs text-gray-500">执行中</div></div>
        <div><div className="text-lg font-bold text-yellow-500">{stats.pending}</div><div className="text-xs text-gray-500">等待</div></div>
        <div><div className="text-lg font-bold text-orange-500">{stats.paused}</div><div className="text-xs text-gray-500">暂停</div></div>
        <div><div className="text-lg font-bold text-green-500">{stats.completed}</div><div className="text-xs text-gray-500">完成</div></div>
        <div><div className="text-lg font-bold text-red-500">{stats.failed}</div><div className="text-xs text-gray-500">失败</div></div>
        <div><div className="text-lg font-bold text-gray-500">{stats.cancelled}</div><div className="text-xs text-gray-500">取消</div></div>
      </div>

      <div className="p-3 border-b border-gray-100">
        <select value={filter} onChange={e => setFilter(e.target.value as TaskStatus | 'all')}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200">
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="p-3 space-y-2 max-h-[500px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <div className="text-3xl mb-2">📭</div><p>暂无任务</p>
          </div>
        ) : filtered.map(job => (
          <TaskCard key={job.id} task={job} expanded={expandedJobs.has(job.id)} onToggle={() => toggleJob(job.id)} />
        ))}
      </div>
    </div>
  )
}
