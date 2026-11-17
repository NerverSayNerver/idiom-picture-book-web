'use client'

import Link from 'next/link'
import { useJobs } from '@/lib/use-jobs'
import { NotificationToggle } from './NotificationToggle'

type StatusKey = 'waiting' | 'running' | 'completed' | 'failed'

// 前 4 张卡参与 stagger（0/50/100/150ms）
const ENTRANCE_DELAY_CLASSES = [
  '[animation-delay:0ms]',
  '[animation-delay:50ms]',
  '[animation-delay:100ms]',
  '[animation-delay:150ms]',
]

// 与 Package C 对齐：状态色统一走 globals.css :root 的 --status-* 变量。
// 用字面量类名便于 Tailwind JIT 扫描（动态拼字符串不会被扫描到）。
const STATUS_CLASSES: Record<StatusKey, { text: string; bg: string; border: string }> = {
  waiting: {
    text: 'text-[var(--status-waiting)]',
    bg: 'bg-[var(--status-waiting-soft)]',
    border: 'border-[var(--status-waiting-soft)]',
  },
  running: {
    text: 'text-[var(--status-running)]',
    bg: 'bg-[var(--status-running-soft)]',
    border: 'border-[var(--status-running-soft)]',
  },
  completed: {
    text: 'text-[var(--status-completed)]',
    bg: 'bg-[var(--status-completed-soft)]',
    border: 'border-[var(--status-completed-soft)]',
  },
  failed: {
    text: 'text-[var(--status-failed)]',
    bg: 'bg-[var(--status-failed-soft)]',
    border: 'border-[var(--status-failed-soft)]',
  },
}

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
      <div className="bg-white rounded-lg shadow-md p-4 h-full flex flex-col animate-fade-in">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-800">📋 任务队列</h2>
          <NotificationToggle />
        </div>
        <div className="text-center py-6 text-gray-400 flex-1 flex flex-col items-center justify-center">
          <div className="text-3xl mb-2">📭</div>
          <p className="text-sm">暂无任务</p>
        </div>
      </div>
    )
  }

  // 颜色统一引用全局状态变量（Package C / globals.css），不再散落 Tailwind 状态色
  const cards: { label: string; count: number; status: StatusKey; filter: string }[] = [
    { label: '等待', count: stats.pending, status: 'waiting', filter: 'pending' },
    { label: '执行中', count: stats.running + stats.paused, status: 'running', filter: 'running' },
    { label: '已完成', count: stats.completed, status: 'completed', filter: 'completed' },
    { label: '失败', count: stats.failed + stats.cancelled, status: 'failed', filter: 'failed' },
  ]

  return (
    <div className="bg-white rounded-lg shadow-md p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-gray-800">📋 任务队列</h2>
        <div className="flex items-center gap-2">
          <NotificationToggle />
          <Link
            href="/tasks"
            className="text-xs text-blue-500 hover:text-blue-600 transition-colors duration-fast"
          >
            查看全部 →
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-2 grid-rows-2 gap-2 flex-1">
        {cards.map((card, index) => {
          const statusClass = STATUS_CLASSES[card.status]
          return (
            <Link
              key={card.label}
              href={`/tasks?filter=${card.filter}`}
              className={`border rounded-lg p-3 text-center hover:shadow-lg transition-shadow duration-fast flex flex-col items-center justify-center animate-fade-up ${ENTRANCE_DELAY_CLASSES[index]} ${statusClass.text} ${statusClass.bg} ${statusClass.border}`}
            >
              <div className="text-2xl font-bold">{card.count}</div>
              <div className="text-xs text-gray-500 mt-0.5">{card.label}</div>
            </Link>
          )
        })}
      </div>
      <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-xs text-gray-500">
        <span>共 {total} 个任务</span>
        {stats.failed > 0 && (
          <span className="text-[var(--status-failed)]">{stats.failed} 个失败</span>
        )}
      </div>
    </div>
  )
}
