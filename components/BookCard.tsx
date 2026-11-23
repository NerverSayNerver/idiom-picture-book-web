'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Illustration from '@/components/Illustration'
import { TIER_SETS, imageSrcSet, isTierable, tierUrl } from '@/lib/image-tiers'
import { useAppStore } from '@/lib/store'
import { createJobAPI } from '@/lib/use-jobs'
import { getStrategy } from '@/lib/content-types'
import { getBookCardSubtitle, getBookCardAttribution, formatPoetryAttribution } from '@/lib/book-display'
import type { ContentCategory } from '@/lib/types'

interface BookCardBook {
  id: string
  category: string
  sourceText?: string
  title: string
  meaning: string
  createdAt?: string
  sceneCount?: number
  author?: string
  dynasty?: string
  fullText?: string
  scenes?: Array<{ imageUrl?: string; imageBlob?: Blob; narration?: string; title?: string }>
  idiom?: string
}

interface BookCardProps {
  book: BookCardBook
  /** 只发出删除意图，真正的执行由父级确认模态负责（L2 保护） */
  onDelete: (book: BookCardBook) => void
  entranceDelay?: number
  /** 删除成功后 240ms 淡出用 */
  removing?: boolean
}

// Tailwind JIT 可扫描的字面量类名：0~250ms，第 7 项起统一 250ms
const ENTRANCE_DELAY_CLASSES = [
  '[animation-delay:0ms]',
  '[animation-delay:50ms]',
  '[animation-delay:100ms]',
  '[animation-delay:150ms]',
  '[animation-delay:200ms]',
  '[animation-delay:250ms]',
]

function formatTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

type RegenState = 'idle' | 'confirm' | 'submitting' | 'queued'

export function BookCard({ book, onDelete, entranceDelay = 0, removing = false }: BookCardProps) {
  // 首次挂载即固定延迟：搜索/筛选改变 index 时不重播已存在卡片的入场动画
  const frozenDelayRef = useRef(entranceDelay)
  const delayIndex = Math.min(Math.max(Math.floor(frozenDelayRef.current / 50), 0), 5)
  const [coverImage, setCoverImage] = useState<string | null>(null)
  const [regenState, setRegenState] = useState<RegenState>('idle')
  const [regenError, setRegenError] = useState<string | null>(null)
  const [regenNotice, setRegenNotice] = useState<string | null>(null)
  const queuedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setCurrentIdiom = useAppStore((s) => s.setCurrentIdiom)
  const setCurrentCategory = useAppStore((s) => s.setCurrentCategory)
  const strategy = book.category ? getStrategy(book.category as ContentCategory) : null

  useEffect(() => {
    if (book.scenes && book.scenes.length > 0) {
      const firstScene = book.scenes.find((s) => s.imageUrl)
      if (firstScene?.imageUrl) {
        setCoverImage(firstScene.imageUrl)
        return
      }
    }
    // 尝试从文件系统路径构造封面图 URL
    // 注意：必须用 book.id（经过 sanitizeFilename 净化的文件夹名），
    // 而非 sourceText（原始文本，可能含逗号等标点），否则路径不匹配
    if (book.id && book.category) {
      setCoverImage(`/generated/${book.category}/${book.id}/1.png`)
    }
  }, [book.scenes, book.category, book.id])

  useEffect(() => () => {
    if (queuedTimerRef.current) clearTimeout(queuedTimerRef.current)
  }, [])

  const sourceText = book.sourceText || book.idiom || book.title
  const isPoetry = book.category === 'poetry'
  const isNurseryRhyme = book.category === 'nursery-rhyme'
  const cardSubtitle = getBookCardSubtitle(book as any)
  const poetryAttribution = isPoetry
    ? formatPoetryAttribution({ ...book, sourceText, category: book.category } as any)
    : undefined
  const cardAttribution = getBookCardAttribution(book as any)

  // 「重新生成」三态：进入队列 / 已在队列 / 失败（保留确认态让用户重试）
  const handleRegenerate = async () => {
    if (!sourceText || regenState === 'submitting') return
    setRegenState('submitting')
    setRegenError(null)
    setRegenNotice(null)
    try {
      const result = await createJobAPI(sourceText, book.category || 'idiom')
      if (result?.duplicate) {
        setRegenNotice('这本已经在队列里了，')
        setRegenState('idle')
        return
      }
      setCurrentCategory(book.category as ContentCategory)
      setCurrentIdiom(sourceText)
      setRegenState('queued')
      if (queuedTimerRef.current) clearTimeout(queuedTimerRef.current)
      queuedTimerRef.current = setTimeout(() => setRegenState('idle'), 2000)
    } catch {
      setRegenError('加入队列失败，请重试')
      setRegenState('confirm')
    }
  }

  return (
    // 外层只负责入场动画，内层负责 hover 位移/淡出：避免 fade-up 的 transform/opacity 覆盖
    <div className={`animate-fade-up ${ENTRANCE_DELAY_CLASSES[delayIndex]}`}>
      <div
        className={`bg-white rounded-card overflow-hidden shadow-card [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-cardHover transition-all duration-normal ease-standard relative flex flex-col h-full ${
          removing ? 'opacity-0 scale-[0.98] pointer-events-none' : ''
        }`}
      >
        {/* 品类徽标 */}
        {strategy && (
          <span className="absolute top-2 left-2 z-10 bg-white/90 rounded-full px-2 py-0.5 text-xs font-medium shadow-card text-[var(--text-body)]">
            {strategy.icon} {strategy.label}
          </span>
        )}

        {/* 封面 */}
        <div className="h-40 sm:h-44 lg:h-48 bg-gradient-to-br from-secondary to-primary/20 flex items-center justify-center overflow-hidden shrink-0">
          {coverImage ? (
            <img
              src={isTierable(coverImage) ? tierUrl(coverImage, 480) : coverImage}
              srcSet={isTierable(coverImage) ? imageSrcSet(coverImage, TIER_SETS.shelf.tiers) : undefined}
              sizes={TIER_SETS.shelf.sizes}
              alt={`《${book.title}》封面`}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
              onError={() => setCoverImage(null)}
            />
          ) : (
            <Illustration name="cover-fallback" className="h-full w-full" />
          )}
        </div>

        {/* 信息 */}
        <div className="p-4 flex flex-col flex-1">
          <h3 className="text-lg font-bold text-[var(--text-ink)] mb-1">{book.title}</h3>
          {isPoetry && poetryAttribution && (
            <p className="text-xs text-[var(--warn)] mb-1">{poetryAttribution}</p>
          )}
          {!isPoetry && cardAttribution && (
            <p className="text-xs text-[var(--text-muted)] mb-1">{cardAttribution}</p>
          )}
          <p className="text-xs text-[var(--text-muted)] mb-2 font-mono">{formatTime(book.createdAt)}</p>
          <p className={`text-sm text-[var(--text-body)] mb-4 ${isNurseryRhyme ? 'line-clamp-3 italic' : 'line-clamp-2'}`}>
            {cardSubtitle}
          </p>

          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs bg-[var(--info-soft)] text-[var(--info)] px-2 py-1 rounded-full">
              {book.sceneCount || (book.scenes?.length) || '?'} 个场景
            </span>
          </div>

          {/* 重生成反馈：错误内联红字（不只靠颜色：⚠ + 文案） */}
          {regenError && (
            <p role="alert" className="mb-2 text-[12px] text-[var(--danger)]">
              ⚠ {regenError}
            </p>
          )}
          {regenNotice && (
            <p role="status" className="mb-2 text-[12px] text-[var(--warn)]">
              {regenNotice}
              <Link href="/tasks" className="underline underline-offset-2 hover:text-[var(--brand-strong)] focus-ring rounded-inner">
                去任务中心
              </Link>
              看进度
            </p>
          )}

          {/* 操作按钮 */}
          <div className="flex items-center gap-2 mt-auto">
            <Link
              href={`/read/${book.category}:${encodeURIComponent(book.id)}`}
              aria-label={`阅读《${book.title}》`}
              className="flex-1 flex items-center justify-center h-11 bg-primary text-ink rounded-button text-[14px] font-semibold hover:bg-primary/90 active:scale-[0.97] transition-all duration-fast focus-ring"
            >
              📖 阅读
            </Link>

            {regenState === 'queued' ? (
              <span
                role="status"
                className="flex items-center justify-center h-11 px-3 rounded-button bg-[var(--success-soft)] text-[var(--success)] text-[13px] font-medium whitespace-nowrap"
              >
                ✅ 已加入队列
              </span>
            ) : regenState === 'confirm' || regenState === 'submitting' ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={regenState === 'submitting'}
                  aria-busy={regenState === 'submitting' || undefined}
                  aria-label={`确认重新生成《${book.title}》`}
                  className="px-3 h-11 bg-[var(--brand-strong)] text-white rounded-button text-[13px] font-medium hover:opacity-90 active:scale-[0.97] transition-all duration-fast disabled:opacity-60 disabled:cursor-not-allowed focus-ring whitespace-nowrap"
                >
                  {regenState === 'submitting' ? '…' : '确定'}
                </button>
                <button
                  type="button"
                  onClick={() => { setRegenState('idle'); setRegenError(null) }}
                  disabled={regenState === 'submitting'}
                  className="px-3 h-11 bg-ink/[.06] text-[var(--text-body)] rounded-button text-[13px] font-medium hover:bg-ink/10 active:scale-[0.97] transition-all duration-fast disabled:opacity-60 focus-ring whitespace-nowrap"
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setRegenState('confirm'); setRegenError(null); setRegenNotice(null) }}
                aria-label={`重新生成《${book.title}》`}
                title={`重新生成《${book.title}》`}
                className="flex items-center justify-center w-11 h-11 bg-[var(--brand-strong-soft)] text-[var(--brand-strong)] rounded-button text-sm hover:opacity-85 active:scale-[0.97] transition-all duration-fast focus-ring"
              >
                <span aria-hidden="true">🔄</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onDelete(book)}
              aria-label={`删除《${book.title}》`}
              title={`删除《${book.title}》`}
              className="flex items-center justify-center w-11 h-11 bg-[var(--danger-soft)] text-[var(--danger)] rounded-button text-sm hover:opacity-85 active:scale-[0.97] transition-all duration-fast focus-ring"
            >
              <span aria-hidden="true">🗑️</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
