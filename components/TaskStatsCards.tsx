'use client'

import { useCallback, useState } from 'react'
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
// 文字用 -ink 深色变体（实色作文字不达 AA），浅底继续用 soft。
// 用字面量类名便于 Tailwind JIT 扫描（动态拼字符串不会被扫描到）。
const STATUS_CLASSES: Record<StatusKey, { text: string; bg: string; border: string }> = {
  waiting: {
    text: 'text-[var(--status-waiting-ink)]',
    bg: 'bg-[var(--status-waiting-soft)]',
    border: 'border-[var(--status-waiting-soft)]',
  },
  running: {
    text: 'text-[var(--status-running-ink)]',
    bg: 'bg-[var(--status-running-soft)]',
    border: 'border-[var(--status-running-soft)]',
  },
  completed: {
    text: 'text-[var(--status-completed-ink)]',
    bg: 'bg-[var(--status-completed-soft)]',
    border: 'border-[var(--status-completed-soft)]',
  },
  failed: {
    text: 'text-[var(--status-failed-ink)]',
    bg: 'bg-[var(--status-failed-soft)]',
    border: 'border-[var(--status-failed-soft)]',
  },
}

// 4 宫格容器：<640 为 1×4 数字条（h-14），sm(640)+ 恢复 2×2
const GRID_CLASS = 'grid grid-cols-4 gap-1 h-14 rounded-card sm:grid-cols-2 sm:grid-rows-2 sm:gap-2 sm:h-auto'
// 单格：窄屏只放「数字 + 标签」，桌面恢复 p-3
const CELL_CLASS = 'rounded-inner p-2 py-1.5 text-center flex flex-col items-center justify-center sm:p-3'
const NUM_CLASS = 'text-[18px] font-bold tabular-nums leading-none sm:text-2xl'
// 标签压在 status-*-soft 彩色底上，不能用 --text-muted：
// ink-mute #8a6b5c 在彩色浅底上只有 3.96–4.51（实测 failed-soft 3.96 / running-soft 3.97 /
// completed-soft 4.41），10.5px 小字低于 WCAG AA 4.5:1。
// --text-body #6b4a3a 在同一批底上是 6.0–6.3，白底 7.88，全场景达标。
const LABEL_CLASS = 'text-[10.5px] text-[var(--text-body)] mt-0.5 leading-none sm:text-xs'

export function TaskStatsCards() {
  const { jobs, hasLoaded, error, refresh } = useJobs()
  const [reloading, setReloading] = useState(false)

  const stats = {
    pending: jobs.filter(j => j.status === 'pending').length,
    running: jobs.filter(j => j.status === 'running').length,
    paused: jobs.filter(j => j.status === 'paused').length,
    completed: jobs.filter(j => j.status === 'completed').length,
    failed: jobs.filter(j => j.status === 'failed').length,
    cancelled: jobs.filter(j => j.status === 'cancelled').length,
  }

  const total = jobs.length
  const firstLoading = !hasLoaded && !error
  const failedState = !!error && !hasLoaded

  const handleReload = useCallback(async () => {
    if (reloading) return
    setReloading(true)
    try {
      await refresh()
    } catch (err) {
      console.error(err)
    } finally {
      setReloading(false)
    }
  }, [refresh, reloading])

  // 颜色统一引用全局状态变量（Package C / globals.css），不再散落 Tailwind 状态色
  const cards: { label: string; count: number; status: StatusKey; filter: string }[] = [
    { label: '等待', count: stats.pending, status: 'waiting', filter: 'pending' },
    { label: '执行中', count: stats.running + stats.paused, status: 'running', filter: 'running' },
    { label: '已完成', count: stats.completed, status: 'completed', filter: 'completed' },
    { label: '失败', count: stats.failed + stats.cancelled, status: 'failed', filter: 'failed' },
  ]

  return (
    <div className="bg-white rounded-card shadow-card p-4 h-full flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-lg font-bold text-[var(--text-ink)]">📋 任务队列</h2>
        <div className="flex items-center gap-2">
          <NotificationToggle />
          {hasLoaded && total > 0 && (
            <Link
              href="/tasks"
              className="text-xs text-[var(--brand-strong)] hover:opacity-80 transition-opacity duration-fast focus-ring"
            >
              查看全部 →
            </Link>
          )}
        </div>
      </div>

      {/* ① 加载：4 个灰骨架 + 数字占位 —（不显示误导性的 0） */}
      {firstLoading ? (
        <div className="flex-1 flex flex-col justify-center">
          <div aria-hidden="true" className={GRID_CLASS}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} className={`${CELL_CLASS} bg-[var(--status-cancelled-soft)]`}>
                <span className={`${NUM_CLASS} text-[var(--status-cancelled-ink)]`}>—</span>
                <span className="mt-0.5 h-2 w-8 rounded-full bg-[var(--hairline)] sm:mt-1 sm:h-2.5 sm:w-10" />
              </div>
            ))}
          </div>
          <span role="status" aria-live="polite" className="sr-only">正在加载任务统计…</span>
        </div>
      ) : failedState ? (
        /* ② 错误：紧凑单行条，不占满卡片高度 */
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-inner bg-[var(--status-cancelled-soft)] px-2.5 py-1 text-xs text-[var(--text-body)]"
        >
          <span className="min-w-0 truncate">任务状态没取到</span>
          <button
            type="button"
            onClick={handleReload}
            disabled={reloading}
            aria-busy={reloading}
            className="flex-shrink-0 min-h-11 px-2 rounded-full bg-white text-[var(--brand-strong)] font-medium hover:opacity-80 transition-opacity duration-fast disabled:opacity-60 focus-ring"
          >
            {reloading ? '重试中…' : '重试'}
          </button>
        </div>
      ) : total === 0 ? (
        /* ③ 空：引导去书架挑一本 */
        <div className="flex-1 flex flex-col items-center justify-center text-center py-4">
          <div className="text-3xl mb-1.5" aria-hidden="true">📭</div>
          <p className="text-sm text-[var(--text-body)]">暂无任务</p>
          <Link
            href="/"
            className="inline-flex items-center justify-center min-h-11 px-3 mt-2 text-xs font-medium rounded-full bg-[var(--brand-strong-soft)] text-[var(--brand-strong)] hover:opacity-85 transition-opacity duration-fast focus-ring"
          >
            去挑一个开始创作 →
          </Link>
        </div>
      ) : (
        /* ④ 有数据：4 宫格（窄屏固定 h-14 数字条，sm+ 才拉伸填满剩余高度） */
        <div className={`${GRID_CLASS} sm:flex-1`}>
          {cards.map((card, index) => {
            const statusClass = STATUS_CLASSES[card.status]
            return (
              <Link
                key={card.label}
                href={`/tasks?filter=${card.filter}`}
                className={`${CELL_CLASS} border rounded-inner shadow-card hover:shadow-cardHover transition-shadow duration-fast animate-fade-up focus-ring ${ENTRANCE_DELAY_CLASSES[index]} ${statusClass.text} ${statusClass.bg} ${statusClass.border}`}
              >
                <span className={NUM_CLASS}>{card.count}</span>
                <span className={LABEL_CLASS}>{card.label}</span>
              </Link>
            )
          })}
        </div>
      )}

      {hasLoaded && total > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--hairline)] flex justify-between text-xs text-[var(--text-muted)]">
          <span className="tabular-nums">共 {total} 个任务</span>
          {stats.failed > 0 && (
            <span className="text-[var(--status-failed-ink)] tabular-nums">{stats.failed} 个失败</span>
          )}
        </div>
      )}
    </div>
  )
}
