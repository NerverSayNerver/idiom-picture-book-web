'use client'

import { useState, useId } from 'react'
import type { Task, TaskStatus, TaskType } from '@/lib/task-types'
import type { SceneTemplate, ContentCategory } from '@/lib/types'
import Link from 'next/link'
import { getStrategy } from '@/lib/content-types'
import Modal from './Modal'
import { retryJobAPI, pauseJobAPI, resumeJobAPI, cancelJobAPI, deleteJobAPI, reorderJobAPI } from '@/lib/use-jobs'

interface TaskCardProps {
  task: Task
  expanded?: boolean
  onToggle?: () => void
  showActions?: boolean
  /** 子任务列表（由父组件通过 API 数据提供） */
  childTasks?: Task[]
  /** job 进度（由父组件计算） */
  jobProgress?: { completed: number; total: number; percent: number }
  /** 删除成功后的回调（通常为刷新任务列表） */
  onDelete?: () => void
  /**
   * 全局唯一的确认区标识（由 TaskQueue 维护）。
   * 传入后本卡的「取消 / 删除」确认会受控，保证列表内同时只展开一个确认区。
   */
  activeConfirmId?: string | null
  /** 请求展开/收起确认区；传 null 收起。缺省时退化为卡片各自独立。 */
  onRequestConfirm?: (id: string | null) => void
}

/**
 * 时间戳单位归一到毫秒。
 * `lib/task-db.ts` 的 `nowSeconds()` 写入的是**秒**，但库里存在历史毫秒值（早期版本写入），
 * 两种混用会让 `Date.now() - startTime` 算出天文数字（实测渲染成「29689236m 39s」，
 * 并且把卡片标题挤成一个字）。
 * 分界取 1e11：1e11 秒 ≈ 公元 5138 年，1e11 毫秒 ≈ 1973 年，两侧都远离真实取值。
 */
const toMs = (v?: number | null): number | undefined =>
  v == null ? undefined : v < 1e11 ? v * 1000 : v

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  // 超过一小时改用 h/m 两段，避免「1234m 56s」这种读不出量级的写法
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

// 状态色统一引用全局 CSS 变量：soft 作浅底，-ink 深色变体作文字（实色作文字不达 AA）
const statusConfig: Record<TaskStatus, { color: string; icon: string; label: string }> = {
  pending: { color: 'bg-[var(--status-waiting-soft)] text-[var(--status-waiting-ink)]', icon: '⏳', label: '等待中' },
  running: { color: 'bg-[var(--status-running-soft)] text-[var(--status-running-ink)]', icon: '🔄', label: '执行中' },
  paused: { color: 'bg-[var(--status-paused-soft)] text-[var(--status-paused-ink)]', icon: '⏸️', label: '已暂停' },
  completed: { color: 'bg-[var(--status-completed-soft)] text-[var(--status-completed-ink)]', icon: '✅', label: '已完成' },
  failed: { color: 'bg-[var(--status-failed-soft)] text-[var(--status-failed-ink)]', icon: '❌', label: '失败' },
  cancelled: { color: 'bg-[var(--status-cancelled-soft)] text-[var(--status-cancelled-ink)]', icon: '🚫', label: '已取消' },
}

const typeIcons: Record<TaskType, string> = {
  job: '📋',
  decompose: '🤖',
  generate: '🎨',
  save: '💾',
}

// running 圆点用 .status-dot--running（breathe 2.4s）替代 animate-pulse
const indicatorColor: Record<TaskStatus, string> = {
  pending: 'bg-[var(--status-waiting)]',
  running: 'bg-[var(--status-running)] status-dot--running',
  paused: 'bg-[var(--status-paused)]',
  completed: 'bg-[var(--status-completed)]',
  failed: 'bg-[var(--status-failed)]',
  cancelled: 'bg-[var(--status-cancelled)]',
}

const indicatorIcon: Record<TaskStatus, string> = {
  pending: '',
  running: '↻',
  paused: '⏸',
  completed: '✓',
  failed: '✕',
  cancelled: '',
}

// 进度条填充：实色状态变量，终态用 completed / failed 表示结果
const progressFillColor: Record<TaskStatus, string> = {
  pending: 'bg-[var(--status-waiting)]',
  running: 'bg-[var(--status-running)]',
  paused: 'bg-[var(--status-paused)]',
  completed: 'bg-[var(--status-completed)]',
  failed: 'bg-[var(--status-failed)]',
  cancelled: 'bg-[var(--status-cancelled)]',
}

// 卡片内按钮公共类：44px 触控热区（min-h/w-11）+ 圆角 token + 统一过渡
const btnBase =
  'inline-flex items-center justify-center min-h-11 min-w-11 px-3 text-xs rounded-full transition-colors duration-fast disabled:opacity-50 focus-ring'

// ── Child Task Row ──────────────────────────────────────────

function ChildTaskRow({ task, showActions }: { task: Task; showActions: boolean }) {
  const [showDetail, setShowDetail] = useState(false)
  const [showImageModal, setShowImageModal] = useState(false)
  const [showDecomposeModal, setShowDecomposeModal] = useState(false)
  const [showPromptModal, setShowPromptModal] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)
  const canShowPrompt = task.status === 'completed' && !!task.prompt
  const startMs = toMs(task.startTime)
  // 用 `||` 而不是 `??`：时间戳里 0（1970-01-01）不是合法取值，一并当作「未结束」兜回 now。
  // 渲染期读 Date.now 是有意设计：进行中任务的耗时随 SWR 轮询重渲染而刷新；
  // elapsed 仅在客户端数据就绪后非空，无 SSR/hydration 不一致风险。
  // eslint-disable-next-line react-hooks/purity
  const elapsed = startMs ? formatDuration((toMs(task.endTime) || Date.now()) - startMs) : null
  const progressPercent = task.total > 0 ? Math.round((task.progress / task.total) * 100) : 0

  // 获取分解结果 — 优先从 task 自身读取
  const decomposeMeaning = task.decomposeMeaning ?? undefined
  const decomposeCharacterDescription = task.decomposeCharacterDescription ?? undefined
  const decomposeStyleDescription = task.decomposeStyleDescription ?? undefined
  const decomposeScenes = task.decomposeScenesJson ? (() => {
    try { return JSON.parse(task.decomposeScenesJson) as SceneTemplate[] } catch { return null }
  })() : null

  // 获取父 job 信息 — 从 props 无法直接获取，使用 task 上的冗余字段
  const decomposeIdiom = task.idiom
  const categoryLabel = (() => {
    try { return getStrategy((task.category || 'idiom') as ContentCategory).label } catch { return '内容' }
  })()

  // 类型对应的默认标题
  const typeDefaultTitles: Partial<Record<TaskType, string>> = {
    decompose: `分析${categoryLabel}含义`,
    generate: '生成场景图片',
    save: '保存绘本',
  }
  const rowTitle = task.sceneTitle ?? typeDefaultTitles[task.type] ?? '未命名'

  const hasImage = task.status === 'completed' && task.type === 'generate' && !!task.imageUrl
  const canShowDecompose = task.status === 'completed' && task.type === 'decompose' && !!decomposeMeaning
  const hasModal = hasImage || canShowDecompose
  const isClickable = task.status === 'failed' || hasModal
  const isRunning = task.status === 'running'

  // 行主体唯一入口：键盘与指针共用，避免两处逻辑漂移
  const activate = () => {
    if (hasImage) { setShowImageModal(true); return }
    if (canShowDecompose) { setShowDecomposeModal(true); return }
    if (task.status === 'failed') setShowDetail((v) => !v)
  }

  return (
    <div>
      {/* 行内还有 Prompt / 重试 button，不能整体改 <button>（嵌套 button 非法）
          → role="button" + tabIndex + Enter/Space，键盘用户同样可展开图片/分析结果/错误详情 */}
      <div
        role={isClickable ? 'button' : undefined}
        tabIndex={isClickable ? 0 : -1}
        aria-haspopup={hasModal ? 'dialog' : undefined}
        aria-expanded={task.status === 'failed' ? showDetail : undefined}
        onClick={activate}
        onKeyDown={(e) => {
          if (!isClickable) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            activate()
          }
        }}
        className={`flex items-center gap-3 p-3 bg-background rounded-inner ${
          isClickable ? 'cursor-pointer hover:bg-[var(--hairline)] transition-colors duration-fast focus-ring' : ''
        }`}
      >
        <div
          aria-hidden="true"
          className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold transition-colors duration-normal ${indicatorColor[task.status]}`}
        >
          {indicatorIcon[task.status]}
        </div>
        <span className="text-lg" aria-hidden="true">{typeIcons[task.type] ?? '❓'}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[var(--text-ink)] truncate">
            {rowTitle}
            {hasImage && ' 🖼️'}
            {canShowDecompose && ' 📊'}
          </div>
          {task.status === 'running' && task.total > 1 && (
            <div className="mt-1">
              <div
                className="w-full h-2.5 bg-ink/10 rounded-full overflow-hidden"
                role="progressbar"
                aria-label="场景生成进度"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPercent}
                aria-valuetext={`已完成 ${task.progress}/${task.total} 幕`}
              >
                <div
                  className={`h-full ${progressFillColor[task.status]} rounded-full progress-fill ${isRunning ? '' : '!transition-[width] !duration-normal !ease-standard'}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-xs text-[var(--text-muted)] tabular-nums">{progressPercent}%</span>
            </div>
          )}
          {task.status === 'failed' && !showDetail && (
            <div className="space-y-0.5">
              {task.error && (
                <span className="text-xs text-[var(--status-failed-ink)] block truncate" title={task.error}>
                  ⚠️ {task.error}
                </span>
              )}
              {task.retryCount > 0 && (
                <span className="text-xs text-[var(--status-paused-ink)]">🔄 重试 {task.retryCount}/{task.maxRetries}</span>
              )}
            </div>
          )}
          {task.status === 'failed' && showDetail && (
            <span className="text-xs text-[var(--status-failed-ink)] font-medium">▼ 错误详情</span>
          )}
          {retryError && (
            <span role="alert" className="text-xs text-[var(--danger)] block mt-0.5">{retryError}</span>
          )}
        </div>
        {elapsed && <span className="text-xs text-[var(--text-muted)] flex-shrink-0 tabular-nums">⏱️ {elapsed}</span>}
        {canShowPrompt && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowPromptModal(true) }}
            aria-label={`查看「${rowTitle}」的 Prompt`}
            className={`${btnBase} bg-[var(--brand-strong-soft)] text-[var(--brand-strong)] hover:opacity-80`}
            title="查看 Prompt"
          >
            📊 Prompt
          </button>
        )}
        {showActions && task.status === 'failed' && task.retryCount < (task.maxRetries ?? 3) && (
          <button
            type="button"
            aria-busy={retrying}
            aria-label={`重试「${rowTitle}」`}
            onClick={async (e) => {
              e.stopPropagation()
              setRetrying(true)
              setRetryError(null)
              try {
                await retryJobAPI(task.id)
              } catch (err) {
                console.error(err)
                setRetryError('重试失败，请稍后再试')
              } finally {
                setRetrying(false)
              }
            }}
            className={`${btnBase} bg-[var(--status-completed-soft)] text-[var(--status-completed-ink)] hover:opacity-80`}
          >
            🔄 重试
          </button>
        )}
      </div>

      {/* 展开详情：错误信息（内联） */}
      {showDetail && task.status === 'failed' && (
        <div className="px-3 pb-3 pl-14">
          <div className="bg-[var(--danger-soft)] border border-[var(--hairline)] rounded-inner p-3 text-xs text-[var(--danger)] whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
            {task.error || '未知错误'}
          </div>
        </div>
      )}

      {/* 图片弹窗 */}
      {showImageModal && hasImage && task.imageUrl && (
        <Modal
          title={task.sceneTitle ? `🎨 ${task.sceneTitle}` : '生成图片'}
          titleInFooter
          onClose={() => setShowImageModal(false)}
          panelClassName="max-w-[90vw] max-h-[90vh] bg-white rounded-card shadow-modal overflow-hidden"
        >
          <img
            src={task.imageUrl}
            alt={task.sceneTitle || '生成图片'}
            className="max-w-full max-h-[80vh] object-contain"
          />
        </Modal>
      )}

      {/* LLM 分析结果弹窗 */}
      {showDecomposeModal && canShowDecompose && (
        <Modal
          title={`🔍 ${categoryLabel}分析结果`}
          onClose={() => setShowDecomposeModal(false)}
          panelClassName="w-full max-w-2xl max-h-[85vh] bg-white rounded-card shadow-modal overflow-hidden mx-4"
        >
          {/* 内容区 */}
          <div className="px-6 py-4 space-y-4 overflow-y-auto max-h-[calc(85vh-64px)]">
            {/* 标题 */}
            <div>
              <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">{categoryLabel}</span>
              <p className="text-2xl font-bold text-[var(--text-ink)]">{decomposeIdiom}</p>
            </div>

            {/* 含义 */}
            <div>
              <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">含义</span>
              <p className="text-[var(--text-body)] leading-relaxed">{decomposeMeaning}</p>
            </div>

            {/* 角色描述 */}
            {decomposeCharacterDescription && (
              <div>
                <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">角色设定</span>
                <p className="text-sm text-[var(--text-body)] bg-background rounded-inner p-3">{decomposeCharacterDescription}</p>
              </div>
            )}

            {/* 画风描述 */}
            {decomposeStyleDescription && (
              <div>
                <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">画风</span>
                <p className="text-sm text-[var(--text-body)] bg-background rounded-inner p-3">{decomposeStyleDescription}</p>
              </div>
            )}

            {/* 场景列表 */}
            <div>
              <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">场景规划（{decomposeScenes?.length ?? 0} 幕）</span>
              <div className="mt-2 space-y-3">
                {decomposeScenes?.map((s, i) => (
                  <div key={i} className="bg-background rounded-inner p-3 border border-[var(--hairline)]">
                    <h4 className="font-semibold text-[var(--text-ink)] text-sm">
                      场景 {i + 1}：{s.title}
                    </h4>
                    <p className="text-xs text-[var(--text-body)] mt-1 line-clamp-2">{s.description}</p>
                    {s.narration && (
                      <p className="text-xs text-[var(--text-muted)] mt-1 italic line-clamp-1">💬 {s.narration}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Prompt 弹窗 */}
      {showPromptModal && task.prompt && (
        <Modal
          title={task.type === 'decompose' ? '📝 LLM 分析 Prompt' : task.type === 'generate' ? '📝 生图 Prompt' : '📝 Prompt'}
          onClose={() => setShowPromptModal(false)}
          panelClassName="w-full max-w-3xl max-h-[85vh] bg-white rounded-card shadow-modal overflow-hidden mx-4"
        >
          {/* 内容区 */}
          <div className="px-6 py-4 overflow-y-auto max-h-[calc(85vh-64px)]">
            <pre className="text-sm text-[var(--text-body)] whitespace-pre-wrap break-words bg-background rounded-inner p-4 border border-[var(--hairline)] font-mono">
              {task.prompt}
            </pre>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────

export function TaskCard({
  task,
  expanded = false,
  onToggle,
  showActions = true,
  childTasks = [],
  jobProgress,
  onDelete,
  activeConfirmId,
  onRequestConfirm,
}: TaskCardProps) {
  const status = statusConfig[task.status]
  const startMs = toMs(task.startTime)
  // 同上：轮询驱动的运行耗时展示，渲染期 Date.now 是有意设计
  // eslint-disable-next-line react-hooks/purity
  const elapsed = startMs ? formatDuration((toMs(task.endTime) || Date.now()) - startMs) : null
  // 卡头 button ↔ 子列表容器的 aria-controls 关联
  const childrenId = useId()
  const isRunning = task.status === 'running'
  const cardLabel = task.idiom ?? task.sourceText ?? '任务'

  // ── 确认区：取消 / 删除共用一个「当前展开项」 ──────────
  type ConfirmMode = 'cancel' | 'delete' | null
  const cancelConfirmId = `cancel:${task.id}`
  const deleteConfirmId = `delete:${task.id}`
  const [confirmMode, setConfirmMode] = useState<ConfirmMode>(null)
  const controlled = typeof onRequestConfirm === 'function'
  const shownConfirm: ConfirmMode = controlled
    ? activeConfirmId === cancelConfirmId
      ? 'cancel'
      : activeConfirmId === deleteConfirmId
        ? 'delete'
        : null
    : confirmMode
  const openConfirm = (mode: Exclude<ConfirmMode, null>) => {
    setConfirmMode(mode)
    onRequestConfirm?.(mode === 'cancel' ? cancelConfirmId : deleteConfirmId)
  }
  const closeConfirm = () => {
    setConfirmMode(null)
    onRequestConfirm?.(null)
  }

  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // 所有异步动作统一入口：忙态 + 失败兜底，避免静默失败
  const runAction = async (key: string, fn: () => Promise<void>) => {
    if (busy) return
    setBusy(key)
    setActionError(null)
    try {
      await fn()
    } catch (err) {
      console.error(err)
      setActionError('操作失败，请稍后重试')
    } finally {
      setBusy(null)
    }
  }

  if (task.type === 'job') {
    const progress = jobProgress ?? { completed: 0, total: 0, percent: 0 }
    const deleteMessage = task.status === 'failed' || task.status === 'cancelled'
      ? `确定删除此${task.status === 'failed' ? '失败' : '取消'}任务？将同时清理已生成的临时文件。`
      : '确定删除此任务记录？生成的绘本不受影响。'

    return (
      <div className="bg-white rounded-card border border-[var(--hairline)] overflow-hidden shadow-card">
        {/* Header：真 button（键盘可展开/收起） */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={childrenId}
          className="w-full flex items-center justify-between px-4 py-3 text-left cursor-pointer hover:bg-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--select)]"
        >
          <span className="flex items-center gap-2 min-w-0">
            <span
              aria-hidden="true"
              className={`text-xs text-[var(--text-muted)] w-4 inline-block text-center transition-transform duration-fast ${expanded ? 'rotate-90' : 'rotate-0'}`}
            >
              ▶
            </span>
            <span aria-hidden="true" className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors duration-normal ${indicatorColor[task.status]}`} />
            <span aria-hidden="true" className="text-lg">{typeIcons[task.type]}</span>
            <span className="font-medium text-[var(--text-ink)] truncate">{cardLabel}</span>
          </span>
          <span className="flex items-center gap-3 flex-shrink-0">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors duration-normal ${status.color}`}>
              {status.icon} {status.label}
            </span>
            {elapsed && <span className="text-xs text-[var(--text-muted)] tabular-nums">⏱️ {elapsed}</span>}
          </span>
        </button>

        {/* Progress (多步骤时才显示进度条) */}
        {progress.total > 1 && (
          <div className="px-4 pb-2">
            <div className="flex justify-between text-xs text-[var(--text-body)] mb-1">
              <span>进度</span>
              <span className="tabular-nums">
                {progress.completed}/{progress.total} ({progress.percent}%)
              </span>
            </div>
            <div
              className="w-full h-2.5 bg-ink/10 rounded-full overflow-hidden relative"
              role="progressbar"
              aria-label="场景生成进度"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percent}
              aria-valuetext={`已完成 ${progress.completed}/${progress.total} 幕`}
            >
              <div
                className={`h-full ${progressFillColor[task.status]} rounded-full progress-fill ${isRunning ? '' : '!transition-[width] !duration-normal !ease-standard'}`}
                style={{ width: `${progress.percent}%` }}
              />
              {isRunning && <div className="progress-sheen absolute inset-0 pointer-events-none" />}
            </div>
          </div>
        )}

        {/* Actions */}
        {showActions && (
          <div className="flex flex-wrap items-center justify-end gap-2 px-4 pb-3">
            {task.status === 'running' && (
              <button
                type="button"
                aria-busy={busy === 'pause'}
                aria-label={`暂停「${cardLabel}」`}
                onClick={() => runAction('pause', () => pauseJobAPI(task.id))}
                className={`${btnBase} bg-[var(--warn-soft)] text-[var(--warn)] hover:opacity-80`}
              >
                ⏸️ 暂停
              </button>
            )}
            {task.status === 'paused' && (
              <button
                type="button"
                aria-busy={busy === 'resume'}
                aria-label={`继续「${cardLabel}」`}
                onClick={() => runAction('resume', () => resumeJobAPI(task.id))}
                className={`${btnBase} bg-[var(--status-running-soft)] text-[var(--status-running-ink)] hover:opacity-80`}
              >
                ▶️ 继续
              </button>
            )}
            {['pending', 'running', 'paused'].includes(task.status) && (
              <button
                type="button"
                aria-busy={cancelling}
                aria-label={`取消「${cardLabel}」`}
                aria-expanded={shownConfirm === 'cancel'}
                onClick={() => {
                  setCancelError(null)
                  if (shownConfirm === 'cancel') closeConfirm()
                  else openConfirm('cancel')
                }}
                className={`${btnBase} bg-[var(--danger-soft)] text-[var(--danger)] hover:opacity-80`}
              >
                ❌ 取消
              </button>
            )}
            {task.status === 'pending' && (
              <>
                <button
                  type="button"
                  aria-busy={busy === 'reorder-up'}
                  aria-label={`上移「${cardLabel}」`}
                  title="上移"
                  onClick={() => runAction('reorder-up', async () => { await reorderJobAPI(task.id, 'up'); onDelete?.() })}
                  className={`${btnBase} px-2 bg-[var(--status-cancelled-soft)] text-[var(--text-body)] hover:opacity-80`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-busy={busy === 'reorder-down'}
                  aria-label={`下移「${cardLabel}」`}
                  title="下移"
                  onClick={() => runAction('reorder-down', async () => { await reorderJobAPI(task.id, 'down'); onDelete?.() })}
                  className={`${btnBase} px-2 bg-[var(--status-cancelled-soft)] text-[var(--text-body)] hover:opacity-80`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-busy={busy === 'reorder-top'}
                  aria-label={`置顶「${cardLabel}」`}
                  title="置顶"
                  onClick={() => runAction('reorder-top', async () => { await reorderJobAPI(task.id, 'top'); onDelete?.() })}
                  className={`${btnBase} px-2 bg-[var(--status-cancelled-soft)] text-[var(--text-body)] hover:opacity-80`}
                >
                  ⬆
                </button>
              </>
            )}
            {task.status === 'completed' && (task.idiom || task.sourceText) && (
              <Link
                href={`/read/${task.category || 'idiom'}:${encodeURIComponent(task.idiom || task.sourceText || '')}`}
                className={`${btnBase} bg-[var(--status-completed-soft)] text-[var(--status-completed-ink)] hover:opacity-80`}
              >
                📖 查看绘本
              </Link>
            )}
            {['completed', 'failed', 'cancelled'].includes(task.status) && (
              <button
                type="button"
                aria-expanded={shownConfirm === 'delete'}
                aria-label={`删除「${cardLabel}」`}
                onClick={() => {
                  setDeleteError(null)
                  if (shownConfirm === 'delete') closeConfirm()
                  else openConfirm('delete')
                }}
                className={`${btnBase} bg-[var(--status-cancelled-soft)] text-[var(--text-body)] hover:opacity-80`}
              >
                🗑️ 删除
              </button>
            )}
            {actionError && (
              <p role="alert" className="text-xs text-[var(--danger)] mr-auto">{actionError}</p>
            )}
          </div>
        )}

        {/* 取消内联确认：取消会丢当前进度（已生成部分图）→ 先确认；已生成的图片保留 */}
        {shownConfirm === 'cancel' && (
          <div
            role="alert"
            aria-label="取消任务确认"
            className="collapse-in px-4 pb-3 flex flex-wrap items-center justify-end gap-4 animate-collapse-in duration-normal"
          >
            <span className={`text-xs mr-auto ${cancelError ? 'text-[var(--danger)]' : 'text-[var(--text-body)]'}`}>
              {cancelError ?? `取消《${cardLabel}》？已生成的图片会保留，之后可以重试。`}
            </span>
            <button
              type="button"
              disabled={cancelling}
              aria-busy={cancelling}
              onClick={async () => {
                setCancelling(true)
                setCancelError(null)
                try {
                  await cancelJobAPI(task.id)
                  closeConfirm()
                  onDelete?.()
                } catch (err) {
                  console.error(err)
                  setCancelError('取消失败，请稍后重试')
                } finally {
                  setCancelling(false)
                }
              }}
              className={`${btnBase} bg-[var(--danger)] text-white hover:opacity-90`}
            >
              {cancelling ? '处理中…' : '确定取消'}
            </button>
            <button
              type="button"
              disabled={cancelling}
              onClick={closeConfirm}
              className={`${btnBase} bg-[var(--status-cancelled-soft)] text-[var(--text-body)] hover:opacity-80`}
            >
              再想想
            </button>
          </div>
        )}

        {/* 删除内联二次确认 */}
        {shownConfirm === 'delete' && (
          <div
            role="alert"
            aria-label="删除确认"
            className="collapse-in px-4 pb-3 flex flex-wrap items-center justify-end gap-4 animate-collapse-in duration-normal"
          >
            <span className={`text-xs mr-auto ${deleteError ? 'text-[var(--danger)]' : 'text-[var(--text-body)]'}`}>
              {deleteError ?? deleteMessage}
            </span>
            <button
              type="button"
              disabled={deleting}
              aria-busy={deleting}
              onClick={async () => {
                setDeleting(true)
                try {
                  await deleteJobAPI(task.id)
                  closeConfirm()
                  onDelete?.()
                } catch (err) {
                  console.error(err)
                  setDeleteError('删除失败，请稍后重试')
                } finally {
                  setDeleting(false)
                }
              }}
              className={`${btnBase} bg-[var(--danger)] text-white hover:opacity-90`}
            >
              {deleting ? '处理中…' : '确定删除'}
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => { closeConfirm(); setDeleteError(null) }}
              className={`${btnBase} bg-[var(--status-cancelled-soft)] text-[var(--text-body)] hover:opacity-80`}
            >
              再想想
            </button>
          </div>
        )}

        {/* Expanded children：grid 高度过渡 + 逐条揭示 */}
        <div
          id={childrenId}
          className={`grid transition-all duration-normal ease-standard ${expanded && childTasks.length > 0 ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
        >
          <div
            ref={(el) => { if (el) el.inert = !(expanded && childTasks.length > 0) }}
            className="overflow-hidden"
          >
            {childTasks.length > 0 && (
              <div className="px-4 pb-3 pl-8 space-y-2 border-l-2 border-[var(--hairline)] ml-4">
                {childTasks.map((child, idx) => (
                  <div
                    key={child.id}
                    className={expanded ? 'animate-fade-up' : ''}
                    style={{ animationDelay: `${Math.min(idx * 40, 240)}ms` }}
                  >
                    <ChildTaskRow task={child} showActions={showActions} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return <ChildTaskRow task={task} showActions={showActions} />
}
