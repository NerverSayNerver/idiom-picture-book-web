'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useJobs, pauseJobAPI, resumeJobAPI, cancelJobAPI, deleteJobAPI, retryJobAPI } from '@/lib/use-jobs'
import type { Task } from '@/lib/task-types'
import { TaskCard } from './TaskCard'
import { NotificationToggle } from './NotificationToggle'

interface TaskQueueProps {
  className?: string
  initialFilter?: string
}

type FilterMode = 'all' | 'pending' | 'running' | 'paused' | 'completed' | 'failed'
type ConfirmAction = 'cancel-all' | 'clear-completed' | 'clear-failed' | 'retry-failed' | null
interface NotifyState { text: string; failed: boolean }

// ── 错误态文案（按 HTTP 状态分流：网络 / 鉴权 / 服务端） ──
type ErrorKind = 'network' | 'auth' | 'server' | 'unknown'

const ERROR_COPY: Record<ErrorKind, { icon: string; title: string; desc: string; backToShelf: boolean }> = {
  network: {
    icon: '📡',
    title: '任务状态暂时看不到',
    desc: '你的任务还在后台生成，网络恢复后会自动显示',
    backToShelf: false,
  },
  auth: {
    icon: '🔑',
    title: '任务列表打不开',
    desc: '可能是内部密钥未配置（部署问题）',
    backToShelf: true,
  },
  server: {
    icon: '🛠️',
    title: '服务暂时不可用',
    desc: '每 15 秒会自动重试一次',
    backToShelf: false,
  },
  unknown: {
    icon: '⚠️',
    title: '任务状态暂时看不到',
    desc: '请稍后重试，或刷新页面',
    backToShelf: false,
  },
}

// 骨架屏 3 条：含状态点/类型图标/标题/徽章/进度条形状，避免加载时布局跳动
function TaskListSkeleton() {
  return (
    <div>
      <div aria-hidden="true" className="space-y-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-white rounded-card border border-[var(--hairline)] shadow-card overflow-hidden animate-pulse">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-[3px] bg-[var(--status-cancelled-soft)]" />
                <div className="w-2 h-2 rounded-full bg-[var(--status-cancelled-soft)]" />
                <div className="w-5 h-4 rounded-[3px] bg-[var(--status-cancelled-soft)]" />
                <div className="w-24 h-3 rounded-full bg-[var(--status-cancelled-soft)]" />
              </div>
              <div className="w-16 h-5 rounded-full bg-[var(--status-cancelled-soft)]" />
            </div>
            <div className="px-4 pb-3">
              <div className="w-full h-2.5 rounded-full bg-[var(--status-cancelled-soft)]" />
            </div>
          </div>
        ))}
      </div>
      <span role="status" aria-live="polite" className="sr-only">正在加载任务状态…</span>
    </div>
  )
}

export function TaskQueue({ className = '', initialFilter }: TaskQueueProps) {
  const { jobs, allTasks, refresh, error, errorStatus, hasLoaded, isValidating } = useJobs()
  const [filter, setFilter] = useState<FilterMode>(
    (initialFilter && ['all', 'pending', 'running', 'paused', 'completed', 'failed'].includes(initialFilter)
      ? initialFilter
      : 'all') as FilterMode
  )
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set())
  const [notify, setNotify] = useState<NotifyState | null>(null)
  // 单条通知 + 单一计时器：新通知覆盖旧通知，避免连弹与旧计时器误清除
  const notifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastNotify = useRef<NotifyState | null>(null)
  const [clearing, setClearing] = useState(false)
  const [clearingFailed, setClearingFailed] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState<ConfirmAction>(null)
  // 全局唯一的卡片内确认区（取消/删除互斥，避免多张卡同时展开确认）
  const [activeConfirmId, setActiveConfirmId] = useState<string | null>(null)
  const [reloading, setReloading] = useState(false)
  const [online, setOnline] = useState(true)

  const showNotify = useCallback((text: string, failed = false) => {
    setNotify({ text, failed })
    if (notifyTimer.current) clearTimeout(notifyTimer.current)
    notifyTimer.current = setTimeout(() => setNotify(null), 4000)
  }, [])

  useEffect(() => () => {
    if (notifyTimer.current) clearTimeout(notifyTimer.current)
  }, [])

  // 在线状态：区分"断网"与"服务端报错"，并让网络恢复后文案自动更新
  useEffect(() => {
    if (typeof navigator === 'undefined') return
    setOnline(navigator.onLine)
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

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
        showNotify(msg, failed > 0 && completed === 0)
      }
      setHadActiveJobs(false)
    }
  }, [jobs, hadActiveJobs, showNotify])

  const toggleExpand = useCallback((jobId: string) => {
    setExpandedJobs(prev => {
      const next = new Set(prev)
      if (next.has(jobId)) next.delete(jobId)
      else next.add(jobId)
      return next
    })
  }, [])

  // ── 三态判定 ──────────────────────────────────────────
  // firstLoading：首屏还没拿到过成功响应且没报错 → 骨架
  // fatalError：从未成功过且报错 → 全区域错误态（关键：401/500 不再显示"暂无任务"）
  // staleError：有旧数据 + 更新失败 → 保留列表 + 顶部细条提示
  const firstLoading = !hasLoaded && !error
  const fatalError = !hasLoaded && !!error
  const staleError = hasLoaded && !!error

  const errorKind: ErrorKind = !online || errorStatus == null
    ? 'network'
    : errorStatus === 401 || errorStatus === 403
      ? 'auth'
      : errorStatus >= 500
        ? 'server'
        : 'unknown'

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
      case 'completed': return j.status === 'completed'
      case 'failed': return j.status === 'failed' || j.status === 'cancelled'
      default: return true
    }
  })

  const runningJobs = filteredJobs.filter(j => j.status === 'running')
  const pausedJobs = filteredJobs.filter(j => j.status === 'paused')
  const pendingJobs = filteredJobs.filter(j => j.status === 'pending')
  const failedJobs = filteredJobs.filter(j => j.status === 'failed' || j.status === 'cancelled')
  const completedJobs = filteredJobs.filter(j => j.status === 'completed')

  const hasActive = stats.pending > 0 || stats.running > 0 || stats.paused > 0
  const hasCompleted = stats.completed > 0 || stats.cancelled > 0 || stats.failed > 0
  const retriableFailedCount = jobs.filter(j =>
    (j.status === 'failed' || j.status === 'cancelled') && j.retryCount < (j.maxRetries ?? 3)
  ).length
  const failedClearCount = stats.failed + stats.cancelled

  const processing = clearing || clearingFailed || retrying || cancelling

  // ── 统计栏点击筛选（点击相同状态恢复全部） ──────────
  const toggleFilter = useCallback((mode: FilterMode) => {
    setFilter(prev => prev === mode ? 'all' : mode)
  }, [])

  // ── 非破坏性全局控制：直接执行（mutate API 会 throw，需兜底并给出可见反馈） ──
  const handlePauseAll = useCallback(async () => {
    try {
      for (const j of jobs.filter(j => j.status === 'running')) {
        await pauseJobAPI(j.id)
      }
    } catch (err) {
      console.error(err)
      showNotify('❌ 全部暂停失败，请稍后重试', true)
    }
  }, [jobs, showNotify])

  const handleResumeAll = useCallback(async () => {
    try {
      for (const j of jobs.filter(j => j.status === 'paused')) {
        await resumeJobAPI(j.id)
      }
    } catch (err) {
      console.error(err)
      showNotify('❌ 全部继续失败，请稍后重试', true)
    }
  }, [jobs, showNotify])

  // ── 破坏性批量操作：统一「二次确认 → 执行」 ─────────
  // 三个原生 window.confirm 与「取消全部」统一走内联确认，失败统一走错误横幅
  const performConfirmedAction = useCallback(async () => {
    const action = pendingConfirm
    if (!action || processing) return
    switch (action) {
      case 'cancel-all': {
        setCancelling(true)
        try {
          const targets = jobs.filter(j => ['pending', 'running', 'paused'].includes(j.status))
          for (const j of targets) await cancelJobAPI(j.id)
          showNotify(`✅ 已取消 ${targets.length} 个进行中任务`)
          await refresh()
        } catch (err) {
          console.error(err)
          showNotify('❌ 取消全部失败，请稍后重试', true)
        } finally {
          setCancelling(false)
          setPendingConfirm(null)
        }
        break
      }
      case 'clear-completed': {
        const completed = jobs.filter(j => j.status === 'completed')
        if (completed.length === 0) { setPendingConfirm(null); break }
        setClearing(true)
        try {
          for (const j of completed) await deleteJobAPI(j.id)
          showNotify(`🗑️ 已清理 ${completed.length} 个已完成任务`)
          await refresh()
        } catch (err) {
          console.error(err)
          showNotify('❌ 清理已完成任务失败，请稍后重试', true)
        } finally {
          setClearing(false)
          setPendingConfirm(null)
        }
        break
      }
      case 'clear-failed': {
        const failed = jobs.filter(j => j.status === 'failed' || j.status === 'cancelled')
        if (failed.length === 0) { setPendingConfirm(null); break }
        setClearingFailed(true)
        try {
          for (const j of failed) await deleteJobAPI(j.id)
          showNotify(`🗑️ 已清理 ${failed.length} 个失败/已取消任务`)
          await refresh()
        } catch (err) {
          console.error(err)
          showNotify('❌ 清理失败任务失败，请稍后重试', true)
        } finally {
          setClearingFailed(false)
          setPendingConfirm(null)
        }
        break
      }
      case 'retry-failed': {
        const retriable = jobs.filter(j =>
          (j.status === 'failed' || j.status === 'cancelled') && j.retryCount < (j.maxRetries ?? 3)
        )
        if (retriable.length === 0) { setPendingConfirm(null); break }
        setRetrying(true)
        try {
          for (const j of retriable) await retryJobAPI(j.id)
          showNotify(`🔄 已重新排队 ${retriable.length} 个任务`)
          await refresh()
        } catch (err) {
          console.error(err)
          showNotify('❌ 批量重试失败，请稍后重试', true)
        } finally {
          setRetrying(false)
          setPendingConfirm(null)
        }
        break
      }
    }
  }, [pendingConfirm, processing, jobs, refresh, showNotify])

  // ── 分组（状态色统一引用 CSS 变量；key 用于 aria-controls 的稳定 id） ──
  const orderedGroups: { key: string; label: string; color: string; jobs: Task[] }[] = [
    { key: 'running', label: '执行中', color: 'bg-[var(--status-running)] status-dot--running', jobs: runningJobs },
    { key: 'paused', label: '已暂停', color: 'bg-[var(--status-paused)]', jobs: pausedJobs },
    { key: 'pending', label: '等待中', color: 'bg-[var(--status-waiting)]', jobs: pendingJobs },
    { key: 'failed', label: '失败', color: 'bg-[var(--status-failed)]', jobs: failedJobs },
    { key: 'completed', label: '已完成', color: 'bg-[var(--status-completed)]', jobs: completedJobs },
  ]

  // ── 折叠状态管理 ──────────────────────────────────────
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const toggleGroupCollapse = useCallback((label: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }, [])

  // ── 统计栏配置（文字用 -ink 深色变体，实色留给圆点/描边） ──
  const statItems: { label: string; mode: FilterMode; count: number; activeClass: string; defaultClass: string }[] = [
    { label: '等待', mode: 'pending', count: stats.pending, activeClass: 'text-[var(--status-waiting-ink)] ring-2 ring-[var(--status-waiting-soft)]', defaultClass: 'text-[var(--status-waiting-ink)]' },
    { label: '执行中', mode: 'running', count: stats.running + stats.paused, activeClass: 'text-[var(--status-running-ink)] ring-2 ring-[var(--status-running-soft)]', defaultClass: 'text-[var(--status-running-ink)]' },
    { label: '完成', mode: 'completed', count: stats.completed, activeClass: 'text-[var(--status-completed-ink)] ring-2 ring-[var(--status-completed-soft)]', defaultClass: 'text-[var(--status-completed-ink)]' },
    { label: '失败', mode: 'failed', count: stats.failed + stats.cancelled, activeClass: 'text-[var(--status-failed-ink)] ring-2 ring-[var(--status-failed-soft)]', defaultClass: 'text-[var(--status-failed-ink)]' },
    { label: '总计', mode: 'all', count: jobs.length, activeClass: 'text-[var(--text-ink)] ring-2 ring-[var(--brand-strong-soft)]', defaultClass: 'text-[var(--text-ink)]' },
  ]

  const confirmMessages: Record<Exclude<ConfirmAction, null>, string> = {
    'cancel-all': `确定取消全部 ${stats.pending + stats.running + stats.paused} 个进行中任务？已生成的部分会保留，但需要重新排队。`,
    'clear-completed': `确定批量清理 ${stats.completed} 个已完成任务？生成的绘本不受影响。`,
    'clear-failed': `确定批量清理 ${failedClearCount} 个失败/已取消任务？将同时清理已生成的临时文件。`,
    'retry-failed': `确定批量重试 ${retriableFailedCount} 个失败/已取消任务？`,
  }

  // 横幅退出动画期间保留最后一条内容，避免收起时内容瞬间消失
  if (notify) lastNotify.current = notify
  const shownNotify = notify ?? lastNotify.current
  const errCopy = ERROR_COPY[errorKind]

  return (
    <div className={`bg-white rounded-card shadow-card overflow-hidden relative flex flex-col ${className}`}>
      {/* 通知横幅：文档流内 grid 高度过渡；header 不再用 pt-12 硬推，进入/退出都不跳动 */}
      <div
        className={`grid transition-all duration-normal ease-standard ${notify ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
        aria-hidden={!notify}
      >
        <div className="overflow-hidden">
          {shownNotify && (
            <div
              role={shownNotify.failed ? 'alert' : 'status'}
              aria-live={shownNotify.failed ? 'assertive' : 'polite'}
              aria-atomic="true"
              className={`toast-in flex items-center justify-between gap-3 px-4 py-3 text-sm font-medium border-b ${
                shownNotify.failed
                  ? 'bg-[var(--status-failed-soft)] text-[var(--status-failed-ink)] border-[var(--status-failed-soft)]'
                  : 'bg-[var(--status-completed-soft)] text-[var(--status-completed-ink)] border-[var(--status-completed-soft)]'
              } ${notify ? 'animate-slide-down' : ''}`}
            >
              {/* pr-2.5：✕ 的 44px 热区向左扩 10px，文案留出等宽内边距，避免点文案末尾误关通知 */}
              <span className="min-w-0 pr-2.5">{shownNotify.text}</span>
              <button
                type="button"
                aria-label="关闭通知"
                tabIndex={notify ? 0 : -1}
                onClick={() => {
                  setNotify(null)
                  if (notifyTimer.current) {
                    clearTimeout(notifyTimer.current)
                    notifyTimer.current = null
                  }
                }}
                className="hit-44 flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors duration-fast focus-ring"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Header */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-600 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-white">📋 任务队列</h2>
          <p className="text-white text-xs mt-0.5">
            {firstLoading
              ? '正在获取任务状态…'
              : fatalError
                ? '任务状态获取失败'
                : `${jobs.length} 个任务 | ${stats.completed} 完成 | ${stats.failed} 失败`}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <NotificationToggle />
          {hasLoaded && hasActive && (
            <div className="flex flex-wrap items-center gap-2">
              {stats.running > 0 && (
                <button
                  type="button"
                  onClick={handlePauseAll}
                  aria-label="全部暂停进行中的任务"
                  className="min-h-11 px-2.5 text-[12px] rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors duration-fast focus-ring"
                >
                  ⏸ 全部暂停
                </button>
              )}
              {stats.paused > 0 && (
                <button
                  type="button"
                  onClick={handleResumeAll}
                  aria-label="全部继续已暂停的任务"
                  className="min-h-11 px-2.5 text-[12px] rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors duration-fast focus-ring"
                >
                  ▶ 全部继续
                </button>
              )}
              <button
                type="button"
                onClick={() => setPendingConfirm('cancel-all')}
                disabled={processing}
                aria-busy={cancelling}
                aria-label="取消全部进行中任务"
                className="min-h-11 px-2.5 text-[12px] rounded-full bg-red-600/80 text-white hover:bg-red-600 transition-colors duration-fast disabled:opacity-50 focus-ring"
              >
                ✕ 取消全部
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 内联二次确认（替代 window.confirm） */}
      {pendingConfirm && (
        <div
          role="alert"
          aria-label="操作确认"
          className="collapse-in px-4 py-2 bg-[var(--warn-soft)] border-b border-[var(--hairline)] flex flex-wrap items-center justify-between gap-3 animate-collapse-in duration-normal"
        >
          <span className="text-xs text-[var(--warn)]">{confirmMessages[pendingConfirm]}</span>
          <div className="flex gap-4 flex-shrink-0">
            <button
              type="button"
              onClick={performConfirmedAction}
              disabled={processing}
              aria-busy={processing}
              className="min-h-11 px-3 py-1 text-xs rounded-full bg-[var(--danger)] text-white hover:opacity-90 transition-colors duration-fast disabled:opacity-50 focus-ring"
            >
              {processing ? '处理中…' : '确定'}
            </button>
            <button
              type="button"
              onClick={() => setPendingConfirm(null)}
              disabled={processing}
              className="min-h-11 px-3 py-1 text-xs rounded-full bg-white text-[var(--text-body)] border border-[var(--hairline)] hover:bg-background transition-colors duration-fast disabled:opacity-50 focus-ring"
            >
              再想想
            </button>
          </div>
        </div>
      )}

      {/* 可点击的统计/筛选条：加载中显示 —（不显示误导性的 0） */}
      {(firstLoading || jobs.length > 0) && (
        <div className="grid grid-cols-5 max-[359px]:grid-cols-3 gap-1.5 p-2 bg-background border-b border-[var(--hairline)] text-center">
          {statItems.map(item => (
            <button
              key={item.label}
              type="button"
              onClick={() => toggleFilter(item.mode)}
              disabled={firstLoading}
              aria-pressed={filter === item.mode}
              aria-label={`筛选：${item.label}${firstLoading ? '' : `（${item.count}）`}`}
              className={`min-h-11 rounded-inner text-[11.5px] flex flex-col items-center justify-center leading-none transition-colors duration-normal focus-ring ${
                !firstLoading && filter === item.mode ? 'bg-white shadow-card ' + item.activeClass : item.defaultClass
              } ${firstLoading ? 'opacity-60 cursor-default' : 'cursor-pointer hover:bg-white/70'}`}
            >
              <span className="text-[15px] font-bold tabular-nums">{firstLoading ? '—' : item.count}</span>
              <span className="mt-0.5 text-[10px] text-[var(--text-muted)]">{item.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* 批量操作工具栏 */}
      {hasLoaded && jobs.length > 0 && (retriableFailedCount > 0 || stats.completed > 0 || failedClearCount > 0) && (
        <div className="flex flex-wrap items-center justify-end gap-3.5 px-3 py-2 bg-white border-b border-[var(--hairline)]">
          {retriableFailedCount > 0 && (
            <button
              type="button"
              onClick={() => setPendingConfirm('retry-failed')}
              disabled={processing}
              aria-busy={retrying}
              className="min-h-11 px-2.5 py-1 text-xs rounded-full bg-[var(--info-soft)] text-[var(--info)] hover:opacity-80 transition-colors duration-fast disabled:opacity-50 focus-ring"
            >
              {retrying ? '处理中…' : `🔄 批量重试 (${retriableFailedCount})`}
            </button>
          )}
          {failedClearCount > 0 && (
            <button
              type="button"
              onClick={() => setPendingConfirm('clear-failed')}
              disabled={processing}
              aria-busy={clearingFailed}
              className="min-h-11 px-2.5 py-1 text-xs rounded-full bg-[var(--danger-soft)] text-[var(--danger)] hover:opacity-80 transition-colors duration-fast disabled:opacity-50 focus-ring"
            >
              {clearingFailed ? '处理中…' : `🗑️ 清理已失败 (${failedClearCount})`}
            </button>
          )}
          {stats.completed > 0 && (
            <button
              type="button"
              onClick={() => setPendingConfirm('clear-completed')}
              disabled={processing}
              aria-busy={clearing}
              className="min-h-11 px-2.5 py-1 text-xs rounded-full bg-[var(--status-cancelled-soft)] text-[var(--text-body)] hover:opacity-80 transition-colors duration-fast disabled:opacity-50 focus-ring"
            >
              {clearing ? '处理中…' : `🗑️ 清理已完成 (${stats.completed})`}
            </button>
          )}
        </div>
      )}

      {/* 有旧数据 + 更新失败：保留列表，顶部细条提示（不遮挡内容） */}
      {staleError && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-between gap-2 px-3 py-0.5 bg-[var(--status-waiting-soft)] border-b border-[var(--hairline)] text-[11.5px] text-[var(--status-waiting-ink)]"
        >
          <span className="min-w-0 truncate">状态可能不是最新（更新失败）</span>
          <button
            type="button"
            onClick={handleReload}
            disabled={reloading}
            aria-busy={reloading || isValidating}
            aria-label="重新获取任务状态"
            className="flex-shrink-0 min-h-11 px-2 rounded-full font-medium hover:bg-black/[0.06] transition-colors duration-fast disabled:opacity-60 focus-ring"
          >
            {reloading || isValidating ? '重试中…' : '· 重试'}
          </button>
        </div>
      )}

      {/* Job list */}
      <div className="p-3 space-y-3 flex-1 overflow-y-auto min-h-0 [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar]:h-0">
        {firstLoading ? (
          <TaskListSkeleton />
        ) : fatalError ? (
          /* 全区域错误态：按 errorStatus 分流，role=alert 让读屏立刻播报 */
          <div role="alert" className="text-center py-10 px-4">
            <div className="text-3xl mb-2" aria-hidden="true">{errCopy.icon}</div>
            <p className="text-sm font-semibold text-[var(--text-ink)]">{errCopy.title}</p>
            <p className="text-xs text-[var(--text-body)] mt-1.5 leading-relaxed">{errCopy.desc}</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
              <button
                type="button"
                onClick={handleReload}
                disabled={reloading}
                aria-busy={reloading}
                className="inline-flex items-center justify-center min-h-11 px-4 rounded-full bg-[var(--brand-strong-soft)] text-[var(--brand-strong)] text-sm font-medium hover:opacity-85 transition-colors duration-fast disabled:opacity-60 focus-ring"
              >
                {reloading ? '重试中…' : '重试'}
              </button>
              {errCopy.backToShelf && (
                <Link
                  href="/"
                  className="inline-flex items-center justify-center min-h-11 px-4 rounded-full bg-[var(--status-cancelled-soft)] text-[var(--text-body)] text-sm hover:opacity-85 transition-colors duration-fast focus-ring"
                >
                  回到书架
                </Link>
              )}
            </div>
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-10 px-4">
            <div className="text-3xl mb-2" aria-hidden="true">📭</div>
            <p className="text-sm text-[var(--text-body)]">还没有任务</p>
            <Link
              href="/"
              className="inline-flex items-center justify-center min-h-11 px-4 mt-3 rounded-full bg-[var(--brand-strong-soft)] text-[var(--brand-strong)] text-sm font-medium hover:opacity-85 transition-colors duration-fast focus-ring"
            >
              去书架挑一本开始 →
            </Link>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="text-center py-8 px-4">
            <p className="text-sm text-[var(--text-body)]">这个筛选下没有任务</p>
            <button
              type="button"
              onClick={() => setFilter('all')}
              className="inline-flex items-center justify-center min-h-11 px-4 mt-3 rounded-full bg-[var(--status-cancelled-soft)] text-[var(--text-body)] text-sm hover:opacity-85 transition-colors duration-fast focus-ring"
            >
              看全部任务
            </button>
          </div>
        ) : (
          orderedGroups.map(group => {
            const isOpen = !collapsedGroups.has(group.label)
            const groupDomId = `task-group-${group.key}`
            return group.jobs.length > 0 ? (
              <div key={group.label} className="space-y-2">
                {/* 标题语义保留在 h3 上，交互交给内部真 button（aria-expanded 才被正确播报） */}
                <h3 className="text-sm font-medium text-[var(--text-body)]">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={groupDomId}
                    onClick={() => toggleGroupCollapse(group.label)}
                    className="flex items-center gap-2 w-full min-h-11 text-left select-none hover:text-[var(--text-ink)] transition-colors duration-fast focus-ring"
                  >
                    <span aria-hidden="true" className={`w-2 h-2 rounded-full transition-colors duration-normal ${group.color}`} />
                    <span>{group.label} ({group.jobs.length})</span>
                    <span aria-hidden="true" className={`ml-1 text-xs text-[var(--text-muted)] inline-block transition-transform duration-fast ${isOpen ? 'rotate-0' : '-rotate-90'}`}>▼</span>
                  </button>
                </h3>
                {/* grid 高度过渡：折叠时保留内容以播放退出动画 */}
                <div
                  id={groupDomId}
                  className={`grid transition-all duration-normal ease-standard ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                >
                  <div
                    ref={(el) => { if (el) el.inert = !isOpen }}
                    className="overflow-hidden space-y-2"
                  >
                    {group.jobs.map((job, idx) => {
                      // 从 allTasks 中查找子任务（子任务不是 job 类型，不在 jobs 列表里）
                      const childTasks = allTasks.filter(t => t.parentId === job.id)
                      const completedCount = childTasks.filter(c => c.status === 'completed').length
                      const total = childTasks.length
                      const percent = total > 0 ? Math.round((completedCount / total) * 100) : 0
                      return (
                        <div
                          key={job.id}
                          className={isOpen ? 'animate-fade-up' : ''}
                          style={{ animationDelay: `${Math.min(idx * 40, 240)}ms` }}
                        >
                          <TaskCard
                            task={job}
                            expanded={expandedJobs.has(job.id)}
                            onToggle={() => toggleExpand(job.id)}
                            childTasks={childTasks}
                            jobProgress={{ completed: completedCount, total, percent }}
                            onDelete={() => refresh()}
                            activeConfirmId={activeConfirmId}
                            onRequestConfirm={setActiveConfirmId}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : null
          })
        )}
      </div>

      {/* Footer */}
      {hasLoaded && hasCompleted && (
        <div className="px-3 py-2 bg-background border-t border-[var(--hairline)] flex justify-between items-center">
          <span className="text-xs text-[var(--text-muted)]">任务状态自动刷新</span>
          {stats.failed > 0 && (
            <span className="text-xs text-[var(--status-paused-ink)]">失败任务可点击展开后重试</span>
          )}
        </div>
      )}
    </div>
  )
}
