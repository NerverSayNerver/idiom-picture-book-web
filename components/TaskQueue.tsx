'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTaskStore, type TaskStatus } from '@/lib/task-store'
import type { Task } from '@/lib/task-store'
import { TaskCard } from './TaskCard'

interface TaskQueueProps {
  compact?: boolean
  className?: string
}

type FilterMode = 'all' | 'pending' | 'running' | 'paused' | 'completed' | 'failed'

export function TaskQueue({ compact = false, className = '' }: TaskQueueProps) {
  const { tasks, pauseAll, resumeAll, cancelAll, clearCompleted } = useTaskStore()
  // 使用 useMemo 稳定 jobs 引用，避免每次渲染创建新数组
  const jobs = useMemo(() => tasks.filter(t => t.type === 'job'), [tasks])
  const [filter, setFilter] = useState<FilterMode>('all')
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set())
  const [notify, setNotify] = useState<string | null>(null)

  // ── 完成通知 ──────────────────────────────────────────
  const [hadActiveJobs, setHadActiveJobs] = useState(false)

  useEffect(() => {
    const activeJobs = jobs.filter(j => ['pending', 'running', 'paused'].includes(j.status))
    if (activeJobs.length > 0) {
      setHadActiveJobs(true)
    } else if (hadActiveJobs && jobs.length > 0) {
      const completed = jobs.filter(j => j.status === 'completed').length
      const failed = jobs.filter(j => j.status === 'failed').length
      if (completed > 0 || failed > 0) {
        const msg = completed > 0 && failed === 0
          ? `✅ 全部完成！成功生成 ${completed} 个绘本`
          : failed > 0 && completed === 0
          ? `❌ 全部失败，共 ${failed} 个任务失败`
          : `✅ ${completed} 个成功，❌ ${failed} 个失败`
        setNotify(msg)
        setTimeout(() => setNotify(null), 4000)
      }
      setHadActiveJobs(false)
    }
  }, [jobs, hadActiveJobs])

  const toggleExpand = useCallback((jobId: string) => {
    setExpandedJobs(prev => {
      const next = new Set(prev)
      next.has(jobId) ? next.delete(jobId) : next.add(jobId)
      return next
    })
  }, [])

  // ── 统计数据（不受筛选影响） ──────────────────────────
  const stats = {
    pending: jobs.filter(j => j.status === 'pending').length,
    running: jobs.filter(j => j.status === 'running').length,
    paused: jobs.filter(j => j.status === 'paused').length,
    completed: jobs.filter(j => j.status === 'completed').length,
    failed: jobs.filter(j => j.status === 'failed').length,
    cancelled: jobs.filter(j => j.status === 'cancelled').length,
  }

  // ── 筛选逻辑 ──────────────────────────────────────────
  const filteredJobs = filter === 'all' ? jobs : jobs.filter(j => {
    switch (filter) {
      case 'pending': return j.status === 'pending'
      case 'running': return j.status === 'running' || j.status === 'paused'
      case 'paused': return j.status === 'paused'
      case 'completed': return j.status === 'completed' || j.status === 'cancelled'
      case 'failed': return j.status === 'failed'
      default: return true
    }
  })

  const runningJobs = filteredJobs.filter(j => j.status === 'running')
  const pausedJobs = filteredJobs.filter(j => j.status === 'paused')
  const pendingJobs = filteredJobs.filter(j => j.status === 'pending')
  const failedJobs = filteredJobs.filter(j => j.status === 'failed')
  const completedJobs = filteredJobs.filter(j => j.status === 'completed' || j.status === 'cancelled')

  const hasActive = stats.pending > 0 || stats.running > 0 || stats.paused > 0
  const hasCompleted = stats.completed > 0 || stats.cancelled > 0 || stats.failed > 0

  // ── 统计栏点击筛选（点击相同状态恢复全部） ──────────
  const toggleFilter = useCallback((mode: FilterMode) => {
    setFilter(prev => prev === mode ? 'all' : mode)
  }, [])

  // ── 分组 ──────────────────────────────────────────────
  const orderedGroups: { label: string; color: string; jobs: Task[] }[] = [
    { label: '执行中', color: 'bg-blue-500 animate-pulse', jobs: runningJobs },
    { label: '已暂停', color: 'bg-orange-500', jobs: pausedJobs },
    { label: '等待中', color: 'bg-yellow-500', jobs: pendingJobs },
    { label: '失败', color: 'bg-red-500', jobs: failedJobs },
    { label: '已完成', color: 'bg-green-500', jobs: completedJobs },
  ]

  // ── 折叠状态管理 ──────────────────────────────────────
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const toggleGroupCollapse = useCallback((label: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      next.has(label) ? next.delete(label) : next.add(label)
      return next
    })
  }, [])

  // ── 统计栏配置 ────────────────────────────────────────
  const statItems: { label: string; mode: FilterMode; count: number; activeClass: string; defaultClass: string }[] = [
    { label: '等待', mode: 'pending', count: stats.pending, activeClass: 'text-yellow-500 ring-2 ring-yellow-300', defaultClass: 'text-yellow-500' },
    { label: '执行中', mode: 'running', count: stats.running + stats.paused, activeClass: 'text-blue-500 ring-2 ring-blue-300', defaultClass: 'text-blue-500' },
    { label: '完成', mode: 'completed', count: stats.completed + stats.cancelled, activeClass: 'text-green-500 ring-2 ring-green-300', defaultClass: 'text-green-500' },
    { label: '失败', mode: 'failed', count: stats.failed, activeClass: 'text-red-500 ring-2 ring-red-300', defaultClass: 'text-red-500' },
    { label: '总计', mode: 'all', count: jobs.length, activeClass: 'text-gray-700 ring-2 ring-gray-300', defaultClass: 'text-gray-700' },
  ]

  return (
    <div className={`bg-white rounded-lg shadow-md overflow-hidden relative flex flex-col ${className}`}>
      {/* Notification toast */}
      {notify && (
        <div className="absolute top-0 left-0 right-0 z-10 px-4 py-3 bg-green-50 border-b border-green-200 text-green-800 text-sm font-medium animate-slideDown">
          {notify}
        </div>
      )}

      {/* Header */}
      <div className={`bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3 flex items-center justify-between ${notify ? 'pt-12' : ''}`}>
        <div>
          <h2 className="text-lg font-bold text-white">📋 任务队列</h2>
          <p className="text-white/70 text-xs mt-0.5">
            {jobs.length} 个任务 | {stats.completed} 完成 | {stats.failed} 失败
          </p>
        </div>
        {hasActive && (
          <div className="flex gap-2">
            {stats.running > 0 && (
              <button onClick={pauseAll} className="px-2 py-1 text-xs bg-white/20 text-white rounded hover:bg-white/30">⏸ 全部暂停</button>
            )}
            {stats.paused > 0 && (
              <button onClick={resumeAll} className="px-2 py-1 text-xs bg-white/20 text-white rounded hover:bg-white/30">▶ 全部继续</button>
            )}
            <button onClick={cancelAll} className="px-2 py-1 text-xs bg-red-500/80 text-white rounded hover:bg-red-500">✕ 取消全部</button>
          </div>
        )}
      </div>

      {/* 可点击的统计栏 */}
      {jobs.length > 0 && (
        <div className="grid grid-cols-5 gap-2 p-3 bg-gray-50 border-b border-gray-100 text-center">
          {statItems.map(item => (
            <button
              key={item.label}
              onClick={() => toggleFilter(item.mode)}
              className={`rounded-lg p-1 transition-all cursor-pointer hover:bg-gray-100 ${
                filter === item.mode ? 'bg-white shadow-sm ' + item.activeClass : item.defaultClass
              }`}
            >
              <div className="text-lg font-bold">{item.count}</div>
              <div className="text-xs text-gray-500">{item.label}</div>
            </button>
          ))}
        </div>
      )}

      {/* Job list */}
      <div className="p-3 space-y-3 flex-1 overflow-y-auto min-h-0 [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar]:h-0">
        {jobs.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <div className="text-3xl mb-2">📭</div><p>暂无任务</p>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p>当前筛选条件下无匹配任务</p>
          </div>
        ) : (
          orderedGroups.map(group =>
            group.jobs.length > 0 ? (
              <div key={group.label} className="space-y-2">
                <h3
                  className="text-sm font-medium text-gray-500 flex items-center cursor-pointer select-none hover:text-gray-700"
                  onClick={() => toggleGroupCollapse(group.label)}
                >
                  <span className={`w-2 h-2 rounded-full mr-2 ${group.color}`}></span>
                  {group.label} ({group.jobs.length})
                  <span className="ml-1 text-xs text-gray-400">{collapsedGroups.has(group.label) ? '▶' : '▼'}</span>
                </h3>
                {!collapsedGroups.has(group.label) && group.jobs.map(job => (
                  <TaskCard key={job.id} task={job} expanded={expandedJobs.has(job.id)} onToggle={() => toggleExpand(job.id)} />
                ))}
              </div>
            ) : null
          )
        )}
      </div>

      {/* Footer */}
      {hasCompleted && (
        <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
          <button onClick={clearCompleted} className="text-xs text-gray-500 hover:text-gray-700">🧹 清除已完成/已取消</button>
          {stats.failed > 0 && (
            <span className="text-xs text-orange-500">失败任务可点击展开后重试</span>
          )}
        </div>
      )}
    </div>
  )
}
