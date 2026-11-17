'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useJobs, pauseJobAPI, resumeJobAPI, cancelJobAPI, deleteJobAPI, retryJobAPI } from '@/lib/use-jobs'
import type { Task, TaskStatus } from '@/lib/task-types'
import { TaskCard } from './TaskCard'
import { NotificationToggle } from './NotificationToggle'

interface TaskQueueProps {
  compact?: boolean
  className?: string
  initialFilter?: string
}

type FilterMode = 'all' | 'pending' | 'running' | 'paused' | 'completed' | 'failed'
type ConfirmAction = 'cancel-all' | 'clear-completed' | 'clear-failed' | 'retry-failed' | null
interface NotifyState { text: string; failed: boolean }

export function TaskQueue({ compact = false, className = '', initialFilter }: TaskQueueProps) {
  const { jobs, allTasks, refresh } = useJobs()
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

  const showNotify = useCallback((text: string, failed = false) => {
    setNotify({ text, failed })
    if (notifyTimer.current) clearTimeout(notifyTimer.current)
    notifyTimer.current = setTimeout(() => setNotify(null), 4000)
  }, [])

  useEffect(() => () => {
    if (notifyTimer.current) clearTimeout(notifyTimer.current)
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

  // ── 非破坏性全局控制：直接执行 ──────────────────────
  const handlePauseAll = useCallback(async () => {
    for (const j of jobs.filter(j => j.status === 'running')) {
      await pauseJobAPI(j.id)
    }
  }, [jobs])

  const handleResumeAll = useCallback(async () => {
    for (const j of jobs.filter(j => j.status === 'paused')) {
      await resumeJobAPI(j.id)
    }
  }, [jobs])

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

  // ── 分组（状态色统一引用 CSS 变量） ──────────────────
  const orderedGroups: { label: string; color: string; jobs: Task[] }[] = [
    { label: '执行中', color: 'bg-[var(--status-running)] status-dot--running', jobs: runningJobs },
    { label: '已暂停', color: 'bg-[var(--status-paused)]', jobs: pausedJobs },
    { label: '等待中', color: 'bg-[var(--status-waiting)]', jobs: pendingJobs },
    { label: '失败', color: 'bg-[var(--status-failed)]', jobs: failedJobs },
    { label: '已完成', color: 'bg-[var(--status-completed)]', jobs: completedJobs },
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
    { label: '等待', mode: 'pending', count: stats.pending, activeClass: 'text-[var(--status-waiting)] ring-2 ring-[var(--status-waiting-soft)]', defaultClass: 'text-[var(--status-waiting)]' },
    { label: '执行中', mode: 'running', count: stats.running + stats.paused, activeClass: 'text-[var(--status-running)] ring-2 ring-[var(--status-running-soft)]', defaultClass: 'text-[var(--status-running)]' },
    { label: '完成', mode: 'completed', count: stats.completed, activeClass: 'text-[var(--status-completed)] ring-2 ring-[var(--status-completed-soft)]', defaultClass: 'text-[var(--status-completed)]' },
    { label: '失败', mode: 'failed', count: stats.failed + stats.cancelled, activeClass: 'text-[var(--status-failed)] ring-2 ring-[var(--status-failed-soft)]', defaultClass: 'text-[var(--status-failed)]' },
    { label: '总计', mode: 'all', count: jobs.length, activeClass: 'text-gray-700 ring-2 ring-gray-300', defaultClass: 'text-gray-700' },
  ]

  const confirmMessages: Record<Exclude<ConfirmAction, null>, string> = {
    'cancel-all': `确定取消全部 ${stats.pending + stats.running + stats.paused} 个进行中任务？此操作不可撤销。`,
    'clear-completed': `确定批量清理 ${stats.completed} 个已完成任务？生成的绘本不受影响。`,
    'clear-failed': `确定批量清理 ${failedClearCount} 个失败/已取消任务？将同时清理已生成的临时文件。`,
    'retry-failed': `确定批量重试 ${retriableFailedCount} 个失败/已取消任务？`,
  }

  // 横幅退出动画期间保留最后一条内容，避免收起时内容瞬间消失
  if (notify) lastNotify.current = notify
  const shownNotify = notify ?? lastNotify.current

  return (
    <div className={`bg-white rounded-lg shadow-md overflow-hidden relative flex flex-col ${className}`}>
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
                  ? 'bg-[var(--status-failed-soft)] text-[var(--status-failed)] border-[var(--status-failed)]'
                  : 'bg-[var(--status-completed-soft)] text-[var(--status-completed)] border-[var(--status-completed)]'
              } ${notify ? 'animate-slide-down' : ''}`}
            >
              <span className="min-w-0">{shownNotify.text}</span>
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
                className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors duration-fast focus-ring"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Header */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-600 px-4 py-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">📋 任务队列</h2>
          <p className="text-white text-xs mt-0.5">
            {jobs.length} 个任务 | {stats.completed} 完成 | {stats.failed} 失败
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NotificationToggle />
          {hasActive && (
          <div className="flex gap-2">
            {stats.running > 0 && (
              <button onClick={handlePauseAll} className="px-2 py-1 text-xs bg-white/20 text-white rounded hover:bg-white/30">⏸ 全部暂停</button>
            )}
            {stats.paused > 0 && (
              <button onClick={handleResumeAll} className="px-2 py-1 text-xs bg-white/20 text-white rounded hover:bg-white/30">▶ 全部继续</button>
            )}
            <button
              onClick={() => setPendingConfirm('cancel-all')}
              disabled={processing}
              className="px-2 py-1 text-xs bg-red-600/80 text-white rounded hover:bg-red-600 transition-colors duration-fast disabled:opacity-50"
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
          className="collapse-in px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-3 animate-collapse-in duration-normal"
        >
          <span className="text-xs text-amber-800">{confirmMessages[pendingConfirm]}</span>
          <div className="flex gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={performConfirmedAction}
              disabled={processing}
              className="px-2.5 py-1 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors duration-fast disabled:opacity-50"
            >
              {processing ? '处理中…' : '确定'}
            </button>
            <button
              type="button"
              onClick={() => setPendingConfirm(null)}
              disabled={processing}
              className="px-2.5 py-1 text-xs bg-white text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors duration-fast disabled:opacity-50"
            >
              再想想
            </button>
          </div>
        </div>
      )}

      {/* 可点击的统计栏 */}
      {jobs.length > 0 && (
        <div className="grid grid-cols-5 gap-2 p-3 bg-gray-50 border-b border-gray-100 text-center">
          {statItems.map(item => (
            <button
              key={item.label}
              onClick={() => toggleFilter(item.mode)}
              className={`rounded-lg p-1 cursor-pointer hover:bg-gray-100 transition-colors duration-normal ${
                filter === item.mode ? 'bg-white shadow-sm ' + item.activeClass : item.defaultClass
              }`}
            >
              <div className="text-lg font-bold">{item.count}</div>
              <div className="text-xs text-gray-500">{item.label}</div>
            </button>
          ))}
        </div>
      )}

      {/* 批量操作工具栏 */}
      {jobs.length > 0 && (retriableFailedCount > 0 || stats.completed > 0 || failedClearCount > 0) && (
        <div className="flex items-center justify-end gap-2 px-3 py-2 bg-white border-b border-gray-100">
          {retriableFailedCount > 0 && (
            <button
              onClick={() => setPendingConfirm('retry-failed')}
              disabled={processing}
              className="px-2.5 py-1 text-xs bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors duration-fast disabled:opacity-50"
            >
              {retrying ? '处理中…' : `🔄 批量重试 (${retriableFailedCount})`}
            </button>
          )}
          {failedClearCount > 0 && (
            <button
              onClick={() => setPendingConfirm('clear-failed')}
              disabled={processing}
              className="px-2.5 py-1 text-xs bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors duration-fast disabled:opacity-50"
            >
              {clearingFailed ? '处理中…' : `🗑️ 清理已失败 (${failedClearCount})`}
            </button>
          )}
          {stats.completed > 0 && (
            <button
              onClick={() => setPendingConfirm('clear-completed')}
              disabled={processing}
              className="px-2.5 py-1 text-xs bg-gray-100 text-gray-600 rounded-md hover:bg-red-50 hover:text-red-600 transition-colors duration-fast disabled:opacity-50"
            >
              {clearing ? '处理中…' : `🗑️ 清理已完成 (${stats.completed})`}
            </button>
          )}
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
          orderedGroups.map(group => {
            const isOpen = !collapsedGroups.has(group.label)
            return group.jobs.length > 0 ? (
              <div key={group.label} className="space-y-2">
                <h3
                  role="button"
                  tabIndex={0}
                  aria-expanded={isOpen}
                  onClick={() => toggleGroupCollapse(group.label)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggleGroupCollapse(group.label)
                    }
                  }}
                  className="text-sm font-medium text-gray-500 flex items-center cursor-pointer select-none hover:text-gray-700 transition-colors duration-fast focus-ring"
                >
                  <span className={`w-2 h-2 rounded-full mr-2 transition-colors duration-normal ${group.color}`}></span>
                  {group.label} ({group.jobs.length})
                  <span className={`ml-1 text-xs text-gray-400 inline-block transition-transform duration-fast ${isOpen ? 'rotate-0' : '-rotate-90'}`}>▼</span>
                </h3>
                {/* grid 高度过渡：折叠时保留内容以播放退出动画 */}
                <div className={`grid transition-all duration-normal ease-standard ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
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
      {hasCompleted && (
        <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
          <span className="text-xs text-gray-500">任务状态自动刷新</span>
          {stats.failed > 0 && (
            <span className="text-xs text-orange-500">失败任务可点击展开后重试</span>
          )}
        </div>
      )}
    </div>
  )
}
