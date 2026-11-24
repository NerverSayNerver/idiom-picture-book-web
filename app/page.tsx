'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Link from 'next/link'
import Modal from '@/components/Modal'
import { CategoryTabs } from '@/components/CategoryTabs'
import { ContentSelector } from '@/components/ContentSelector'
import { TaskStatsCards } from '@/components/TaskStatsCards'
import { BookCard } from '@/components/BookCard'
import { useAppStore } from '@/lib/store'
import { useJobs } from '@/lib/use-jobs'
import type { ContentCategory } from '@/lib/types'
import Illustration from '@/components/Illustration'

interface IndexBook {
  id: string
  sourceText?: string
  title: string
  meaning: string
  sceneCount: number
  createdAt?: string
  author?: string
  category?: string
}

interface IndexCategory {
  label: string
  icon: string
  count: number
  items: IndexBook[]
}

interface IndexData {
  version: number
  generatedAt: string
  categories: Record<string, IndexCategory>
}

type SortOrder = 'default' | 'newest' | 'oldest' | 'title'
type LoadErrorKind = 'offline' | 'server' | 'data'
type BookWithCategory = IndexBook & { category: string }

/** 删除意图的最小载体：BookCard 只回传它自己持有的字段 */
interface DeleteTarget {
  id: string
  category: string
  title: string
  sceneCount?: number
}

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'default', label: '默认排序' },
  { value: 'newest', label: '最近创建' },
  { value: 'oldest', label: '最早创建' },
  { value: 'title', label: '按标题' },
]

const CATEGORY_LABELS: Record<string, string> = {
  idiom: '成语',
  poetry: '古诗',
  proverb: '谚语',
  'nursery-rhyme': '儿歌',
  'fairy-tale': '童话',
}

const EMPTY_INDEX: IndexData = { version: 0, generatedAt: '', categories: {} }

const ERROR_COPY: Record<LoadErrorKind, { title: string; description: string; emoji: string }> = {
  offline: {
    title: '书架没打开，好像没有网络 😢',
    description: '检查一下 wifi 或流量，然后重试',
    emoji: '📶',
  },
  server: {
    title: '服务器打了个盹',
    description: '稍等几秒再试一次',
    emoji: '☁️',
  },
  data: {
    title: '绘本目录格式不对，可能正在更新',
    description: '稍后再来看',
    emoji: '🧾',
  },
}

/**
 * 共享 Modal（components/Modal.tsx，Package A 从 TaskCard 原样抽出）。
 * dismissible=false：请求在途时屏蔽 ESC / 遮罩 / ✕，避免「界面关了但删了一半」。
 */
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function isValidIndex(data: unknown): data is IndexData {
  if (!data || typeof data !== 'object') return false
  const categories = (data as IndexData).categories
  if (!categories || typeof categories !== 'object') return false
  return Object.values(categories).every(
    (cat) => !!cat && typeof cat === 'object' && Array.isArray((cat as IndexCategory).items)
  )
}

export default function Home() {
  const currentCategory = useAppStore((s) => s.currentCategory)
  const setCurrentCategory = useAppStore((s) => s.setCurrentCategory)

  // 书架数据
  const [indexData, setIndexData] = useState<IndexData | null>(null)
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [searchText, setSearchText] = useState('')
  const [sortOrder, setSortOrder] = useState<SortOrder>('default')
  /** loading 只用于「首次加载」；二次刷新不得把已有内容打回骨架 */
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState<LoadErrorKind | null>(null)

  // 删除确认（L2 模态）
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [removingKey, setRemovingKey] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  // 任务状态（通过 API 轮询）
  const { jobs } = useJobs()

  const hasLoadedOnceRef = useRef(false)
  const loadSeqRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const deletingRef = useRef(false)
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null)
  const modalHostRef = useRef<HTMLDivElement | null>(null)
  const completedCountRef = useRef<number | null>(null)

  const showToast = useCallback((message: string) => {
    setToast(message)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(''), 5000)
  }, [])

  /**
   * 书架加载三态化：
   *  - 404 = 还没生成 index.json → 空态（不是错误，绝不能显示「加载失败」）
   *  - !res.ok / JSON 解析失败 / 结构不对 → 抛错，1.5s 后自动重试一次，仍失败才进错误态
   *  - 已有内容时的刷新失败 → 保留旧内容，只做一条非阻塞提示
   */
  const loadIndex = useCallback(async (isRetry = false) => {
    const seq = ++loadSeqRef.current
    let failureKind: LoadErrorKind = 'server'
    try {
      const res = await fetch('/generated/index.json', { cache: 'no-store' })
      if (seq !== loadSeqRef.current) return
      if (res.status === 404) {
        // 目录还没生成：空书架
        hasLoadedOnceRef.current = true
        setIndexData(EMPTY_INDEX)
        setLoadState('ready')
        setLoadError(null)
        return
      }
      if (!res.ok) {
        failureKind = 'server'
        throw new Error(`HTTP ${res.status}`)
      }
      let data: unknown
      try {
        data = await res.json()
      } catch {
        failureKind = 'data'
        throw new Error('index.json 解析失败')
      }
      if (!isValidIndex(data)) {
        failureKind = 'data'
        throw new Error('index.json 结构异常')
      }
      if (seq !== loadSeqRef.current) return
      hasLoadedOnceRef.current = true
      setIndexData(data)
      setLoadState('ready')
      setLoadError(null)
    } catch (error) {
      if (seq !== loadSeqRef.current) return
      // 首次失败：1.5s 后自动重试一次
      if (!isRetry) {
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
        retryTimerRef.current = setTimeout(() => { void loadIndex(true) }, 1500)
        return
      }
      const offline = typeof navigator !== 'undefined' && !navigator.onLine
      const kind: LoadErrorKind = offline ? 'offline' : failureKind
      setLoadError(kind)
      if (hasLoadedOnceRef.current) {
        // 已有内容：不打断阅读，只提示
        setLoadState('ready')
      } else {
        setLoadState('error')
      }
      console.warn('书架索引加载失败:', error)
    }
  }, [])

  // 任务完成 → 刷新书架（首次拿到基线不触发，避免多余请求）
  useEffect(() => {
    const completedJobs = jobs.filter(t => t.type === 'job' && t.status === 'completed').length
    if (completedCountRef.current === null) {
      completedCountRef.current = completedJobs
      return
    }
    if (completedJobs > completedCountRef.current) void loadIndex()
    completedCountRef.current = completedJobs
  }, [jobs, loadIndex])

  // 首次加载 + 页面可见时刷新（refresh 不置 loading，不会把内容打回骨架）
  useEffect(() => {
    void loadIndex()
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void loadIndex()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [loadIndex])

  // 打开删除确认时把默认焦点放在「取消」上（防误触 Enter 直接删除）
  useEffect(() => {
    if (!deleteTarget) return
    cancelButtonRef.current?.focus()
  }, [deleteTarget])

  // 硬加载 /#bookshelf 时 Next 的原生 fragment 滚动与 hydration 存在竞态（实测会被重置回页顶），
  // 软导航由框架 scrollIntoView+focus 处理；本 effect 幂等兜底：只认 #bookshelf，同位置重滚无副作用。
  // 依赖 loadState：书架骨架→真实网格会改变 section 的 offsetTop（实测 610→816），
  // 数据落定后需重锚一次，否则按骨架高度滚出的位置会漂移 200px+；
  // loadState 稳定后（visibility 刷新写入同值）React 不重渲染，不会重复触发。
  useEffect(() => {
    const onArrive = () => {
      if (window.location.hash !== '#bookshelf') return
      const el = document.getElementById('bookshelf')
      if (!el) return
      el.scrollIntoView({ block: 'start' }) // 无 behavior = 瞬时；reduced-motion 由 globals.css 兜底
      el.focus({ preventScroll: true })
    }
    onArrive()
    window.addEventListener('hashchange', onArrive)
    return () => window.removeEventListener('hashchange', onArrive)
  }, [loadState])

  const totalBooks = indexData
    ? Object.values(indexData.categories).reduce((sum, cat) => sum + cat.count, 0)
    : 0

  const generatedTexts = useMemo(() => {
    if (!indexData) return []
    const categoryData = indexData.categories[currentCategory]
    if (!categoryData) return []
    return categoryData.items.map(item => item.sourceText).filter((text): text is string => !!text)
  }, [indexData, currentCategory])

  const activeTexts = useMemo(() =>
    new Set(jobs
      .filter(j => ['pending', 'running', 'paused'].includes(j.status))
      .map(j => j.sourceText)
      .filter((t): t is string => !!t)),
    [jobs]
  )

  const getFilteredBooks = () => {
    if (!indexData) return []
    let books: BookWithCategory[]
    if (filterCategory === 'all') {
      books = Object.entries(indexData.categories).flatMap(([cat, data]) =>
        data.items.map((item: IndexBook) => ({ ...item, category: cat }))
      )
    } else {
      books = (indexData.categories[filterCategory]?.items || []).map((item: IndexBook) => ({
        ...item,
        category: filterCategory,
      }))
    }

    // 关键词搜索：标题/原文/含义，忽略大小写
    const keyword = searchText.trim().toLowerCase()
    if (keyword) {
      books = books.filter((book) =>
        [book.title, book.sourceText, book.meaning]
          .filter((t): t is string => !!t)
          .some((t) => t.toLowerCase().includes(keyword))
      )
    }

    // 排序（createdAt 缺失时排最后，保持稳定）
    if (sortOrder !== 'default') {
      books = [...books].sort((a, b) => {
        if (sortOrder === 'title') {
          return (a.title || '').localeCompare(b.title || '', 'zh-Hans-CN')
        }
        const ta = a.createdAt ? Date.parse(a.createdAt) : 0
        const tb = b.createdAt ? Date.parse(b.createdAt) : 0
        // 无效日期字符串统一按 0（排最后），避免 NaN 破坏排序
        const na = Number.isFinite(ta) ? ta : 0
        const nb = Number.isFinite(tb) ? tb : 0
        if (na === nb) return 0
        if (sortOrder === 'newest') return nb - na
        return na - nb
      })
    }
    return books
  }

  const filteredBooks = getFilteredBooks()
  const hasSearch = searchText.trim() !== ''
  const isErrorView = loadState === 'error'

  /** 滚动到选择器（可选：聚焦第一个可选 chip） */
  const jumpToSelector = useCallback((focusFirstChip = false) => {
    const panel = document.querySelector<HTMLElement>('[role="tabpanel"]')
    if (!panel) return
    const reduced =
      typeof window !== 'undefined' &&
      (document.documentElement.classList.contains('motion-reduced') ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    panel.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
    if (focusFirstChip) {
      const chip = panel.querySelector<HTMLButtonElement>('button[aria-pressed]:not([aria-disabled="true"])')
      chip?.focus({ preventScroll: true })
    }
  }, [])

  // ── 删除绘本（L2：确认模态 → 校验 res.ok → 240ms 淡出 → toast）──
  const openDeleteModal = (book: DeleteTarget) => {
    setDeleteError('')
    setDeleteTarget({ id: book.id, category: book.category, title: book.title, sceneCount: book.sceneCount })
  }

  const closeDeleteModal = () => {
    if (deletingRef.current) return
    setDeleteTarget(null)
    setDeleteError('')
  }

  /** 走 Modal 自身的退出动画（点击它的关闭按钮），保持与全站弹窗一致 */
  const requestCloseDeleteModal = useCallback(() => {
    const button = modalHostRef.current?.querySelector<HTMLButtonElement>('button[aria-label="关闭弹窗"]')
    if (button) button.click()
    else setDeleteTarget(null)
  }, [])

  const removeBookFromIndex = (category: string, id: string) => {
    setIndexData(prev => {
      if (!prev) return prev
      const cat = prev.categories[category]
      if (!cat) return prev
      const items = cat.items.filter(item => item.id !== id)
      const categories = { ...prev.categories }
      if (items.length === 0) {
        delete categories[category]
      } else {
        categories[category] = { ...cat, items, count: items.length }
      }
      return { ...prev, categories }
    })
  }

  const confirmDelete = async () => {
    if (!deleteTarget || deletingRef.current) return
    const book = deleteTarget
    const key = `${book.category}-${book.id}`
    deletingRef.current = true
    setDeleting(true)
    setDeleteError('')
    try {
      const res = await fetch(`/api/books/${encodeURIComponent(book.category)}:${encodeURIComponent(book.id)}`, {
        method: 'DELETE',
        headers: { 'X-Internal-Key': process.env.NEXT_PUBLIC_INTERNAL_API_KEY || '' },
      })
      // 不做乐观删除：失败时列表必须保持原样
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      deletingRef.current = false
      setDeleting(false)
      // 关模态（自带 160ms 退出动画）→ 卡片 240ms 淡出 → toast
      // wait(0) 让 Modal 的 dismissible 先恢复 true，否则它自己的 requestClose 会被拦下
      await wait(0)
      requestCloseDeleteModal()
      await wait(160)
      setRemovingKey(key)
      await wait(240)
      removeBookFromIndex(book.category, book.id)
      setRemovingKey(null)
      showToast(`已删除《${book.title}》`)
      setDeleteTarget(null)
    } catch (error) {
      console.warn('删除绘本失败:', error)
      setDeleteError('删除失败，请重试')
      setDeleting(false)
      deletingRef.current = false
    }
  }

  return (
    <main id="main" tabIndex={-1} className="min-h-screen bg-gradient-to-b from-secondary/30 to-background focus:outline-none">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Hero 横幅 */}
        <section className="relative overflow-hidden rounded-card shadow-card mb-6 bg-gradient-to-r from-secondary via-primary/30 to-accent/20 animate-fade-up">
          <div className="grid grid-cols-1 md:grid-cols-5 items-center">
            <div className="md:col-span-3 p-6 md:p-8">
              <h1 className="text-2xl md:text-3xl font-bold text-[var(--text-ink)] mb-2">
                🎨 绘本工坊
              </h1>
              <p className="text-sm md:text-base text-[var(--text-body)] mb-3">
                把成语、古诗、童话变成可视、可听、可读的童趣绘本，和宝贝一起翻开创作之旅。
              </p>
              <div className="flex flex-wrap gap-2 text-xs text-[var(--text-body)]">
                <span className="bg-white/70 px-3 py-1 rounded-full">🖼️ AI 自动配图</span>
                <span className="bg-white/70 px-3 py-1 rounded-full">🔊 语音朗读</span>
                <span className="bg-white/70 px-3 py-1 rounded-full">📚 多类内容</span>
              </div>
            </div>
            {/* <640 不渲染插图：首屏省 160px，移动端 LCP 交给文案 */}
            <div className="hidden sm:block md:col-span-2 h-40 md:h-48 relative">
              {/* 本地 SVG：原先的外链接口已 404，返回的英文占位图直接出现在首屏主视觉上。
                  SVG 无需网络请求，也没有 float 动画（首屏 LCP 与 reduced-motion 双收益）。 */}
              <Illustration name="hero" className="w-full h-full -mt-2" />
            </div>
          </div>
        </section>

        {/* Tab 导航 + 选择器 + 队列（书架挂了也不影响做新绘本） */}
        <CategoryTabs
          activeCategory={currentCategory}
          onCategoryChange={setCurrentCategory}
        />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4 mb-8">
          <div className="lg:col-span-2 h-full">
            <ContentSelector category={currentCategory} generatedTexts={generatedTexts} activeTexts={activeTexts} />
          </div>
          <div className="lg:col-span-1 h-full">
            <TaskStatsCards />
          </div>
        </div>

        {/* 书架 */}
        <section id="bookshelf" tabIndex={-1} aria-labelledby="shelf-heading" className="scroll-mt-[60px]">
          <div className="mb-4">
            <h2 id="shelf-heading" className="text-2xl font-bold text-[var(--text-ink)]">📚 绘本成品</h2>
          </div>

          {/* 书架筛选 / 搜索 / 排序：错误态下隐藏（此时书架本身不可用） */}
          {!isErrorView && (
            <>
              <div className="flex gap-2 mb-4 flex-wrap">
                <button
                  type="button"
                  onClick={() => setFilterCategory('all')}
                  aria-pressed={filterCategory === 'all'}
                  className={`px-3 min-h-[36px] rounded-full text-sm transition-colors duration-fast focus-ring ${
                    filterCategory === 'all'
                      ? 'bg-[var(--brand-strong-soft)] text-[var(--brand-strong)] font-medium'
                      : 'bg-ink/[.05] text-[var(--text-body)] hover:bg-ink/[.09]'
                  }`}
                >
                  全部 ({totalBooks})
                </button>
                {indexData && Object.entries(indexData.categories).map(([cat, data]) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setFilterCategory(cat)}
                    aria-pressed={filterCategory === cat}
                    className={`px-3 min-h-[36px] rounded-full text-sm transition-colors duration-fast focus-ring ${
                      filterCategory === cat
                        ? 'bg-[var(--brand-strong-soft)] text-[var(--brand-strong)] font-medium'
                        : 'bg-ink/[.05] text-[var(--text-body)] hover:bg-ink/[.09]'
                    }`}
                  >
                    {data.icon} {data.label} ({data.count})
                  </button>
                ))}
              </div>

              <div className="flex gap-2 mb-4 flex-wrap items-center">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <input
                    type="search"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="搜索标题、原文或含义…"
                    className="w-full px-4 py-2 pr-9 rounded-full text-sm bg-white border border-[var(--hairline)] text-[var(--text-ink)] focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all duration-fast"
                    aria-label="搜索绘本"
                  />
                  {searchText && (
                    <button
                      type="button"
                      onClick={() => setSearchText('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-body)] focus-ring rounded-full"
                      aria-label="清空搜索"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                  className="px-3 py-2 rounded-full text-sm bg-white border border-[var(--hairline)] text-[var(--text-body)] focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all duration-fast"
                  aria-label="排序方式"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* 已有内容但刷新失败：非阻塞提示，不打回骨架 */}
          {loadError && !isErrorView && hasLoadedOnceRef.current && (
            <div
              role="status"
              className="mb-4 flex items-center justify-between gap-2 rounded-inner bg-[var(--warn-soft)] px-3 py-2 text-[12px] text-[var(--warn)]"
            >
              <span>⚠ 书架刚刚没刷新成功，先显示上次的内容</span>
              <button
                type="button"
                onClick={() => void loadIndex()}
                className="shrink-0 underline underline-offset-2 font-medium focus-ring rounded-inner"
              >
                重试
              </button>
            </div>
          )}

          {loadState === 'loading' ? (
            /* 骨架：base 2 / sm 4 / lg 3 / xl 4 张，与网格列数对齐 */
            <div role="status" aria-live="polite">
              <span className="sr-only">正在加载绘本</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                {Array.from({ length: 4 }, (_, i) => (
                  <div
                    key={`skeleton-${i}`}
                    className={`rounded-card bg-white shadow-card overflow-hidden ${
                      i < 2 ? '' : i === 2 ? 'hidden sm:block' : 'hidden sm:block lg:hidden xl:block'
                    }`}
                  >
                    <div className="aspect-[4/3] bg-ink/[.06] animate-pulse" />
                    <div className="p-4 space-y-2">
                      <div className="h-4 w-2/3 rounded-full bg-ink/[.08] animate-pulse" />
                      <div className="h-3 w-1/2 rounded-full bg-ink/[.06] animate-pulse" />
                    </div>
                    <div className="px-4 pb-4 flex gap-2">
                      <div className="h-11 flex-1 rounded-button bg-ink/[.06] animate-pulse" />
                      <div className="h-11 w-11 rounded-button bg-ink/[.06] animate-pulse" />
                      <div className="h-11 w-11 rounded-button bg-ink/[.06] animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : isErrorView ? (
            /* 错误态：按类型给不同文案 + 44px 重试 */
            <div role="alert" className="rounded-card bg-white shadow-card px-6 py-12 text-center">
              <div aria-hidden="true" className="text-3xl mb-3">
                {ERROR_COPY[loadError ?? 'server'].emoji}
              </div>
              <h3 className="text-lg font-semibold text-[var(--text-ink)]">
                {ERROR_COPY[loadError ?? 'server'].title}
              </h3>
              <p className="mt-1 text-sm text-[var(--text-body)]">
                {ERROR_COPY[loadError ?? 'server'].description}
              </p>
              <button
                type="button"
                onClick={() => void loadIndex()}
                className="mt-5 h-11 px-6 rounded-button bg-[var(--brand-strong)] text-white text-sm font-semibold hover:opacity-90 active:scale-[0.97] transition-all duration-fast focus-ring"
              >
                重试
              </button>
              <p className="mt-2 text-[11px] text-[var(--text-muted)]">已自动重试 1 次，你也可以手动重试</p>
            </div>
          ) : filteredBooks.length === 0 ? (
            /* 三种空态必须区分：搜索无结果 / 分类空 / 真没有 */
            hasSearch ? (
              <div className="rounded-card bg-white shadow-card overflow-hidden px-6 py-10 text-center">
                <Illustration name="empty-shelf" className="w-full max-w-[220px] mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-[var(--text-ink)]">
                  没找到「{searchText.trim()}」
                </h3>
                <p className="mt-1 text-sm text-[var(--text-body)]">
                  换个关键词试试，或者清空搜索看全部绘本。
                </p>
                <button
                  type="button"
                  onClick={() => setSearchText('')}
                  className="mt-4 h-11 px-6 rounded-button bg-[var(--brand-strong-soft)] text-[var(--brand-strong)] text-sm font-semibold hover:opacity-85 active:scale-[0.97] transition-all duration-fast focus-ring"
                >
                  清空搜索
                </button>
              </div>
            ) : filterCategory !== 'all' ? (
              <div className="rounded-card bg-white shadow-card overflow-hidden px-6 py-10 text-center">
                <Illustration name="empty-shelf" className="w-full max-w-[220px] mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-[var(--text-ink)]">
                  「{indexData?.categories[filterCategory]?.label ?? CATEGORY_LABELS[filterCategory] ?? '这个分类'}」还一本都没有
                </h3>
                <p className="mt-1 text-sm text-[var(--text-body)]">做一本就有啦，只要一句话的时间。</p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFilterCategory('all')}
                    className="h-11 px-5 rounded-button bg-ink/[.06] text-[var(--text-body)] text-sm font-medium hover:bg-ink/10 active:scale-[0.97] transition-all duration-fast focus-ring"
                  >
                    看看全部绘本
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentCategory(filterCategory as ContentCategory)
                      jumpToSelector(true)
                    }}
                    className="h-11 px-5 rounded-button bg-[var(--brand-strong)] text-white text-sm font-semibold hover:opacity-90 active:scale-[0.97] transition-all duration-fast focus-ring"
                  >
                    🎨 做一本{CATEGORY_LABELS[filterCategory] ?? '新'}绘本
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-card bg-white shadow-card overflow-hidden px-6 py-10 text-center">
                <Illustration name="empty-shelf" className="w-full max-w-[260px] mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-[var(--text-ink)]">
                  书架还空着，等你来讲第一个故事 🌱
                </h3>
                <p className="mt-2 text-sm text-[var(--text-body)]">
                  选一个成语或古诗，AI 会画成一本可以翻的绘本
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => jumpToSelector(true)}
                    className="h-11 px-6 rounded-button bg-[var(--brand-strong)] text-white text-sm font-semibold hover:opacity-90 active:scale-[0.97] transition-all duration-fast focus-ring"
                  >
                    ✨ 挑一个开始创作
                  </button>
                  <Link
                    href="/tasks"
                    className="h-11 px-5 inline-flex items-center rounded-button bg-ink/[.06] text-[var(--text-body)] text-sm font-medium hover:bg-ink/10 transition-all duration-fast focus-ring"
                  >
                    去任务中心看看
                  </Link>
                </div>
              </div>
            )
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
              {filteredBooks.map((book: BookWithCategory, index: number) => (
                <BookCard
                  key={`${book.category}-${book.id}`}
                  book={book}
                  onDelete={openDeleteModal}
                  entranceDelay={index < 6 ? index * 50 : 250}
                  removing={removingKey === `${book.category}-${book.id}`}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 删除确认模态：L2 保护（物理删除不可恢复，不假装提供撤销） */}
      {deleteTarget && (
        <div ref={modalHostRef}>
          <Modal
            title="删除绘本"
            onClose={closeDeleteModal}
            /* 请求在途时禁止 ESC / 遮罩 / ✕ 关闭：避免界面关了但删除请求还在跑 */
            dismissible={!deleting}
            panelClassName="w-[min(92vw,440px)] bg-white rounded-card shadow-modal overflow-hidden"
          >
            <div className="px-6 py-5">
              <p className="text-base font-semibold text-[var(--text-ink)]">
                删除《{deleteTarget.title}》？
              </p>
              <ul className="mt-3 space-y-1.5 text-sm text-[var(--text-body)]">
                <li>· 会删除这本绘本的 {deleteTarget.sceneCount || '全部'} 张插图和目录记录</li>
                <li>· 删除后无法恢复</li>
                <li>· 生成任务记录会保留，可以重新生成</li>
              </ul>

              {deleteError && (
                <p role="alert" className="mt-3 text-sm text-[var(--danger)]">⚠ {deleteError}</p>
              )}

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  ref={cancelButtonRef}
                  type="button"
                  onClick={closeDeleteModal}
                  disabled={deleting}
                  className="h-11 px-5 rounded-button bg-ink/[.06] text-[var(--text-body)] text-sm font-medium hover:bg-ink/10 active:scale-[0.97] transition-all duration-fast disabled:opacity-50 focus-ring"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void confirmDelete()}
                  disabled={deleting}
                  aria-busy={deleting || undefined}
                  className="h-11 px-5 rounded-button bg-[var(--danger)] text-white text-sm font-semibold hover:opacity-90 active:scale-[0.97] transition-all duration-fast disabled:opacity-70 disabled:cursor-not-allowed focus-ring"
                >
                  {deleting ? '删除中…' : deleteError ? '重试' : '删除绘本'}
                </button>
              </div>
            </div>
          </Modal>
        </div>
      )}

      {/* 删除成功提示（5s） */}
      {toast && (
        <div
          role="status"
          className="fixed left-1/2 -translate-x-1/2 bottom-6 z-40 max-w-[92vw] rounded-button bg-[var(--text-ink)] px-4 py-3 text-sm text-white shadow-modal animate-fade-in"
        >
          {toast}
        </div>
      )}
    </main>
  )
}
