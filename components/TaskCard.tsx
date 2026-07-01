'use client'

import { useState } from 'react'
import type { Task, TaskStatus, TaskType } from '@/lib/task-types'
import type { SceneTemplate } from '@/lib/types'
import Link from 'next/link'
import { getStrategy } from '@/lib/content-types'
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
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

const statusConfig: Record<TaskStatus, { color: string; icon: string; label: string }> = {
  pending: { color: 'bg-yellow-100 text-yellow-800', icon: '⏳', label: '等待中' },
  running: { color: 'bg-blue-100 text-blue-800', icon: '🔄', label: '执行中' },
  paused: { color: 'bg-orange-100 text-orange-800', icon: '⏸️', label: '已暂停' },
  completed: { color: 'bg-green-100 text-green-800', icon: '✅', label: '已完成' },
  failed: { color: 'bg-red-100 text-red-800', icon: '❌', label: '失败' },
  cancelled: { color: 'bg-gray-100 text-gray-800', icon: '🚫', label: '已取消' },
}

const typeIcons: Record<TaskType, string> = {
  job: '📋',
  decompose: '🤖',
  generate: '🎨',
  save: '💾',
}

const indicatorColor: Record<TaskStatus, string> = {
  pending: 'bg-gray-300',
  running: 'bg-blue-500 animate-pulse',
  paused: 'bg-orange-500',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  cancelled: 'bg-gray-400',
}

const indicatorIcon: Record<TaskStatus, string> = {
  pending: '',
  running: '↻',
  paused: '⏸',
  completed: '✓',
  failed: '✕',
  cancelled: '',
}

// ── Child Task Row ──────────────────────────────────────────

function ChildTaskRow({ task, showActions }: { task: Task; showActions: boolean }) {
  const [showDetail, setShowDetail] = useState(false)
  const [showImageModal, setShowImageModal] = useState(false)
  const [showDecomposeModal, setShowDecomposeModal] = useState(false)
  const [showPromptModal, setShowPromptModal] = useState(false)
  const canShowPrompt = task.status === 'completed' && !!task.prompt
  const elapsed = task.startTime ? formatDuration((task.endTime || Date.now()) - task.startTime) : null
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
    try { return getStrategy((task.category || 'idiom') as any).label } catch { return '内容' }
  })()

  // 类型对应的默认标题
  const typeDefaultTitles: Partial<Record<TaskType, string>> = {
    decompose: `分析${categoryLabel}含义`,
    generate: '生成场景图片',
    save: '保存绘本',
  }

  const hasImage = task.status === 'completed' && task.type === 'generate' && !!task.imageUrl
  const canShowDecompose = task.status === 'completed' && task.type === 'decompose' && !!decomposeMeaning
  const isClickable = task.status === 'failed' || hasImage || canShowDecompose

  return (
    <div>
      <div
        className={`flex items-center space-x-3 p-3 bg-gray-50 rounded-lg ${isClickable ? 'cursor-pointer hover:bg-gray-100 transition-colors' : ''}`}
        onClick={() => {
          if (hasImage) { setShowImageModal(true); return }
          if (canShowDecompose) { setShowDecomposeModal(true); return }
          if (task.status === 'failed') setShowDetail((v) => !v)
        }}
      >
        <div
          className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold ${indicatorColor[task.status]}`}
        >
          {indicatorIcon[task.status]}
        </div>
        <span className="text-lg">{typeIcons[task.type] ?? '❓'}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-800 truncate">
            {task.sceneTitle ?? typeDefaultTitles[task.type] ?? '未命名'}
            {hasImage && ' 🖼️'}
            {canShowDecompose && ' 📊'}
          </div>
          {task.status === 'running' && task.total > 1 && (
            <div className="mt-1">
              <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-xs text-gray-500">{progressPercent}%</span>
            </div>
          )}
          {task.status === 'failed' && !showDetail && (
            <div className="space-y-0.5">
              {task.error && (
                <span className="text-xs text-red-500 block truncate" title={task.error}>
                  ⚠️ {task.error}
                </span>
              )}
              {task.retryCount > 0 && <span className="text-xs text-orange-500">🔄 重试 {task.retryCount}/{task.maxRetries}</span>}
            </div>
          )}
          {task.status === 'failed' && showDetail && (
            <span className="text-xs text-red-600 font-medium">▼ 错误详情</span>
          )}
        </div>
        {elapsed && <span className="text-xs text-gray-400 flex-shrink-0">⏱️ {elapsed}</span>}
        {canShowPrompt && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowPromptModal(true) }}
            className="flex-shrink-0 px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded-md hover:bg-purple-200 transition-colors"
            title="查看 Prompt"
          >
            📊 Prompt
          </button>
        )}
        {showActions && task.status === 'failed' && task.retryCount < (task.maxRetries ?? 3) && (
          <button
            onClick={(e) => { e.stopPropagation(); retryJobAPI(task.id) }}
            className="flex-shrink-0 px-2 py-1 text-xs bg-green-100 text-green-700 rounded-md hover:bg-green-200 transition-colors"
          >
            🔄 重试
          </button>
        )}
      </div>

      {/* 展开详情：错误信息（内联） */}
      {showDetail && task.status === 'failed' && (
        <div className="px-3 pb-3 pl-14">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
            {task.error || '未知错误'}
          </div>
        </div>
      )}

      {/* 图片弹窗 */}
      {showImageModal && hasImage && task.imageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowImageModal(false)}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh] bg-white rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowImageModal(false)}
              className="absolute top-2 right-2 z-10 w-8 h-8 flex items-center justify-center bg-black/40 hover:bg-black/60 text-white rounded-full text-lg transition-colors"
            >
              ✕
            </button>
            <img
              src={task.imageUrl}
              alt={task.sceneTitle || '生成图片'}
              className="max-w-full max-h-[80vh] object-contain"
            />
            {task.sceneTitle && (
              <div className="px-4 py-2 bg-white border-t border-gray-100 text-sm text-gray-600 text-center">
                🎨 {task.sceneTitle}
              </div>
            )}
          </div>
        </div>
      )}

      {/* LLM 分析结果弹窗 */}
      {showDecomposeModal && canShowDecompose && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowDecomposeModal(false)}
        >
          <div
            className="relative w-full max-w-2xl max-h-[85vh] bg-white rounded-xl shadow-2xl overflow-hidden mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">🔍 {categoryLabel}分析结果</h3>
              <button
                onClick={() => setShowDecomposeModal(false)}
                className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-full text-lg transition-colors"
              >
                ✕
              </button>
            </div>

            {/* 内容区 */}
            <div className="px-6 py-4 space-y-4 overflow-y-auto max-h-[calc(85vh-64px)]">
              {/* 标题 */}
              <div>
                <span className="text-xs text-gray-400 uppercase tracking-wide">{categoryLabel}</span>
                <p className="text-2xl font-bold text-primary">{decomposeIdiom}</p>
              </div>

              {/* 含义 */}
              <div>
                <span className="text-xs text-gray-400 uppercase tracking-wide">含义</span>
                <p className="text-gray-700 leading-relaxed">{decomposeMeaning}</p>
              </div>

              {/* 角色描述 */}
              {decomposeCharacterDescription && (
                <div>
                  <span className="text-xs text-gray-400 uppercase tracking-wide">角色设定</span>
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{decomposeCharacterDescription}</p>
                </div>
              )}

              {/* 画风描述 */}
              {decomposeStyleDescription && (
                <div>
                  <span className="text-xs text-gray-400 uppercase tracking-wide">画风</span>
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{decomposeStyleDescription}</p>
                </div>
              )}

              {/* 场景列表 */}
              <div>
                <span className="text-xs text-gray-400 uppercase tracking-wide">场景规划（{decomposeScenes?.length ?? 0} 幕）</span>
                <div className="mt-2 space-y-3">
                  {decomposeScenes?.map((s, i) => (
                    <div key={i} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                      <h4 className="font-semibold text-gray-800 text-sm">
                        场景 {i + 1}：{s.title}
                      </h4>
                      <p className="text-xs text-gray-600 mt-1 line-clamp-2">{s.description}</p>
                      {s.narration && (
                        <p className="text-xs text-gray-400 mt-1 italic line-clamp-1">💬 {s.narration}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Prompt 弹窗 */}
      {showPromptModal && task.prompt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowPromptModal(false)}
        >
          <div
            className="relative w-full max-w-3xl max-h-[85vh] bg-white rounded-xl shadow-2xl overflow-hidden mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">
                📝 {task.type === 'decompose' ? 'LLM 分析 Prompt' : task.type === 'generate' ? '生图 Prompt' : 'Prompt'}
              </h3>
              <button
                onClick={() => setShowPromptModal(false)}
                className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-full text-lg transition-colors"
              >
                ✕
              </button>
            </div>
            {/* 内容区 */}
            <div className="px-6 py-4 overflow-y-auto max-h-[calc(85vh-64px)]">
              <pre className="text-sm text-gray-700 whitespace-pre-wrap break-words bg-gray-50 rounded-lg p-4 border border-gray-100 font-mono">
                {task.prompt}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────

export function TaskCard({ task, expanded = false, onToggle, showActions = true, childTasks = [], jobProgress, onDelete }: TaskCardProps) {
  const status = statusConfig[task.status]
  const elapsed = task.startTime ? formatDuration((task.endTime || Date.now()) - task.startTime) : null

  if (task.type === 'job') {
    const progress = jobProgress ?? { completed: 0, total: 0, percent: 0 }

    return (
      <div className="bg-white rounded-lg border border-gray-100 overflow-hidden shadow-sm">
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={onToggle}
        >
          <div className="flex items-center space-x-2">
            <span className="text-xs text-gray-400 w-4">{expanded ? '▼' : '▶'}</span>
            <span className="text-lg">📚</span>
            <span className="font-medium text-gray-800">{task.idiom ?? task.sourceText ?? '未知内容'}</span>
          </div>
          <div className="flex items-center space-x-3">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
              {status.icon} {status.label}
            </span>
            {elapsed && <span className="text-xs text-gray-400">⏱️ {elapsed}</span>}
          </div>
        </div>

        {/* Progress (多步骤时才显示进度条) */}
        {progress.total > 1 && (
          <div className="px-4 pb-2">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>进度</span>
              <span>
                {progress.completed}/{progress.total} ({progress.percent}%)
              </span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        {showActions && (
          <div className="flex items-center justify-end space-x-2 px-4 pb-3">
            {task.status === 'running' && (
              <button
                onClick={() => pauseJobAPI(task.id)}
                className="px-3 py-1 text-xs bg-yellow-100 text-yellow-700 rounded-md hover:bg-yellow-200 transition-colors"
              >
                ⏸️ 暂停
              </button>
            )}
            {task.status === 'paused' && (
              <button
                onClick={() => resumeJobAPI(task.id)}
                className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors"
              >
                ▶️ 继续
              </button>
            )}
            {['pending', 'running', 'paused'].includes(task.status) && (
              <button
                onClick={() => cancelJobAPI(task.id)}
                className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors"
              >
                ❌ 取消
              </button>
            )}
            {task.status === 'pending' && (
              <>
                <button
                  onClick={async (e) => { e.stopPropagation(); await reorderJobAPI(task.id, 'up'); onDelete?.() }}
                  className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors"
                  title="上移"
                >
                  ↑
                </button>
                <button
                  onClick={async (e) => { e.stopPropagation(); await reorderJobAPI(task.id, 'down'); onDelete?.() }}
                  className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors"
                  title="下移"
                >
                  ↓
                </button>
                <button
                  onClick={async (e) => { e.stopPropagation(); await reorderJobAPI(task.id, 'top'); onDelete?.() }}
                  className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors"
                  title="置顶"
                >
                  ⬆
                </button>
              </>
            )}
            {task.status === 'completed' && (task.idiom || task.sourceText) && (
              <Link
                href={`/read/${task.category || 'idiom'}:${encodeURIComponent(task.idiom || task.sourceText || '')}`}
                className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded-md hover:bg-green-200 transition-colors"
              >
                📖 查看绘本
              </Link>
            )}
            {['completed', 'failed', 'cancelled'].includes(task.status) && (
              <button
                onClick={async (e) => {
                  e.stopPropagation()
                  const isTerminal = task.status === 'failed' || task.status === 'cancelled'
                  const msg = isTerminal
                    ? `确定删除此${task.status === 'failed' ? '失败' : '取消'}任务？将同时清理已生成的临时文件。`
                    : '确定删除此任务记录？生成的绘本不受影响。'
                  if (!window.confirm(msg)) return
                  await deleteJobAPI(task.id)
                  onDelete?.()
                }}
                className="px-3 py-1 text-xs bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors"
              >
                🗑️ 删除
              </button>
            )}
          </div>
        )}

        {/* Expanded children */}
        {expanded && childTasks.length > 0 && (
          <div className="px-4 pb-3 pl-8 space-y-2 border-l-2 border-gray-200 ml-4">
            {childTasks.map((child) => (
              <ChildTaskRow key={child.id} task={child} showActions={showActions} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return <ChildTaskRow task={task} showActions={showActions} />
}
