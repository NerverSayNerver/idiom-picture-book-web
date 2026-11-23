'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AnimationEvent as ReactAnimationEvent,
  CSSProperties,
  TransitionEvent as ReactTransitionEvent,
} from 'react'
import Link from 'next/link'
import type { PictureBook, Scene } from '@/lib/types'
// 只取类型：generatePDF/triggerDownload 走动态 import，避免 jspdf/html2canvas 进首屏包
import type { PDFResult } from '@/lib/pdf'
import { VideoGenerator } from './VideoGenerator'
import { DesktopPageDots, MobilePagerBar, PagerArrow } from './PagerBar'
import { useTTS } from '@/hooks/useTTS'
import { useSwipePager } from '@/hooks/useSwipePager'
import { usePagePrefetch } from '@/hooks/use-prefetch'
import type { PageQuality } from '@/hooks/use-prefetch'
import { TIER_SETS, isTierable, tierUrl } from '@/lib/image-tiers'
import type { ImageTier } from '@/lib/image-tiers'
import { getStrategy } from '@/lib/content-types'
import { getBookFullText, formatPoetryAttribution } from '@/lib/book-display'

interface BookViewerProps {
  book: PictureBook
}

const RATES = [0.5, 0.75, 1.0, 1.25, 1.5]

// 阅读进度 localStorage 键：{ [bookId]: 页码索引（0=封面）}
const PROGRESS_KEY = 'pb-reading-progress'

// 连续翻页冷却：落定后 300ms 内拒绝再次翻页，避免儿童连点"越按越远"
const FLIP_COOLDOWN_MS = 300
// 移动端单页位移淡出/淡入
const SLIDE_MS = 240
// 恢复提示淡出时长（与 duration-fast 对齐）
const HINT_FADE_MS = 180
// 动画兜底解锁：animationend / transitionend 丢失时保底
const FLIP_FALLBACK_MS = 700
const SLIDE_FALLBACK_MS = 440
const FADE_FALLBACK_MS = 420
// 朗读中手动翻页 → 防抖后从新页重开朗读
const TTS_RESTART_DEBOUNCE_MS = 250
// 手动翻页后这段时间内的 TTS 自动推进一律丢弃，避免两套导航抢页
const MANUAL_NAV_GUARD_MS = 600
// 自动推进撞上拖拽：松手后延迟再推进
const AUTO_ADVANCE_SETTLE_MS = 120
const TOAST_MS = 3200

// ── 加载体验（阈值全部来自 docs/superpowers/specs/2026-11-23-loading-ux-spec.md）──
/** 占位：0–300ms 什么都不显示（靠容器渐变底），300ms 起扫光 */
const IMG_HINT_SHEEN_MS = 300
/** 1200ms 起才出文案。4G 正常路径永远到不了，出现即代表「这次慢了」 */
const IMG_HINT_TEXT_MS = 1200
/** 5s 起给自救手段（慢网提示 + 重试），不等自动重试走完 */
const IMG_HINT_SLOW_MS = 5000
/** 2×6s 超时 + 0.8s 退避 → 最坏 13s 内必须给出确定态 */
const IMG_FAIL_MS = 12800
/** P0（看得见的图）只重试 1 次，固定退避；预取（看不见的图）不重试 */
const IMG_RETRY_BACKOFF_MS = 800
/** 播报防抖：略大于 TTS_RESTART_DEBOUNCE_MS(250)，避免先播页码再被 TTS 打断 */
const ANNOUNCE_DEBOUNCE_MS = 300
/** 快扫判定：2s 内 ≥3 次落定 */
const SKIM_WINDOW_MS = 2000
const SKIM_FLIPS = 3
/** 连续 800ms 无落定 → 退出快扫 */
const SKIM_EXIT_MS = 800

const DESKTOP_MQ = '(min-width: 768px)'
const EASE_ENTER = 'cubic-bezier(0.22, 1, 0.36, 1)'
const EASE_EXIT = 'cubic-bezier(0.4, 0, 1, 1)'

type NavSource = 'manual' | 'auto'
type FlipKind = 'leaf' | 'slide' | 'fade'

interface FlipState {
  from: number
  dir: 'next' | 'prev'
  kind: FlipKind
  /** 滑动手势松手瞬间的位移，用于让出页快照从当前位置无缝续接 */
  offset: number
  source: NavSource
}

interface ToastState {
  id: number
  text: string
  tone: 'info' | 'success' | 'error'
}

type PdfState =
  | { status: 'idle' }
  | {
    status: 'running'
    /** onProgress 首次回调在封面渲染完之后，done=0 表示还在准备 */
    done: number
    total: number
    /** 取消只在页间检查，点取消到真正中断有 1–2s 延迟，需要中间态 */
    cancelling: boolean
  }

/** 双重 reduced-motion 判断：系统偏好 + 顶层 .motion-reduced 手动开关 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true ||
    document.documentElement.classList.contains('motion-reduced')
  )
}

/** 拖拽透明度：与 useSwipePager 内部公式保持一致，保证提交瞬间不闪 */
function dragOpacity(offset: number): number {
  const width = typeof window === 'undefined' ? 375 : window.innerWidth
  const ratio = Math.min(Math.abs(offset) / (width * 0.6 || 1), 1)
  return 1 - 0.28 * ratio
}

/**
 * React 18.3 的 DOM 属性白名单里还没有 `fetchPriority`（19 才原生支持），
 * 用全小写 + spread 直接落到 DOM 上：浏览器读得到，dev 也不会报「React 不认识这个 prop」。
 * 值必须与渲染的实际优先级一致 —— 只有屏幕上这一页是 high。
 */
const PRIORITY_HIGH = { fetchpriority: 'high' } as unknown as { fetchPriority?: 'high' }
const PRIORITY_LOW = { fetchpriority: 'low' } as unknown as { fetchPriority?: 'low' }

const QUALITY_RANK: Record<PageQuality, number> = { full: 0, reduced: 1, minimal: 2 }

/**
 * 会话质量档：挂载时判定一次，本次阅读期间**只降不升**
 * （升档 = 二次下载 + 可见的清晰度跳变，两个成本都换不到可感收益）。
 *
 * iOS Safari 全版本没有 `navigator.connection` → 先按 `full` 走。
 * 实测吞吐回退（规范 §2.1）本轮未接：它需要在落地后改档，而已渲染页不回补需要
 * 按页锁档，收益只在「真的弱网的 iPhone」上，风险却覆盖所有 iPhone，留待单独一轮。
 */
function detectQuality(): PageQuality {
  if (typeof navigator === 'undefined') return 'full'
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  if (!conn) return 'full'
  if (conn.saveData === true) return 'minimal'
  const effectiveType = conn.effectiveType
  if (effectiveType === 'slow-2g' || effectiveType === '2g') return 'minimal'
  if (effectiveType === '3g') return 'reduced'
  return 'full'
}

/**
 * 重试题材的 URL 变体。只在 P0（用户看得见的那张）重试时用：
 * 同一个失败 URL 会被浏览器的负缓存立刻再判失败，必须变一个字节才真的重发。
 * 预取的 URL 永远不带这个 token —— 预取 URL 必须与渲染 URL 逐字节一致。
 */
function withRetryToken(url: string, token: number): string {
  if (!token) return url
  return `${url}${url.includes('?') ? '&' : '?'}retry=${token}`
}

type MediaPhase = 0 | 1 | 2 | 3 | 4 // 0 无反馈 / 1 扫光 / 2 文案 / 3 慢网+重试 / 4 失败

interface SceneMediaProps {
  src: string
  page: number
  alt: string
  /** 已在内存（B0 命中 / 本次会话看过）：不做淡入、不显示占位，翻页快照不会闪一下白 */
  cached: boolean
  /** 只有当前可见页显示占位与失败态；旧页/叶页快照一律 false（占位层绝不能进 3D 翻页层） */
  active: boolean
  /** 快扫模式：不显示扫光、不显示失败态（快速翻页时它们会变成闪烁噪声） */
  skim: boolean
  /** 0 = 还没重试过 */
  retryToken: number
  onSettled: (page: number, ok: boolean) => void
  onRetry: (page: number) => void
}

/**
 * 场景插图：位图 + 占位 + 失败态。**零新增动画**，全部复用既有 token：
 * 底 = 调用方容器的渐变（本来就是布局的一部分，所以「占位出现」没有颜色跳跃）；
 * 扫光 = `.progress-sheen`（在 globals.css 的两条 reduced-motion 停用列表里）；
 * 淡入 = `duration-normal ease-enter`（240ms，与移动 slide 同档）。
 */
function SceneMedia({ src, page, alt, cached, active, skim, retryToken, onSettled, onRetry }: SceneMediaProps) {
  const [loaded, setLoaded] = useState(cached)
  const [decoded, setDecoded] = useState(cached)
  const [phase, setPhase] = useState<MediaPhase>(0)
  const retryTimerRef = useRef<number | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  // 换页 / 重试 = 换 src：状态与计时器从头走（重试后不能直接跳回「正在画这一页…」的第 5 秒）
  useEffect(() => {
    setLoaded(cached)
    setDecoded(cached)
    setPhase(0)
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
  }, [src, cached])

  useEffect(() => () => {
    if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current)
  }, [])

  // 反馈阈值阶梯：只允许单调前进，避免「文案先于扫光出现」
  useEffect(() => {
    if (loaded || !active) return
    const timers = [
      window.setTimeout(() => setPhase((p) => (p > 1 ? p : 1)), IMG_HINT_SHEEN_MS),
      window.setTimeout(() => setPhase((p) => (p > 2 ? p : 2)), IMG_HINT_TEXT_MS),
      window.setTimeout(() => setPhase((p) => (p > 3 ? p : 3)), IMG_HINT_SLOW_MS),
      window.setTimeout(() => setPhase(4), IMG_FAIL_MS),
    ]
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [src, loaded, active])

  const handleLoad = () => {
    setLoaded(true)
    // H2 的 decoded 必须是 decode() resolved，不是 onload —— 验收用它算 B0 命中率
    imgRef.current?.decode?.().then(() => setDecoded(true)).catch(() => setDecoded(true))
    onSettled(page, true)
  }

  const handleError = () => {
    onSettled(page, false)
    if (!active) return
    if (retryToken === 0) {
      // P0 重试 1 次，固定退避 800ms。第二次仍失败就是确定态。
      if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current)
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null
        onRetry(page)
      }, IMG_RETRY_BACKOFF_MS)
      return
    }
    setPhase(4)
  }

  const failed = phase === 4
  const showPlaceholder = !loaded && !failed
  const imgStatus = failed ? 'error' : decoded || cached ? 'decoded' : 'pending'

  return (
    <>
      {/* H1：占位一出现就可观测，不能拿延迟 300ms 的 .progress-sheen 代替，
          否则「短暂占位」会被误判成 B0 命中。此层不参与视觉，只承载 data 属性。 */}
      {showPlaceholder && <div data-img-placeholder="1" aria-hidden="true" className="absolute inset-0" />}
      <img
        ref={imgRef}
        data-img-status={imgStatus}
        src={src}
        alt={alt}
        width={1024}
        height={768}
        loading="eager"
        decoding="async"
        {...(active ? PRIORITY_HIGH : PRIORITY_LOW)}
        onLoad={handleLoad}
        onError={handleError}
        className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-normal ease-enter ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* 占位：装饰性，状态由 BookViewer:1125 那唯一的 live region 承载 */}
      {showPlaceholder && active && phase >= 1 && !skim && (
        <div aria-hidden="true" className="progress-sheen absolute inset-0" />
      )}
      {showPlaceholder && active && phase >= 2 && (
        <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center px-4 text-center">
          <p className="animate-fade-in text-[12.5px] leading-[1.6] text-[var(--text-muted)]">
            {phase >= 3 ? '网络有点慢，可以先点朗读' : '正在画这一页…'}
          </p>
        </div>
      )}
      {showPlaceholder && active && phase >= 3 && !skim && (
        <div className="absolute inset-x-0 bottom-3 flex justify-center">
          <button
            type="button"
            onClick={() => onRetry(page)}
            className="inline-flex min-h-11 items-center rounded-button bg-white/95 px-5 text-[13px] font-semibold text-[var(--text-ink)] shadow-card ring-1 ring-ink/[0.12]"
          >
            <span aria-hidden="true" className="mr-1">🔄</span> 重试
          </button>
        </div>
      )}

      {/* 失败态：只出现在当前可见页；不新增 live region，用 role="alert" */}
      {failed && active && !skim && (
        <div
          role="alert"
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center"
        >
          <span aria-hidden="true" className="text-2xl leading-none">🖼️</span>
          <p className="text-[15px] font-semibold text-[var(--text-ink)]">这一页的画没加载出来</p>
          <p className="text-[12.5px] leading-[1.6] text-[var(--text-body)]">可以重试，也可以继续听朗读</p>
          <button
            type="button"
            onClick={() => onRetry(page)}
            className="mt-1 inline-flex min-h-11 items-center rounded-button bg-primary px-5 text-[13px] font-semibold text-ink shadow-card ring-1 ring-ink/[0.16]"
          >
            <span aria-hidden="true" className="mr-1">🔄</span> 重试
          </button>
        </div>
      )}
    </>
  )
}

/**
 * 封面缩略图：逐格独立淡入，**绝不 all-or-nothing**（最慢那张决定整墙时间，
 * 且任意一张失败整墙就永不出现）。未到位时格子里是恒定的 `brand-strong-soft` 底色，
 * 格子本身已有标题文字与完整 `aria-label`，所以「图没到」不等于「无名可点目标」。
 */
function ThumbImage({ src, desktopSrc, onSettled }: {
  src: string; desktopSrc?: string; onSettled?: () => void
}) {
  const [status, setStatus] = useState<'pending' | 'loaded' | 'error'>('pending')
  const settledRef = useRef(false)
  // 换 src（重生成绘本）后状态必须归零，不能沿用上一张图的 loaded
  useEffect(() => {
    setStatus('pending')
    settledRef.current = false
  }, [src])
  const settle = (next: 'loaded' | 'error') => {
    setStatus(next)
    if (!settledRef.current) {
      settledRef.current = true
      onSettled?.()
    }
  }
  return (
    // 用 <picture media> 按**视口断点**选档，不用 srcSet/sizes：
    // 后者会让浏览器按 DPR3 把 157px 的移动格子升到 480w（6 张 180KB，顶满预算），
    // 与「墙按格宽取档、不按 DPR」的硬规则冲突。media 查询不受 DPR 影响。
    <picture>
      {desktopSrc && <source media="(min-width: 640px)" srcSet={desktopSrc} />}
      <img
        data-thumb-status={status}
        src={src}
        alt=""
        width={1024}
        height={768}
        loading="lazy"
        decoding="async"
        onLoad={() => settle('loaded')}
        onError={() => settle('error')}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-normal ease-enter ${
          status === 'loaded' ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </picture>
  )
}

export function BookViewer({ book }: BookViewerProps) {
  // ── 页码：0=封面, 1~N=场景, N+1=含义页 ────────────────
  const [currentPage, setCurrentPage] = useState(0)
  // ref 与 state 同步写入：TTS 回调是注册进 hook 的长期闭包，不能依赖 useState 快照
  const currentPageRef = useRef(0)
  const setPage = useCallback((page: number) => {
    currentPageRef.current = page
    setCurrentPage(page)
  }, [])

  // ── 翻页状态机 ────────────────────────────────────────
  // flip.from 固定为旧页快照，动画期间绝不跟随 currentPage 变化
  const [flip, setFlip] = useState<FlipState | null>(null)
  const flipRef = useRef<FlipState | null>(null)
  // 移动端位移动画的二段触发（先落 DOM 的首帧样式，再翻到目标样式）
  const [slideArmed, setSlideArmed] = useState(false)
  const [bookOpen, setBookOpen] = useState(false) // 封面→场景开书动画是否已落定
  const isFlippingRef = useRef(false)
  const lastFlipAtRef = useRef(0)
  const flipFallbackTimerRef = useRef<number | null>(null)
  const ttsErrorTimerRef = useRef<number | null>(null)
  const ttsRestartTimerRef = useRef<number | null>(null)
  const autoAdvanceTimerRef = useRef<number | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const manualNavAtRef = useRef(0)
  const autoAdvancePendingRef = useRef<number | null>(null)
  const pendingSeekRef = useRef<number | null>(null)
  const seekRetryTimerRef = useRef<number | null>(null)
  const swipeDraggingRef = useRef(false)
  const isReadingModeRef = useRef(false)
  const isPlayingRef = useRef(false)
  const dialogOpenRef = useRef(false)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const planeRef = useRef<HTMLDivElement | null>(null)
  const moreBtnRef = useRef<HTMLButtonElement | null>(null)
  const drawerRef = useRef<HTMLDivElement | null>(null)

  // ── 视图 / UI 状态 ───────────────────────────────────
  const [isWide, setIsWide] = useState(false) // ≥768：双页跨页 + 3D 半页翻页
  const isWideRef = useRef(false)
  const [announcement, setAnnouncement] = useState('')
  const [toast, setToast] = useState<ToastState | null>(null)
  const [toolbarOpen, setToolbarOpen] = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [showVideoGenerator, setShowVideoGenerator] = useState(false)
  const [ttsError, setTTSError] = useState(false)
  const [pdf, setPdf] = useState<PdfState>({ status: 'idle' })
  /** iOS 专用：生成完成后挂到真实 <a download> 上，等用户第二次点击（新鲜手势才不会被拦） */
  const [pdfResult, setPdfResult] = useState<PDFResult | null>(null)
  const pdfBusyRef = useRef(false)
  const pdfCancelRef = useRef(false)
  const pdfCancelSignalRef = useRef<{ cancelled: boolean } | null>(null)
  const pdfResultRef = useRef<PDFResult | null>(null)
  const mountedRef = useRef(true)

  // ── 阅读进度记忆 ─────────────────────────────────────
  const [hydrated, setHydrated] = useState(false)
  const [progressRestored, setProgressRestored] = useState(false)
  const [hintLeaving, setHintLeaving] = useState(false)

  const categoryLabel = (() => {
    try { return getStrategy(book.category).label } catch { return '内容' }
  })()
  const isPoetry = book.category === 'poetry'
  const isNurseryRhyme = book.category === 'nursery-rhyme'
  const fullText = getBookFullText(book)
  const poetryAttribution = isPoetry ? formatPoetryAttribution(book) : undefined
  const meaningPageTitle = isPoetry ? '诗意解读' : isNurseryRhyme ? '儿歌寓意' : `${categoryLabel}含义`
  const reviewTitle = isPoetry ? '全诗回顾' : isNurseryRhyme ? '歌词回顾' : '故事回顾'
  const reviewDoneText = isPoetry ? '🎉 读完啦！' : isNurseryRhyme ? '🎉 唱完啦！' : '🎉 故事讲完啦！'
  const totalPages = book.scenes.length + 2 // 封面 + 场景 + 含义页
  const sceneUnit = isPoetry ? '句' : isNurseryRhyme ? '段' : '幕'

  const isCover = currentPage === 0
  const isMeaningPage = currentPage === totalPages - 1
  const sceneIndex = currentPage - 1

  // ── 响应式断点 ───────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MQ)
    const sync = () => {
      isWideRef.current = mq.matches
      setIsWide(mq.matches)
    }
    sync()
    mq.addEventListener?.('change', sync)
    return () => mq.removeEventListener?.('change', sync)
  }, [])

  useEffect(() => {
    dialogOpenRef.current = toolbarOpen || showVideoGenerator
  }, [toolbarOpen, showVideoGenerator])

  // ── 恢复上次阅读位置（仅一次，按 book.id）──────────
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PROGRESS_KEY)
      if (raw) {
        const map = JSON.parse(raw) as Record<string, number>
        const saved = map[book.id]
        const lastPage = book.scenes.length + 1
        if (typeof saved === 'number' && Number.isInteger(saved) && saved >= 1 && saved <= lastPage) {
          setPage(saved)
          setProgressRestored(true)
        }
      }
    } catch {
      // localStorage 不可用或数据损坏，忽略
    }
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id])

  // 恢复提示：3.5s 后淡出，再 180ms 卸载
  useEffect(() => {
    if (!progressRestored) return
    const leaveTimer = setTimeout(() => setHintLeaving(true), 3500)
    const removeTimer = setTimeout(() => {
      setProgressRestored(false)
      setHintLeaving(false)
    }, 3500 + HINT_FADE_MS)
    return () => {
      clearTimeout(leaveTimer)
      clearTimeout(removeTimer)
    }
  }, [progressRestored])

  // 页面变化时保存进度；读到含义页视为读完，清除记录
  useEffect(() => {
    if (!hydrated) return
    try {
      const raw = window.localStorage.getItem(PROGRESS_KEY)
      const map: Record<string, number> = raw ? JSON.parse(raw) : {}
      const lastPage = book.scenes.length + 1
      if (currentPage >= 1 && currentPage < lastPage) {
        map[book.id] = currentPage
      } else {
        delete map[book.id]
      }
      window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(map))
    } catch {
      // 隐私模式等场景下写入失败，忽略
    }
  }, [hydrated, currentPage, book.id, book.scenes.length])

  // 场景描述展开状态随页切换复位
  useEffect(() => {
    setDescExpanded(false)
  }, [currentPage])

  // 卸载清理所有定时器
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (flipFallbackTimerRef.current) clearTimeout(flipFallbackTimerRef.current)
      if (ttsErrorTimerRef.current !== null) clearTimeout(ttsErrorTimerRef.current)
      if (ttsRestartTimerRef.current !== null) clearTimeout(ttsRestartTimerRef.current)
      if (autoAdvanceTimerRef.current !== null) clearTimeout(autoAdvanceTimerRef.current)
      if (seekRetryTimerRef.current !== null) clearTimeout(seekRetryTimerRef.current)
      if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current)
      if (announceTimerRef.current !== null) clearTimeout(announceTimerRef.current)
      if (skimExitTimerRef.current !== null) clearTimeout(skimExitTimerRef.current)
      // 卸载时通知 PDF 生成器尽快停下，并释放仍持有的 blob（生命周期兜底出口）
      if (pdfCancelSignalRef.current) pdfCancelSignalRef.current.cancelled = true
      pdfResultRef.current?.revoke()
      pdfResultRef.current = null
    }
  }, [])

  // ── Toast ────────────────────────────────────────────
  const showToast = useCallback((text: string, tone: ToastState['tone'] = 'info') => {
    if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current)
    setToast({ id: Date.now(), text, tone })
    toastTimerRef.current = window.setTimeout(() => {
      toastTimerRef.current = null
      setToast(null)
    }, TOAST_MS)
  }, [])

  // ── 读屏文案（页码一律 1 起算）────────────────────────
  const pageLabel = useCallback((page: number) => {
    if (page === 0) return `封面，共 ${totalPages} 页`
    if (page === totalPages - 1) return `含义页，第 ${totalPages} 页`
    return `第 ${page + 1} 页，第 ${page} ${sceneUnit}，共 ${totalPages} 页`
  }, [totalPages, sceneUnit])

  const describePage = useCallback((page: number) => {
    if (page === 0) return `封面，《${book.title}》`
    if (page === totalPages - 1) return `含义页，共 ${totalPages} 页`
    const scene = book.scenes[page - 1]
    return `第 ${page + 1} 页，共 ${totalPages} 页，第 ${page} ${sceneUnit}：${scene?.title ?? ''}`
  }, [book.title, book.scenes, totalPages, sceneUnit])

  // ── TTS ──────────────────────────────────────────────
  const handleTTSError = useCallback(() => {
    setTTSError(true)
    if (ttsErrorTimerRef.current !== null) clearTimeout(ttsErrorTimerRef.current)
    ttsErrorTimerRef.current = window.setTimeout(() => {
      ttsErrorTimerRef.current = null
      setTTSError(false)
    }, 3500)
  }, [])

  const {
    isPlaying,
    isPaused,
    rate,
    currentCharIndex,
    speak,
    speakScenes,
    stop,
    clearHighlight,
    togglePause,
    setRate: setTTSRate,
    isSupported,
  } = useTTS({ onError: handleTTSError })

  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  // 缓存 Blob URL，避免每次渲染新建
  const sceneBlobUrls = useMemo(() => {
    const urls: Map<number, string> = new Map()
    book.scenes.forEach((s) => {
      if (!s.imageUrl && s.imageBlob) urls.set(s.id, URL.createObjectURL(s.imageBlob))
    })
    return urls
  }, [book.scenes])

  const getSceneImageUrl = useCallback((scene: Scene) => {
    if (scene.imageUrl) return scene.imageUrl
    if (scene.imageBlob) return sceneBlobUrls.get(scene.id) || ''
    if (book.category && book.sourceText) {
      return `/generated/${book.category}/${book.sourceText}/${scene.id}.png`
    }
    return ''
  }, [book.category, book.sourceText, sceneBlobUrls])

  useEffect(() => () => {
    sceneBlobUrls.forEach((url) => URL.revokeObjectURL(url))
  }, [sceneBlobUrls])

  // ── 会话质量档（只降不升）────────────────────────────
  const [quality, setQuality] = useState<PageQuality>('full')

  useEffect(() => {
    setQuality(detectQuality())
    const conn = (navigator as Navigator & {
      connection?: { addEventListener?: (type: 'change', cb: () => void) => void; removeEventListener?: (type: 'change', cb: () => void) => void }
    }).connection
    if (!conn?.addEventListener) return
    // change 事件只允许降档：升档会让已渲染的页回补高清 = 二次下载 + 可见清晰度跳变
    const onChange = () => {
      const next = detectQuality()
      setQuality((prev) => (QUALITY_RANK[next] >= QUALITY_RANK[prev] ? next : prev))
    }
    conn.addEventListener('change', onChange)
    return () => conn.removeEventListener?.('change', onChange)
  }, [])

  // ── 快扫模式（skimMode）──────────────────────────────
  // 2s 内 ≥3 次手动落定 = 孩子在快速浏览：窗口收为 {+1}、并发 1、不显示扫光与失败态、播报防抖
  const [skimMode, setSkimMode] = useState(false)
  const skimStampsRef = useRef<number[]>([])
  const skimExitTimerRef = useRef<number | null>(null)

  const noteFlipLanded = useCallback(() => {
    const now = Date.now()
    const stamps = skimStampsRef.current.filter((at) => now - at <= SKIM_WINDOW_MS)
    stamps.push(now)
    skimStampsRef.current = stamps
    if (stamps.length >= SKIM_FLIPS) setSkimMode(true)
    if (skimExitTimerRef.current !== null) window.clearTimeout(skimExitTimerRef.current)
    skimExitTimerRef.current = window.setTimeout(() => {
      skimExitTimerRef.current = null
      skimStampsRef.current = []
      setSkimMode(false)
    }, SKIM_EXIT_MS)
  }, [])

  /** 退出条件之二：当前页图片 settled（用户停下并等到了图）。仍在连翻时不要打断 */
  const maybeExitSkim = useCallback(() => {
    const last = skimStampsRef.current[skimStampsRef.current.length - 1] ?? 0
    if (Date.now() - last < SKIM_EXIT_MS) return
    skimStampsRef.current = []
    setSkimMode(false)
  }, [])

  /**
   * 封面缩略图墙第一行（移动 2 格）落定前，不预取第 1 页。
   * 6 格 ×19KB 若与 95KB 的正文图均分带宽，「首格有图 ≤2.2s」会被挤到 3s+。
   * 优先级不是抽象序号，是先后顺序。
   */
  const [coverRowSettled, setCoverRowSettled] = useState(false)
  const coverSettledCountRef = useRef(0)
  useEffect(() => {
    coverSettledCountRef.current = 0
    setCoverRowSettled(false)
  }, [book.id])
  const noteCoverThumbSettled = useCallback(() => {
    coverSettledCountRef.current += 1
    if (coverSettledCountRef.current >= 2) setCoverRowSettled(true)
  }, [])

  // ── 图片档位（唯一产地：lib/image-tiers.ts）─────────────
  // 桌面用 1024（跨页半页 ~600px，DPR2 需 1200px，封顶 1024）；
  // 移动用 768（单页显示宽 ~272px，768 已是 2.8×，DPR3 所需 816px 也只差 6%），
  // 省下的 30KB/页正好让「只看封面就走」的封面预取不击穿 180KB 预算。
  // 弱网一律 768。渲染与预取共用 sceneImgUrl，URL 永远一致。
  const readerTier: ImageTier = quality === 'full' && isWide ? 1024 : 768

  /**
   * 场景图 URL 的**唯一**产地：`getSceneImageUrl()` 给出原始路径，这里加档位。
   * `<img src>` 与预取器都调它 —— 两边各算一次 = 预取下 A 档、渲染要 B 档 = 双倍下载。
   */
  const sceneImgUrl = useCallback((scene: Scene) => {
    const raw = getSceneImageUrl(scene)
    if (!raw) return ''
    return isTierable(raw) ? tierUrl(raw, readerTier) : raw // blob:/远程 URL 原样用，不参与档位
  }, [getSceneImageUrl, readerTier])

  const prefetchPages = useMemo(() => {
    return book.scenes
      .map((scene, index) => ({ page: index + 1, url: sceneImgUrl(scene) }))
      .filter((entry) => entry.url !== '')
  }, [book.scenes, sceneImgUrl])

  const {
    isDecoded,
    reportSettled,
    notifyRetry,
    noteFlip,
  } = usePagePrefetch({
    pages: prefetchPages,
    currentPage,
    totalPages,
    quality,
    // 导出 PDF / 打开抽屉或视频面板时暂停：否则弱网下预取会和导出抢带宽，退化成「PDF 导出失败」
    paused: pdf.status === 'running' || toolbarOpen || showVideoGenerator || (currentPage === 0 && !coverRowSettled),
    skimMode,
  })

  // ── 播报：全部走唯一那个 aria-live 区域 ─────────────────
  const announceTimerRef = useRef<number | null>(null)
  /** 落定时图还没到位、且在等待的页：图到位后补一条「已加载」闭合状态 */
  const pendingImageRef = useRef(new Set<number>())
  /** 每页的「图片已加载」只播一次 */
  const loadedAnnouncedRef = useRef(new Set<number>())

  /**
   * aria-live 写入节奏。手动落定最快 3 次/秒（FLIP_COOLDOWN_MS=300），
   * 而一次 utterance 要 1.5–2s：不防抖会让读屏队列积压 6s+，用户听到「第2页第3页第4页」的残句。
   * 300ms 略大于 TTS_RESTART_DEBOUNCE_MS(250)，避免先播页码再被 TTS 打断。
   */
  const announce = useCallback((text: string, immediate = false) => {
    if (!text) return
    if (announceTimerRef.current !== null) window.clearTimeout(announceTimerRef.current)
    const write = () => {
      announceTimerRef.current = null
      setAnnouncement(text)
    }
    if (immediate) {
      write()
      return
    }
    announceTimerRef.current = window.setTimeout(write, ANNOUNCE_DEBOUNCE_MS)
  }, [])

  // 图片重试：换一个 src 变体逼浏览器真的重发（同一失败 URL 会被负缓存秒判失败）
  const [retryTokens, setRetryTokens] = useState<Record<number, number>>({})

  const handleSceneRetry = useCallback((page: number) => {
    notifyRetry(page)
    loadedAnnouncedRef.current.delete(page)
    setRetryTokens((prev) => ({ ...prev, [page]: (prev[page] ?? 0) + 1 }))
  }, [notifyRetry])

  const handleSceneSettled = useCallback((page: number, ok: boolean) => {
    reportSettled(page, ok)
    if (!ok) return
    maybeExitSkim()
    // 「停留期间图到位」的四个条件：仍在该页 / 该页只播一次 / 未在朗读 / 未开弹窗
    if (page !== currentPageRef.current) return
    if (isPlayingRef.current || dialogOpenRef.current) return
    if (!pendingImageRef.current.delete(page)) return
    if (loadedAnnouncedRef.current.has(page)) return
    loadedAnnouncedRef.current.add(page)
    announce(`第 ${page + 1} 页的图片已加载`)
  }, [announce, maybeExitSkim, reportSettled])

  // ── 朗读推进（先声明 ref，避免与 goToPage 形成循环依赖）──
  const advanceRef = useRef<(page: number, dir: 'next' | 'prev') => void>(() => {})

  const startSceneReading = useCallback((startIndex: number) => {
    if (startIndex < 0 || startIndex >= book.scenes.length) {
      isReadingModeRef.current = false
      return
    }
    speakScenes(
      book.scenes.map((s) => ({ narration: s.narration })),
      startIndex,
      (sceneIdx) => {
        // 手动翻页刚发生：丢弃这一拍自动推进，避免和 250ms 重启抢页
        if (Date.now() - manualNavAtRef.current < MANUAL_NAV_GUARD_MS) return
        const nextPage = sceneIdx + 2 // +1 封面，+1 下一幕
        if (nextPage >= totalPages) {
          isReadingModeRef.current = false
          return
        }
        // 用户正在拖拽：等松手后再推进
        if (swipeDraggingRef.current) {
          autoAdvancePendingRef.current = nextPage
          return
        }
        const dir = nextPage > currentPageRef.current ? 'next' : 'prev'
        advanceRef.current(nextPage, dir)
      },
    )
  }, [book.scenes, speakScenes, totalPages])

  /** 从指定页恢复朗读（手动翻页后保持视听一致） */
  const restartReadingAtPage = useCallback((page: number) => {
    if (page <= 0) {
      isReadingModeRef.current = true
      startSceneReading(0)
      return
    }
    if (page >= totalPages - 1) {
      // 含义页由「含义页朗读」effect 接手
      return
    }
    isReadingModeRef.current = true
    startSceneReading(page - 1)
  }, [startSceneReading, totalPages])

  /** 翻页落定后的统一收尾：TTS 冲突处理 + 读屏播报 */
  const handleLanding = useCallback((fromPage: number, toPage: number, source: NavSource) => {
    // 快扫判定只统计手动落定（TTS 自动推进每几秒才一拍，混进来会污染信号）
    if (source === 'manual') noteFlipLanded()

    if (source === 'manual' && isReadingModeRef.current) {
      if (toPage === 0) {
        // 回到封面：朗读无对应内容，直接停
        stop()
        isReadingModeRef.current = false
      } else if (Math.abs(toPage - fromPage) > 1) {
        // 跨页跳转：内容完全错位，停止而非硬接
        stop()
        isReadingModeRef.current = false
        showToast('已跳转，朗读已停止', 'info')
      } else if (toPage !== totalPages - 1) {
        // 相邻页：防抖后若仍在朗读，则从新页对应场景重开
        if (ttsRestartTimerRef.current !== null) clearTimeout(ttsRestartTimerRef.current)
        ttsRestartTimerRef.current = window.setTimeout(() => {
          ttsRestartTimerRef.current = null
          if (!isReadingModeRef.current || !isPlayingRef.current) return
          if (currentPageRef.current !== toPage) return
          restartReadingAtPage(toPage)
        }, TTS_RESTART_DEBOUNCE_MS)
      }
    }

    // 自动朗读推进不播报（会与语音抢音频）；抽屉/视频面板打开时不播报
    if (source === 'manual' && !dialogOpenRef.current) {
      const base = describePage(toPage)
      // 落定时图还没到位 → 合并进同一次写入（分两次写会让读屏排两个 utterance）
      let imagePending = false
      if (toPage > 0 && toPage < totalPages - 1) {
        if (isDecoded(toPage)) {
          // 动画期间图已经到位（B0，或 B1 但下载快过 240ms）→ 不额外提图
          pendingImageRef.current.delete(toPage)
        } else {
          pendingImageRef.current.add(toPage)
          imagePending = true
        }
      } else {
        pendingImageRef.current.delete(toPage)
      }
      announce(imagePending ? `${base}，图片还在加载` : base)
    }
  }, [announce, describePage, isDecoded, noteFlipLanded, restartReadingAtPage, showToast, stop, totalPages])

  // 兜底解锁：只处理一次
  const finalizeFlip = useCallback(() => {
    const current = flipRef.current
    if (!current) return
    flipRef.current = null
    isFlippingRef.current = false
    setFlip(null)
    setSlideArmed(false)
    lastFlipAtRef.current = Date.now()
    if (current.from === 0) setBookOpen(true)
    // 落定后清逐字高亮（不打断朗读）
    clearHighlight()
    if (flipFallbackTimerRef.current) {
      clearTimeout(flipFallbackTimerRef.current)
      flipFallbackTimerRef.current = null
    }
    handleLanding(current.from, currentPageRef.current, current.source)
  }, [clearHighlight, handleLanding])

  /**
   * 统一翻页入口。所有入口（按钮 / 键盘 / 手势 / 进度条 / 缩略图 / 朗读自动推进）
   * 都必须走这里，以复用「动画锁 + 冷却」。
   */
  const goToPage = useCallback((
    target: number,
    dir: 'next' | 'prev',
    source: NavSource = 'manual',
    offset = 0,
  ) => {
    const prev = currentPageRef.current
    const clamped = Math.max(0, Math.min(target, totalPages - 1))
    if (clamped === prev) return
    if (isFlippingRef.current) return // 丢弃连点，不排队
    if (Date.now() - lastFlipAtRef.current < FLIP_COOLDOWN_MS) return

    if (source === 'manual') manualNavAtRef.current = Date.now()

    /**
     * ── B0 / B1 分流（等待阈值恒为 0ms，两条路径都不等图）────────────
     * B0 命中（目标页已在内存）：立即启动动画，动画期间旧页覆盖画面 → 用户完全无感，这是常态。
     * B1 未命中：同样立即启动动画；新页的 `<img>`（fetchPriority=high）并发拉 P0，
     *   占位由 SceneMedia 用容器渐变底填，0–300ms 不显示任何反馈。
     * 「等图再翻」已被否决：它最坏情况无界，必然退化成「先白等 N 毫秒再走 B1」，
     * 那 N 毫秒里严格劣于 B1、之后与 B1 等价 —— 不存在任何胜出的子情形。
     */
    const targetDecoded = isDecoded(clamped)
    noteFlip(clamped, targetDecoded)
    if (!targetDecoded) pendingImageRef.current.add(clamped)

    // reduced-motion：直接切页，无位移无淡入
    if (prefersReducedMotion()) {
      lastFlipAtRef.current = Date.now()
      isFlippingRef.current = false
      flipRef.current = null
      setFlip(null)
      setPage(clamped)
      handleLanding(prev, clamped, source)
      return
    }

    const delta = Math.abs(clamped - prev)
    const kind: FlipKind = delta > 1 ? 'fade' : isWideRef.current ? 'leaf' : 'slide'
    const nextFlip: FlipState = { from: prev, dir, kind, offset, source }
    isFlippingRef.current = true
    flipRef.current = nextFlip
    setFlip(nextFlip)
    setPage(clamped)

    if (flipFallbackTimerRef.current) clearTimeout(flipFallbackTimerRef.current)
    flipFallbackTimerRef.current = window.setTimeout(
      finalizeFlip,
      kind === 'leaf' ? FLIP_FALLBACK_MS : kind === 'slide' ? SLIDE_FALLBACK_MS : FADE_FALLBACK_MS,
    )
  }, [finalizeFlip, handleLanding, isDecoded, noteFlip, setPage, totalPages])

  const goToNext = useCallback((target?: number, source: NavSource = 'manual') => {
    goToPage(typeof target === 'number' ? target : currentPageRef.current + 1, 'next', source)
  }, [goToPage])

  const goToPrev = useCallback((target?: number, source: NavSource = 'manual') => {
    goToPage(typeof target === 'number' ? target : currentPageRef.current - 1, 'prev', source)
  }, [goToPage])

  useEffect(() => {
    advanceRef.current = (page, dir) => goToPage(page, dir, 'auto')
  }, [goToPage])

  const focusStage = useCallback(() => {
    requestAnimationFrame(() => {
      try {
        stageRef.current?.focus({ preventScroll: true })
      } catch {
        // 部分浏览器不支持 focus options，忽略
      }
    })
  }, [])

  /** 拖条 / 点阵跳页：动画期间只记住"最后一次意图"，落定后自动重试 */
  const seekTo = useCallback((page: number) => {
    const clamped = Math.max(0, Math.min(page, totalPages - 1))
    if (clamped === currentPageRef.current) {
      pendingSeekRef.current = null
      return
    }
    const blocked = isFlippingRef.current || Date.now() - lastFlipAtRef.current < FLIP_COOLDOWN_MS
    if (blocked) {
      pendingSeekRef.current = clamped
      if (seekRetryTimerRef.current !== null) clearTimeout(seekRetryTimerRef.current)
      seekRetryTimerRef.current = window.setTimeout(() => {
        seekRetryTimerRef.current = null
        const pending = pendingSeekRef.current
        pendingSeekRef.current = null
        if (pending !== null) seekTo(pending)
      }, FLIP_COOLDOWN_MS + 20)
      return
    }
    pendingSeekRef.current = null
    if (seekRetryTimerRef.current !== null) {
      clearTimeout(seekRetryTimerRef.current)
      seekRetryTimerRef.current = null
    }
    const dir = clamped > currentPageRef.current ? 'next' : 'prev'
    goToPage(clamped, dir, 'manual')
  }, [goToPage, totalPages])

  /** 缩略图跳页：跳页后把焦点交还舞台，避免焦点随内容卸载丢失 */
  const jumpTo = useCallback((page: number) => {
    seekTo(page)
    focusStage()
  }, [seekTo, focusStage])

  /** 自动推进撞上拖拽时的收尾 */
  const flushAutoAdvance = useCallback(() => {
    const pending = autoAdvancePendingRef.current
    if (pending === null) return
    autoAdvancePendingRef.current = null
    if (autoAdvanceTimerRef.current !== null) clearTimeout(autoAdvanceTimerRef.current)
    autoAdvanceTimerRef.current = window.setTimeout(() => {
      autoAdvanceTimerRef.current = null
      if (pending >= totalPages) {
        isReadingModeRef.current = false
        return
      }
      const dir = pending > currentPageRef.current ? 'next' : 'prev'
      goToPage(pending, dir, 'auto')
    }, AUTO_ADVANCE_SETTLE_MS)
  }, [goToPage, totalPages])

  // ── 滑动手势（仅 touch，纵向交还浏览器）──────────────
  useSwipePager({
    targetRef: planeRef,
    enabled: true,
    canGoNext: () => currentPageRef.current < totalPages - 1,
    canGoPrev: () => currentPageRef.current > 0,
    isBlocked: () => isFlippingRef.current || Date.now() - lastFlipAtRef.current < FLIP_COOLDOWN_MS,
    onCommit: (dir, offset) => {
      const target = dir === 'next' ? currentPageRef.current + 1 : currentPageRef.current - 1
      goToPage(target, dir, 'manual', offset)
      focusStage()
    },
    onDragChange: (dragging) => {
      swipeDraggingRef.current = dragging
      if (!dragging) flushAutoAdvance()
    },
  })

  // 移动端位移动画的二段触发：先让首帧样式落进 DOM，再翻到目标样式
  useEffect(() => {
    if (!flip || flip.kind !== 'slide') {
      setSlideArmed(false)
      return
    }
    const id = requestAnimationFrame(() => setSlideArmed(true))
    return () => cancelAnimationFrame(id)
  }, [flip])

  // ── 朗读控制 ─────────────────────────────────────────
  const cycleRate = useCallback(() => {
    const currentIndex = RATES.indexOf(rate)
    setTTSRate(RATES[(currentIndex + 1) % RATES.length])
  }, [rate, setTTSRate])

  const handleSpeak = useCallback(() => {
    if (isPlaying) {
      stop()
      isReadingModeRef.current = false
      return
    }
    isReadingModeRef.current = true
    if (isCover) {
      // 封面起步：先翻到第 1 幕，让开书动画与首幕朗读同时发生
      goToNext(1)
      startSceneReading(0)
      return
    }
    if (isMeaningPage) {
      isReadingModeRef.current = false
      speak(book.meaning)
      return
    }
    startSceneReading(sceneIndex)
  }, [isPlaying, stop, isCover, isMeaningPage, goToNext, startSceneReading, speak, book.meaning, sceneIndex])

  // 含义页朗读（自动推进到含义页时也走这里）
  useEffect(() => {
    if (!isReadingModeRef.current) return
    if (currentPage === 0) return
    if (currentPage !== totalPages - 1) return
    speak(book.meaning)
    isReadingModeRef.current = false
  }, [currentPage, totalPages, book.meaning, speak])

  // ── 键盘：翻页中 / 输入控件 / 弹窗打开时不响应 ─────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isFlippingRef.current) return
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName?.toLowerCase()
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) return
      }
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return

      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        goToNext()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goToPrev()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goToNext, goToPrev])

  // ── ⋯ 抽屉：焦点管理 + ESC + Tab 循环 ─────────────────
  const closeDrawer = useCallback((restoreFocus = true) => {
    setToolbarOpen(false)
    if (restoreFocus) requestAnimationFrame(() => moreBtnRef.current?.focus())
  }, [])

  useEffect(() => {
    if (!toolbarOpen) return
    const panel = drawerRef.current
    if (!panel) return

    const selector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const focusables = () => Array.from(panel.querySelectorAll<HTMLElement>(selector))
    focusables()[0]?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        closeDrawer()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [toolbarOpen, closeDrawer])

  // ── PDF 导出状态机 ───────────────────────────────────
  /**
   * 释放当前持有的那份 blob URL 并把 UI 一起下架。
   *
   * `delayMs` 的来历：`triggerDownload()` 只是发起下载，浏览器读 blob 是紧随其后的异步
   * 步骤；而 `pdfBusyRef` 在生成结束的同一帧就放开，用户看到 toast 立刻再点一次
   * （Δ 常是数百毫秒，快速连点可低至 100–200ms）会让同步 revoke 掉那份刚落地的 URL，
   * Firefox / 大文件 / 慢盘上会得到空文件。所以「重新生成前释放上一份」要延时。
   *
   * 为什么是 1s 而不是 10s：要保护的是「浏览器开始读流」，不是「下载完成」；拷贝一旦
   * 开始，URL 即可撤销。1s 足够覆盖启动窗口，又不让上一份多活 10 秒。
   *
   * 为什么不需要队列：`stale` 在调度时就被捕获进闭包，每个 timer 各自 revoke 各自的
   * URL。系统中 `pdfResultRef` 是单槽（每次生成都覆盖），同一时刻最多只有一个待回收对象，
   * 为一个恒定长度 ≤1 的集合建队列是给不存在的问题加保险。
   *
   * 卸载路径刻意不延时：组件已卸载，延迟回收等于永不回收，所以 cleanup 里保持同步 revoke。
   */
  const disposePdfResult = useCallback((delayMs = 0) => {
    const stale = pdfResultRef.current // 捕获进闭包，不是到点再读 ref
    pdfResultRef.current = null
    if (!stale) {
      if (mountedRef.current) setPdfResult(null)
      return
    }
    if (delayMs > 0) window.setTimeout(() => stale.revoke(), delayMs)
    else stale.revoke()
    if (mountedRef.current) setPdfResult(null)
  }, [])

  const handleExportPDF = useCallback(async () => {
    // 运行中再次点击 = 取消（lib/pdf 的取消信号是可写对象 { cancelled }，不是 AbortSignal）
    if (pdfBusyRef.current) {
      pdfCancelRef.current = true
      if (pdfCancelSignalRef.current) pdfCancelSignalRef.current.cancelled = true
      setPdf((prev) => (prev.status === 'running' ? { ...prev, cancelling: true } : prev))
      return
    }
    pdfBusyRef.current = true
    pdfCancelRef.current = false
    const signal = { cancelled: false }
    pdfCancelSignalRef.current = signal
    disposePdfResult(1000) // 重新生成前先释放上一份 blob（延时 1s，别掐断刚发起的下载）
    setPdf({ status: 'running', done: 0, total: 0, cancelling: false })

    try {
      // 动态 import：jspdf + html2canvas 约 220KB gzip，不能进阅读页首屏
      const { generatePDF, triggerDownload, isIOSSafari } = await import('@/lib/pdf')

      // 注意：这个版本不再自动保存，返回 { url, filename, revoke }，由调用方决定下载方式
      const result = await generatePDF(book, {
        onProgress: (done, total) => {
          if (pdfCancelRef.current || !mountedRef.current) return
          setPdf({ status: 'running', done, total, cancelling: false })
        },
        signal,
      })

      if (!mountedRef.current || pdfCancelRef.current) {
        result.revoke()
        return
      }

      if (isIOSSafari()) {
        // iOS：异步 30s+ 后自动下载会被静默拦掉（手势上下文已过期）。
        // 把 blob URL 挂到真实 <a download> 上，等用户这一下点击再保存。
        pdfResultRef.current = result
        setPdfResult(result)
        return
      }

      // 其它平台：同一次异步里 anchor.click() 下载不会被拦
      triggerDownload(result.url, result.filename)
      showToast('✅ PDF 已保存', 'success')
      // 触发下载后**不 revoke**：click() 只是"发起"，浏览器读 blob 是紧随其后的异步步骤，
      // 且慢网下可能持续很久。句柄挂进 ref，等卸载或下一次生成前统一回收。
      pdfResultRef.current = result
    } catch (err) {
      if (!mountedRef.current) return
      const cancelled = pdfCancelRef.current || (err instanceof Error && err.message === 'CANCELLED')
      // 用户主动取消不算错误：静默恢复按钮即可，不弹 toast
      if (cancelled) return
      const message = err instanceof Error && err.message ? err.message : '未知错误'
      showToast(`PDF 生成失败：${message}`, 'error')
    } finally {
      pdfBusyRef.current = false
      pdfCancelRef.current = false
      pdfCancelSignalRef.current = null
      if (mountedRef.current) setPdf({ status: 'idle' })
    }
  }, [book, showToast, disposePdfResult])

  // ── 渲染：逐字高亮 ───────────────────────────────────
  const renderNarrationPanel = (narration: string, highlightEnabled: boolean, variant: 'single' | 'spread') => {
    const chars = Array.from(narration)
    const showHighlight = highlightEnabled && isPlaying && currentCharIndex >= 0 && currentCharIndex < chars.length
    const label = isPoetry ? '💡 白话释义' : isNurseryRhyme ? '🎵 歌词' : '💬 旁白'

    const panelClass = variant === 'single'
      ? 'relative rounded-inner bg-[var(--hairline)] p-3.5'
      : 'relative rounded-inner bg-[var(--surface-warm)] p-4'
    const labelClass = variant === 'single'
      ? 'mb-1.5 text-[12px] font-semibold text-[var(--text-body)]'
      : 'mb-2 text-[13px] font-semibold text-[var(--text-body)]'

    return (
      <div className={panelClass}>
        <h4 className={labelClass}>{label}</h4>
        {isPaused && showHighlight && (
          <span
            className="absolute right-2.5 top-2.5 rounded-full bg-warn/[0.14] px-2 py-0.5 text-[11px] text-[var(--warn)]"
            aria-live="polite"
          >
            ⏸ 已暂停
          </span>
        )}
        <p className={`text-[17px] leading-[1.8] text-[var(--text-ink)] ${isNurseryRhyme ? 'italic' : ''}`}>
          {!isPoetry && !isNurseryRhyme && '「'}
          {chars.map((ch, i) => {
            const active = showHighlight && i === currentCharIndex
            const stateClass = active
              ? `${isPaused ? 'bg-warn/[0.18]' : 'bg-warn/[0.28]'} scale-105 ease-enter`
              : 'bg-transparent scale-100 ease-standard'
            return (
              <span
                key={i}
                className={`inline-block origin-bottom whitespace-pre rounded px-[1px] transition-all duration-fast ${stateClass}`}
              >
                {ch}
              </span>
            )
          })}
          {!isPoetry && !isNurseryRhyme && '」'}
        </p>
      </div>
    )
  }

  /** 单页（<768）场景卡：图上文下，内部滚动 */
  const renderSceneSingle = (pScene: Scene, pSceneIndex: number, highlightEnabled: boolean) => {
    const imgSrc = sceneImgUrl(pScene)
    const pageNo = pSceneIndex + 1
    const isCurrent = pSceneIndex === sceneIndex
    const retryToken = retryTokens[pageNo] ?? 0

    return (
      <article className="mx-auto flex max-h-[calc(100dvh-56px-env(safe-area-inset-bottom)-88px)] w-full max-w-[560px] flex-col overflow-hidden rounded-card bg-white shadow-card">
        {/* 图片：固定宽高比消除 CLS；图片区底缘 hairline + 8px 渐变白过渡，不加分割线。
            容器渐变底是布局的一部分、永远在 —— 所以「占位出现」不会产生任何颜色跳跃。 */}
        <div className="relative aspect-[4/3] max-h-[46dvh] min-h-[180px] shrink-0 overflow-hidden border-b border-[var(--hairline)] bg-gradient-to-br from-[var(--brand-strong-soft)] to-primary/25">
          {imgSrc ? (
            <SceneMedia
              src={withRetryToken(imgSrc, retryToken)}
              page={pageNo}
              alt={`第 ${pageNo} ${sceneUnit}：${pScene.title}`}
              cached={isDecoded(pageNo)}
              active={isCurrent}
              skim={skimMode}
              retryToken={retryToken}
              onSettled={handleSceneSettled}
              onRetry={handleSceneRetry}
            />
          ) : null}
          <span className="absolute left-3 top-3 inline-flex h-6 items-center rounded-full bg-white/[0.88] px-2 text-[11.5px] text-[var(--text-ink)] shadow-card">
            第 {pageNo} {sceneUnit}
          </span>
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-2 bg-gradient-to-b from-transparent to-white" />
        </div>

        {/* 正文：内部滚动；底部留 safe-area 余量 */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pt-3.5 pb-[calc(env(safe-area-inset-bottom)+16px)]">
          <h3 className="text-[17px] font-bold leading-[1.4] text-[var(--text-ink)]">{pScene.title}</h3>

          {!isNurseryRhyme && (
            <>
              <p className={`mt-1.5 text-[13px] leading-[1.65] text-[var(--text-muted)] ${descExpanded ? '' : 'line-clamp-2'}`}>
                {pScene.description}
              </p>
              {pScene.description.length > 40 && (
                <button
                  type="button"
                  onClick={() => setDescExpanded((v) => !v)}
                  aria-expanded={descExpanded}
                  className="mt-1 text-[12.5px] font-medium text-[var(--brand-strong)]"
                >
                  {descExpanded ? '收起 ▴' : '展开 ▾'}
                </button>
              )}
            </>
          )}

          {isPoetry && (
            <div className="mt-3 rounded-inner bg-[var(--surface-warm)] p-3.5">
              <h4 className="mb-1.5 text-[12px] font-semibold text-[var(--text-body)]">📜 原诗</h4>
              <p className="whitespace-pre-line font-serif text-[19px] leading-[1.9] tracking-[0.06em] text-[var(--text-ink)]">
                {pScene.title}
              </p>
            </div>
          )}

          <div className="mt-3">
            {renderNarrationPanel(pScene.narration, highlightEnabled, 'single')}
          </div>
        </div>
      </article>
    )
  }

  /** 双页（≥768）场景跨页：左图右文 */
  const renderSceneSpread = (pScene: Scene, pSceneIndex: number, highlightEnabled: boolean) => {
    const imgSrc = sceneImgUrl(pScene)
    const pageNo = pSceneIndex + 1
    const retryToken = retryTokens[pageNo] ?? 0
    return (
      <div className="relative flex items-stretch">
        <div className="w-1/2 rounded-l-card bg-gradient-to-r from-[var(--brand-strong-soft)] to-primary/25 p-6 shadow-card">
          <div className="mb-4 text-center">
            <span className="text-[12px] text-[var(--text-muted)]">
              第 {pageNo} {sceneUnit}
            </span>
            <h3 className="text-xl font-bold text-[var(--text-ink)]">{pScene.title}</h3>
          </div>
          {imgSrc ? (
            /* 图框底沿用 bg-white/40，**不要**为了和单页统一改成渐变：
               左侧大面板已经是渐变，图框再渐变会破坏左图右文的层次 */
            <div className="relative aspect-[4/3] overflow-hidden rounded-inner bg-white/40">
              <SceneMedia
                src={withRetryToken(imgSrc, retryToken)}
                page={pageNo}
                alt={`第 ${pageNo} ${sceneUnit}：${pScene.title}`}
                cached={isDecoded(pageNo)}
                active={pSceneIndex === sceneIndex}
                skim={skimMode}
                retryToken={retryToken}
                onSettled={handleSceneSettled}
                onRetry={handleSceneRetry}
              />
            </div>
          ) : null}
        </div>

        {/* 正文列：px-8 而不是 p-6 —— 768 断点下舞台 600px、半页 300px，
            左右各 32px 才把正文列压到 236px（≤240 上限）；p-6 会溢出到 252px */}
        <div className="w-1/2 rounded-r-card bg-white px-8 py-6 shadow-card">
          <div className="space-y-4">
            {!isNurseryRhyme && (
              <div>
                <h4 className="mb-1.5 text-[13px] font-semibold text-[var(--text-body)]">
                  {isPoetry ? '🎨 意境描绘' : '📖 场景描述'}
                </h4>
                <p className="text-[15px] leading-[1.7] text-[var(--text-body)]">{pScene.description}</p>
              </div>
            )}
            {isPoetry && (
              <div className="rounded-inner bg-[var(--surface-warm)] p-4">
                <h4 className="mb-2 text-[13px] font-semibold text-[var(--text-body)]">📜 原诗</h4>
                <p className="whitespace-pre-line font-serif text-[19px] leading-[1.9] tracking-[0.06em] text-[var(--text-ink)]">
                  {pScene.title}
                </p>
              </div>
            )}
            {renderNarrationPanel(pScene.narration, highlightEnabled, 'spread')}
          </div>
        </div>

        <div className="spine-shadow" aria-hidden="true" />
      </div>
    )
  }

  /** 纯渲染：给定页码返回完整页面结构（leaf / 旧页快照都复用它） */
  const renderPage = (pageNum: number, highlightEnabled: boolean) => {
    const pIsCover = pageNum === 0
    const pIsMeaning = pageNum === totalPages - 1
    const pSceneIndex = pageNum - 1
    const pScene = !pIsCover && !pIsMeaning ? book.scenes[pSceneIndex] : null
    // 含义页 stagger 只在落定时播放
    const landAnim = (delay: string) => (flip ? '' : `animate-fade-up ${delay}`)

    if (pIsCover) {
      return (
        <div className="mx-auto max-h-[calc(100dvh-56px-env(safe-area-inset-bottom)-88px)] w-full max-w-[560px] overflow-y-auto overscroll-contain rounded-card bg-white shadow-card md:max-h-none md:max-w-none md:overflow-visible">
          <div className="p-5 md:p-8">
            <div className="mb-5 text-center">
              <h1 className="text-[22px] font-bold leading-[1.35] text-[var(--text-ink)] md:text-3xl">
                {isPoetry ? '📜' : isNurseryRhyme ? '🎵' : '📚'} {book.title}
              </h1>
              {isPoetry && poetryAttribution && (
                <p className="mt-1.5 text-[13px] font-medium text-[var(--brand-strong)]">{poetryAttribution}</p>
              )}
              {fullText && (isPoetry || isNurseryRhyme) ? (
                <div className="mx-auto mt-3 rounded-inner bg-[var(--surface-warm)] p-3.5 md:max-w-md md:p-4">
                  <p className={`whitespace-pre-line text-[var(--text-ink)] ${
                    isPoetry
                      ? 'font-serif text-[19px] leading-[1.9] tracking-[0.06em]'
                      : 'text-[16px] italic leading-[1.8]'
                  }`}>
                    {fullText}
                  </p>
                </div>
              ) : null}
              {!isPoetry && !isNurseryRhyme && (
                <p className="mt-3 text-[14px] leading-[1.7] text-[var(--text-body)]">{book.meaning}</p>
              )}
            </div>

            {/* 全部插图缩略图：去掉固定高度，用 4:3 比例框 */}
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {book.scenes.map((s, i) => {
                const imgSrc = getSceneImageUrl(s) || null
                // 墙按格宽取档，只出 320/480（TIER_SETS.thumb 在数据结构上禁止升到 768/1024）
                const thumbSrc = imgSrc && isTierable(imgSrc) ? tierUrl(imgSrc, 320) : imgSrc
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      jumpTo(i + 1)
                    }}
                    aria-label={`第 ${i + 1} ${sceneUnit}：${s.title}，打开`}
                    className="group overflow-hidden rounded-inner bg-white text-left ring-1 ring-[var(--hairline)] transition-all duration-normal ease-standard focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B04A2E] md:hover:-translate-y-0.5 md:hover:scale-[1.02] md:hover:shadow-cardHover"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-[var(--brand-strong-soft)]">
                      {thumbSrc && (
                        <ThumbImage
                          src={thumbSrc}
                          desktopSrc={imgSrc && isTierable(imgSrc) ? tierUrl(imgSrc, TIER_SETS.thumb.tiers[1]) : undefined}
                          onSettled={noteCoverThumbSettled}
                        />
                      )}
                    </div>
                    <div className="px-2 py-1.5">
                      <span className="block truncate text-[12.5px] font-medium text-[var(--text-ink)]">{s.title}</span>
                    </div>
                  </button>
                )
              })}
            </div>

            <p className="text-center text-[12.5px] text-[var(--text-muted)]">点击任意场景开始阅读 →</p>
          </div>
        </div>
      )
    }

    if (pScene) {
      return isWide ? renderSceneSpread(pScene, pSceneIndex, highlightEnabled) : renderSceneSingle(pScene, pSceneIndex, highlightEnabled)
    }

    if (pIsMeaning) {
      return (
        <div className="mx-auto max-h-[calc(100dvh-56px-env(safe-area-inset-bottom)-88px)] w-full max-w-[560px] overflow-y-auto overscroll-contain rounded-card bg-white shadow-card md:max-h-none md:max-w-none md:overflow-visible">
          <div className="p-5 text-center md:p-8">
            <div className={`text-5xl md:text-6xl ${landAnim('[animation-delay:60ms]')}`}>
              {isPoetry ? '📜' : isNurseryRhyme ? '🎵' : '💡'}
            </div>
            <h2 className={`mt-3 text-[21px] font-bold text-[var(--text-ink)] md:text-2xl ${landAnim('[animation-delay:120ms]')}`}>
              {meaningPageTitle}
            </h2>
            <p className={`mx-auto mt-3 max-w-[34rem] text-left text-[17px] leading-[1.8] text-[var(--text-ink)] md:text-center ${landAnim('[animation-delay:180ms]')}`}>
              {book.meaning}
            </p>

            <div className={`mt-5 ${landAnim('[animation-delay:240ms]')}`}>
              {fullText && (isPoetry || isNurseryRhyme) ? (
                <div className="mx-auto mb-4 max-w-lg rounded-inner bg-[var(--surface-warm)] p-4 md:p-6">
                  <h3 className="mb-2 text-left text-[13px] font-semibold text-[var(--text-body)]">
                    {isPoetry ? '📜 全诗' : '🎵 完整歌词'}
                  </h3>
                  <p className={`whitespace-pre-line text-left text-[var(--text-ink)] ${
                    isPoetry ? 'font-serif text-[19px] leading-[1.9] tracking-[0.06em]' : 'text-[16px] italic leading-[1.8]'
                  }`}>
                    {fullText}
                  </p>
                </div>
              ) : null}

              <div className="mx-auto max-w-lg rounded-inner bg-[var(--hairline)] p-4 text-left md:p-6">
                <h3 className="mb-2 text-[13px] font-semibold text-[var(--text-body)]">📖 {reviewTitle}</h3>
                {/* <640 折叠为「查看全部 N 幕」；≥768 直接展开 */}
                <button
                  type="button"
                  onClick={() => setShowReview((v) => !v)}
                  aria-expanded={showReview}
                  className="mb-2 text-[12.5px] font-medium text-[var(--brand-strong)] md:hidden"
                >
                  {showReview ? '收起回顾 ▴' : `查看全部 ${book.scenes.length} ${sceneUnit} ▾`}
                </button>
                <div className={`space-y-2 ${showReview ? 'block' : 'hidden md:block'}`}>
                  {book.scenes.map((s, i) => (
                    <p key={i} className="text-[13px] leading-[1.7] text-[var(--text-body)]">
                      <span className="font-medium text-[var(--text-ink)]">
                        第 {i + 1} {sceneUnit} {s.title}：
                      </span>
                      {s.narration}
                    </p>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 text-[12.5px] text-[var(--text-muted)]">{reviewDoneText}</div>
          </div>
        </div>
      )
    }

    return null
  }

  // ── 翻页动画样式 ─────────────────────────────────────
  const isOpeningBook = flip?.kind === 'leaf' && !bookOpen && flip.from === 0
  const slideFlip = flip && flip.kind === 'slide' ? flip : null

  const enterStyle: CSSProperties | undefined = slideFlip
    ? {
      transform: slideArmed ? 'translateX(0)' : `translateX(${slideFlip.dir === 'next' ? 8 : -8}px)`,
      opacity: slideArmed ? 1 : 0,
      transition: slideArmed
        ? `transform ${SLIDE_MS}ms ${EASE_ENTER}, opacity ${SLIDE_MS}ms ${EASE_ENTER}`
        : 'none',
    }
    : undefined

  const exitStyle: CSSProperties | undefined = slideFlip
    ? {
      transform: slideArmed
        ? `translateX(${slideFlip.dir === 'next' ? '-30%' : '30%'})`
        : `translateX(${slideFlip.offset}px)`,
      opacity: slideArmed ? 0 : dragOpacity(slideFlip.offset),
      transition: slideArmed
        ? `transform ${SLIDE_MS}ms ${EASE_EXIT}, opacity ${SLIDE_MS}ms ${EASE_EXIT}`
        : 'none',
      willChange: 'transform, opacity',
    }
    : undefined

  const handleLeafEnd = useCallback((e: ReactAnimationEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    finalizeFlip()
  }, [finalizeFlip])

  const handleExitEnd = useCallback((e: ReactTransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    if (e.propertyName !== 'transform') return
    finalizeFlip()
  }, [finalizeFlip])

  // ── 工具栏按钮样式（静态字面量，便于 JIT 扫描）────────
  const toolbarBtn = 'inline-flex items-center gap-1 px-3.5 py-2 rounded-button text-[13px] font-medium transition-transform duration-fast ease-standard active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed'
  const iconBtn = 'inline-flex h-11 w-11 items-center justify-center rounded-full text-ink transition-transform duration-fast ease-standard active:scale-[0.97] hover:bg-[var(--hairline)]'
  const pdfRunning = pdf.status === 'running'

  return (
    <>
      {/* 翻页读屏播报：内容替换而非追加 */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>

      {/* Toast */}
      {toast && (
        <div
          key={toast.id}
          role={toast.tone === 'error' ? 'alert' : 'status'}
          className={`fixed left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-[13px] shadow-modal bottom-[calc(56px+env(safe-area-inset-bottom)+16px)] md:bottom-6 ${
            toast.tone === 'error'
              ? 'border border-danger/[0.24] bg-danger/[0.08] text-[var(--danger)]'
              : toast.tone === 'success'
                ? 'border border-success/[0.24] bg-success/[0.08] text-[var(--success)]'
                : 'border border-[var(--hairline)] bg-white text-[var(--text-body)]'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* TTS 失败提示 */}
      {ttsError && (
        <div
          role="alert"
          className="fixed left-1/2 z-50 -translate-x-1/2 animate-fade-up rounded-full border border-danger/[0.24] bg-danger/[0.08] px-4 py-2 text-[13px] text-[var(--danger)] shadow-modal bottom-[calc(56px+env(safe-area-inset-bottom)+64px)] md:bottom-6"
        >
          ⚠️ 朗读失败，请重试
        </div>
      )}

      <div className="flex w-full flex-col md:mx-auto md:max-w-5xl">
        {/* ── 移动端顶栏 52px ── */}
        <div className="sticky top-0 z-30 flex h-[52px] shrink-0 items-center gap-1 border-b border-[var(--hairline)] bg-white/[0.92] px-1.5 backdrop-blur md:hidden">
          <Link href="/" aria-label="返回书架" className={iconBtn}>
            <span aria-hidden="true" className="text-xl leading-none">←</span>
          </Link>
          <h1 className="min-w-0 flex-1 truncate px-1 text-[15px] font-semibold text-[var(--text-ink)]">{book.title}</h1>
          {isSupported && (
            <button
              type="button"
              onClick={handleSpeak}
              aria-label={isPlaying ? '停止朗读' : '开始朗读'}
              aria-pressed={isPlaying}
              className={`${iconBtn} ${isPlaying ? 'bg-danger/[0.08] text-[var(--danger)]' : ''}`}
            >
              <span aria-hidden="true" className="text-lg leading-none">{isPlaying ? '⏹' : '🔊'}</span>
            </button>
          )}
          <button
            ref={moreBtnRef}
            type="button"
            onClick={() => setToolbarOpen((v) => !v)}
            aria-expanded={toolbarOpen}
            aria-controls="book-more-panel"
            aria-label="更多操作"
            className={iconBtn}
          >
            <span aria-hidden="true" className="text-lg leading-none">⋯</span>
          </button>
        </div>

        {/* ── 移动端 ⋯ 抽屉 ── */}
        {toolbarOpen && (
          <>
            <div
              aria-hidden="true"
              onClick={() => closeDrawer(false)}
              className="fixed inset-0 z-30 bg-ink/[0.06] md:hidden"
            />
            <div
              id="book-more-panel"
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label="更多操作"
              className="fixed inset-x-0 top-[52px] z-40 mx-auto max-w-[520px] animate-slide-down rounded-b-card border border-[var(--hairline)] bg-white p-3 shadow-modal md:hidden"
            >
            <div className="grid gap-1.5">
              {isSupported && isPlaying && (
                <button
                  type="button"
                  onClick={togglePause}
                  aria-label={isPaused ? '继续朗读' : '暂停朗读'}
                  aria-pressed={isPaused}
                  className="flex items-center justify-between rounded-inner px-3 py-2.5 text-[14px] text-[var(--text-ink)] hover:bg-[var(--hairline)]"
                >
                  <span>{isPaused ? '▶ 继续朗读' : '⏸ 暂停朗读'}</span>
                </button>
              )}
              {isSupported && isPlaying && (
                <button
                  type="button"
                  onClick={cycleRate}
                  aria-label={`语速，当前 ${rate} 倍`}
                  className="flex items-center justify-between rounded-inner px-3 py-2.5 text-[14px] text-[var(--text-ink)] hover:bg-[var(--hairline)]"
                >
                  <span>🐢 语速</span>
                  <span className="text-[13px] tabular-nums text-[var(--text-muted)]">{rate}x</span>
                </button>
              )}
              {!isCover && !isMeaningPage && book.scenes[sceneIndex] && (
                <div className="rounded-inner bg-[var(--hairline)] p-3">
                  <p className="mb-1 text-[12px] font-semibold text-[var(--text-body)]">📖 本幕场景描述</p>
                  <p className="text-[13px] leading-[1.7] text-[var(--text-body)]">{book.scenes[sceneIndex].description}</p>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  // 先执行动作再关抽屉，避免 iOS 手势上下文丢失
                  setShowVideoGenerator((v) => !v)
                  requestAnimationFrame(() => closeDrawer())
                }}
                className="flex items-center justify-between rounded-inner px-3 py-2.5 text-[14px] text-[var(--text-ink)] hover:bg-[var(--hairline)]"
              >
                <span>🎬 {showVideoGenerator ? '收起视频生成' : '生成绘本视频'}</span>
              </button>
              <p className="px-3 pb-1 text-[11.5px] leading-[1.6] text-[var(--warn)]">
                ⚠ 视频要生成 2–5 分钟，期间请保持页面打开；切走或关闭会中断，结果不会保存
              </p>
              <button
                type="button"
                onClick={() => {
                  void handleExportPDF()
                  requestAnimationFrame(() => closeDrawer())
                }}
                aria-busy={pdfRunning}
                className="flex items-center justify-between rounded-inner px-3 py-2.5 text-[14px] text-[var(--text-ink)] hover:bg-[var(--hairline)]"
              >
                <span>📄 {pdfRunning ? (pdf.status === 'running' && pdf.cancelling ? '正在取消…' : '取消导出 PDF') : '导出 PDF'}</span>
              </button>
            </div>
          </div>
          </>
        )}

        {/* ── 桌面工具栏 ── */}
        <div className="hidden items-center justify-between gap-3 pb-4 md:flex">
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded-button px-2 py-2 text-[14px] text-[var(--text-body)] transition-colors duration-fast hover:text-[var(--text-ink)]"
          >
            ← 返回
          </Link>
          <h2 className="min-w-0 flex-1 truncate text-center text-lg font-bold text-[var(--text-ink)]">{book.title}</h2>
          <div className="flex shrink-0 items-center gap-2">
            {isSupported && (
              <>
                <button
                  type="button"
                  onClick={handleSpeak}
                  aria-label={isPlaying ? '停止朗读' : '开始朗读'}
                  aria-pressed={isPlaying}
                  className={`${toolbarBtn} ${
                    isPlaying
                      ? 'bg-danger/10 text-[var(--danger)]'
                      : 'bg-[var(--brand-strong-soft)] text-[var(--brand-strong)]'
                  }`}
                >
                  {isPlaying ? '⏹ 停止' : '🔊 朗读'}
                </button>
                {isPlaying && (
                  <>
                    <button
                      type="button"
                      onClick={togglePause}
                      aria-label={isPaused ? '继续朗读' : '暂停朗读'}
                      aria-pressed={isPaused}
                      className={`${toolbarBtn} bg-[var(--hairline)] text-[var(--text-body)]`}
                    >
                      {isPaused ? '▶ 继续' : '⏸ 暂停'}
                    </button>
                    <button
                      type="button"
                      onClick={cycleRate}
                      aria-label={`语速，当前 ${rate} 倍`}
                      className={`${toolbarBtn} bg-[var(--hairline)] text-[var(--text-body)]`}
                    >
                      🐢 {rate}x
                    </button>
                  </>
                )}
              </>
            )}
            <button
              type="button"
              onClick={() => setShowVideoGenerator((v) => !v)}
              aria-expanded={showVideoGenerator}
              className={`${toolbarBtn} bg-[var(--surface-warm)] text-[var(--warn)]`}
            >
              🎬 视频
            </button>
            <button
              type="button"
              onClick={() => { void handleExportPDF() }}
              aria-busy={pdfRunning}
              className={`${toolbarBtn} ${
                pdfRunning
                  ? 'bg-danger/10 text-[var(--danger)]'
                  : 'bg-success/10 text-[var(--success)]'
              }`}
            >
              📄 {pdfRunning ? (pdf.status === 'running' && pdf.cancelling ? '正在取消…' : '取消生成') : 'PDF'}
            </button>
          </div>
        </div>

        {/* ── PDF 进度（卡片顶部 2px）── */}
        {pdfRunning && (
          <div
            className="h-0.5 w-full overflow-hidden rounded-full bg-ink/[0.08]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={pdf.status === 'running' && pdf.total > 0 ? pdf.total : undefined}
            aria-valuenow={pdf.status === 'running' && pdf.total > 0 ? pdf.done : undefined}
            aria-valuetext={
              pdf.status === 'running' && pdf.total > 0
                ? `正在生成第 ${pdf.done} 页，共 ${pdf.total} 页`
                : '正在生成 PDF'
            }
          >
            <div
              className={`h-full bg-[#B04A2E] ${pdf.status === 'running' && pdf.total > 0 ? 'transition-all duration-normal ease-standard' : 'animate-pulse'}`}
              style={{
                width: pdf.status === 'running' && pdf.total > 0
                  ? `${Math.min(100, (pdf.done / pdf.total) * 100)}%`
                  : '35%',
              }}
            />
          </div>
        )}
        {pdfRunning && (
          <p className="py-1 text-center text-[11.5px] text-[var(--text-muted)]" aria-live="polite">
            {pdf.status === 'running' && pdf.cancelling
              ? '正在取消…'
              : pdf.status === 'running' && pdf.total > 0
                ? `生成中 ${pdf.done}/${pdf.total}，请勿关闭页面`
                : '准备中，请勿关闭页面'}
          </p>
        )}

        {/* iOS：异步生成完不能自动下载，挂一个真实 <a download> 让用户再点一次 */}
        {pdfResult && (
          <div className="mt-2 flex flex-col items-center gap-1.5">
            <a
              href={pdfResult.url}
              download={pdfResult.filename}
              onClick={() => showToast('已开始保存，可在「文件」App 中查看', 'success')}
              className="focus-ring inline-flex h-11 items-center gap-2 rounded-button bg-primary px-5 text-[14px] font-semibold text-ink shadow-card ring-1 ring-ink/[0.16] transition-transform duration-fast ease-standard active:scale-[0.97]"
            >
              <span aria-hidden="true">💾</span> 保存 PDF
            </a>
            <span className="text-[11.5px] leading-[1.5] text-[var(--text-muted)]">
              点一下保存到「文件」（iOS 需要这次点击才会放行下载）
            </span>
          </div>
        )}

        {/* ── 阅读器 ── */}
        <div className="flex items-stretch gap-2 md:gap-4">
          <PagerArrow
            direction="prev"
            disabled={currentPage === 0}
            onClick={() => goToPrev()}
          />

          <div className="relative min-w-0 flex-1">
            <div
              ref={stageRef}
              tabIndex={-1}
              role="region"
              aria-label="绘本页面"
              data-flipping={flip ? 'true' : undefined}
              className={`${isWide ? 'book-stage' : 'relative'} ${flip ? 'pointer-events-none' : ''} outline-none ${
                isOpeningBook ? 'scale-95' : 'scale-100'
              } transition-transform duration-slow ease-enter`}
            >
              {/* 手势平面：拖拽时只写 style，不触发 React 重渲染 */}
              <div
                ref={planeRef}
                className={`relative [touch-action:pan-y_pinch-zoom] ${slideFlip ? 'overflow-hidden' : ''}`}
              >
                {/* 底层：新页 */}
                <div
                  className={`page-layer relative ${flip?.kind === 'fade' ? 'animate-page-in' : ''}`}
                  style={enterStyle}
                  onAnimationEnd={flip?.kind === 'fade' ? handleLeafEnd : undefined}
                >
                  {renderPage(currentPage, !flip)}
                  {flip?.kind === 'leaf' && (
                    <div className="page-shadow animate-page-shadow pointer-events-none absolute inset-0" aria-hidden="true" />
                  )}
                </div>

                {/* 移动端：旧页快照滑出。单页不做 3D 半页翻转（半页 leaf 在单页上会撕裂） */}
                {slideFlip && (
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 z-20"
                    style={exitStyle}
                    onTransitionEnd={handleExitEnd}
                  >
                    {renderPage(slideFlip.from, false)}
                  </div>
                )}
              </div>

              {/* 桌面：旧页快照半页 3D 翻走 */}
              {flip?.kind === 'leaf' && (
                <div
                  key={`leaf-${flip.from}-${flip.dir}-${currentPage}`}
                  className={`flip-leaf ${
                    flip.dir === 'next' ? 'flip-leaf--next animate-flip-next' : 'flip-leaf--prev animate-flip-prev'
                  }`}
                  onAnimationEnd={handleLeafEnd}
                  aria-hidden="true"
                >
                  <div className={`h-full w-[200%] ${flip.dir === 'next' ? '-translate-x-1/2' : 'translate-x-0'}`}>
                    {renderPage(flip.from, true)}
                  </div>
                  <div className={`leaf-sheen ${flip.dir === 'prev' ? 'leaf-sheen--prev' : ''}`} />
                </div>
              )}
            </div>
          </div>

          <PagerArrow
            direction="next"
            disabled={currentPage === totalPages - 1}
            onClick={() => goToNext()}
          />
        </div>

        {/* ── 桌面页码点阵 ── */}
        <div className="hidden md:mt-4 md:block">
          <DesktopPageDots
            currentPage={currentPage}
            totalPages={totalPages}
            onSeek={seekTo}
            pageLabel={pageLabel}
          />
        </div>

        {/* 恢复提示：移动端浮在底部条上方，桌面在点阵下方 */}
        {progressRestored && (
          <div
            role="status"
            className={`pointer-events-none fixed left-1/2 z-30 -translate-x-1/2 rounded-full bg-[var(--brand-strong-soft)] px-3 py-1 text-[12px] text-[var(--brand-strong)] shadow-card bottom-[calc(56px+env(safe-area-inset-bottom)+14px)] md:static md:mx-auto md:mt-3 md:translate-x-0 ${
              hintLeaving ? 'opacity-0 transition-opacity duration-fast' : 'animate-fade-up'
            }`}
          >
            📖 已恢复上次阅读位置
          </div>
        )}

        {/* ── 视频 ── */}
        {showVideoGenerator && (
          <div className="mt-4 rounded-card bg-white p-4 shadow-card md:p-6">
            <h3 className="mb-1 text-[15px] font-semibold text-[var(--text-ink)]">🎬 生成绘本视频</h3>
            <p className="mb-3 text-[12px] leading-[1.6] text-[var(--warn)]">
              ⚠ 视频要生成 2–5 分钟，期间请保持页面打开；切走或关闭会中断，结果不会保存
            </p>
            <VideoGenerator
              imageUrls={book.scenes.map((s) => s.imageUrl).filter((url): url is string => !!url)}
              onVideoGenerated={setVideoUrl}
            />
          </div>
        )}

        {videoUrl && (
          <div className="mt-4 rounded-card bg-white p-4 shadow-card md:p-6">
            <h3 className="mb-2 text-[15px] font-semibold text-[var(--text-ink)]">📺 绘本视频</h3>
            <video src={videoUrl} controls className="w-full rounded-inner" />
            <p className="mt-2 text-[12px] text-[var(--warn)]">请立即下载保存，刷新会丢失</p>
            <a
              href={videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-[var(--brand-strong)] hover:underline"
            >
              📥 打开/下载视频
            </a>
          </div>
        )}
      </div>

      {/* ── 移动端底部控制条 ── */}
      <MobilePagerBar
        currentPage={currentPage}
        totalPages={totalPages}
        canPrev={currentPage > 0}
        canNext={currentPage < totalPages - 1}
        onPrev={() => goToPrev()}
        onNext={() => goToNext()}
        onSeek={seekTo}
        pageLabel={pageLabel}
      />
    </>
  )
}
