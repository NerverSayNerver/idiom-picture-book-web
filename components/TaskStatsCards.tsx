'use client'

import Link from 'next/link'
import { useJobs } from '@/lib/use-jobs'

export function TaskStatsCards() {
  const { jobs } = useJobs()

  const stats = {
    pending: jobs.filter(j => j.status === 'pending').length,
    running: jobs.filter(j => j.status === 'running').length,
    paused: jobs.filter(j => j.status === 'paused').length,
    completed: jobs.filter(j => j.status === 'completed').length,
    failed: jobs.filter(j => j.status === 'failed').length,
    cancelled: jobs.filter(j => j.status === 'cancelled').length,
  }

  const total = jobs.length

  if (total === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-800">📋 任务队列</h2>
        </div>
        <div className="text-center py-6 text-gray-400">
          <div className="text-3xl mb-2">📭</div>
          <p className="text-sm">暂无任务</p>
        </div>
      </div>
    )
  }

  const cards: { label: string; count: number; color: string; bg: string; filter: string }[] = [
    { label: '等待', count: stats.pending, color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200', filter: 'pending' },
    { label: '执行中', count: stats.running + stats.paused, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', filter: 'running' },
    { label: '已完成', count: stats.completed, color: 'text-green-600', bg: 'bg-green-50 border-green-200', filter: 'completed' },
    { label: '失败', count: stats.failed, color: 'text-red-600', bg: 'bg-red-50 border-red-200', filter: 'failed' },
  ]

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-gray-800">📋 任务队列</h2>
        <Link
          href="/tasks"
          className="text-xs text-blue-500 hover:text-blue-600 transition-colors"
        >
          查看全部 →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {cards.map(card => (
          <Link
            key={card.label}
            href={`/tasks?filter=${card.filter}`}
            className={`${card.bg} border rounded-lg p-3 text-center hover:shadow-sm transition-shadow`}
          >
            <div className={`text-2xl font-bold ${card.color}`}>{card.count}</div>
            <div className="text-xs text-gray-500 mt-0.5">{card.label}</div>
          </Link>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-xs text-gray-500">
        <span>共 {total} 个任务</span>
        {stats.failed > 0 && <span className="text-red-500">{stats.failed} 个失败</span>}
      </div>
    </div>
  )
}
