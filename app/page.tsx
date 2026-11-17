'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { CategoryTabs } from '@/components/CategoryTabs'
import { ContentSelector } from '@/components/ContentSelector'
import { TaskStatsCards } from '@/components/TaskStatsCards'
import { BookCard } from '@/components/BookCard'
import { useAppStore } from '@/lib/store'
import { useJobs } from '@/lib/use-jobs'
import type { ContentCategory } from '@/lib/types'

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

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'default', label: '默认排序' },
  { value: 'newest', label: '最近创建' },
  { value: 'oldest', label: '最早创建' },
  { value: 'title', label: '按标题' },
]

export default function Home() {
  const currentCategory = useAppStore((s) => s.currentCategory)
  const setCurrentCategory = useAppStore((s) => s.setCurrentCategory)

  // 书架数据
  const [indexData, setIndexData] = useState<IndexData | null>(null)
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [searchText, setSearchText] = useState('')
  const [sortOrder, setSortOrder] = useState<SortOrder>('default')
  const [loading, setLoading] = useState(true)

  // 任务状态（通过 API 轮询）
  const { jobs } = useJobs()

  // 监听任务完成，刷新书架数据
  const completedCountRef = useRef(0)
  useEffect(() => {
    const completedJobs = jobs.filter(t => t.type === 'job' && t.status === 'completed').length
    if (completedJobs > completedCountRef.current) {
      // 有新任务完成，刷新书架
      loadIndex()
    }
    completedCountRef.current = completedJobs
  }, [jobs])

  // 加载书架数据 + 超时兜底 + 页面可见时刷新
  useEffect(() => {
    loadIndex()
    const timer = setTimeout(() => setLoading(false), 5000)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadIndex()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadIndex = async () => {
    try {
      const res = await fetch('/generated/index.json')
      if (res.ok) {
        const data = await res.json()
        setIndexData(data)
      }
    } catch {
      // no index yet
    }
    setLoading(false)
  }

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
    let books: (IndexBook & { category: string })[]
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

  const handleDelete = async (id: string) => {
    if (!indexData) return
    // 在所有分类中查找该书的 category
    for (const [category, catData] of Object.entries(indexData.categories)) {
      const book = catData.items.find(item => item.id === id)
      if (book) {
        try {
          const res = await fetch(`/api/books/${encodeURIComponent(category)}:${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: { 'X-Internal-Key': process.env.NEXT_PUBLIC_INTERNAL_API_KEY || '' },
          })
          if (res.ok) {
            loadIndex()
          }
        } catch (err) {
          console.error('删除失败:', err)
        }
        return
      }
    }
  }

  const filteredBooks = getFilteredBooks()

  return (
    <main className="min-h-screen bg-gradient-to-b from-secondary/30 to-background">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Hero 横幅 */}
        <section className="relative overflow-hidden rounded-card shadow-md mb-6 bg-gradient-to-r from-secondary via-primary/30 to-accent/20 animate-fade-up">
          <div className="grid grid-cols-1 md:grid-cols-5 items-center">
            <div className="md:col-span-3 p-6 md:p-8">
              <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-2">
                🎨 绘本工坊
              </h1>
              <p className="text-sm md:text-base text-gray-600 mb-3">
                把成语、古诗、童话变成可视、可听、可读的童趣绘本，和宝贝一起翻开创作之旅。
              </p>
              <div className="flex flex-wrap gap-2 text-xs text-gray-700">
                <span className="bg-white/70 px-3 py-1 rounded-full">🖼️ AI 自动配图</span>
                <span className="bg-white/70 px-3 py-1 rounded-full">🔊 语音朗读</span>
                <span className="bg-white/70 px-3 py-1 rounded-full">📚 多类内容</span>
              </div>
            </div>
            <div className="md:col-span-2 h-40 md:h-48 relative">
              <img
                src="https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Children%27s%20picture%20book%20illustration%2C%20warm%20pastel%20tone%20with%20peach%20pink%20and%20cream%20color%20palette%2C%20a%20parent%20and%20child%20reading%20a%20storybook%20together%20surrounded%20by%20cute%20woodland%20animals%20and%20floating%20stars%2C%20soft%20watercolor%20style%2C%20whimsical%20and%20dreamy%2C%20no%20text&image_size=landscape_4_3"
                alt="和宝贝一起读绘本"
                className="w-full h-[calc(100%_+_16px)] -mt-2 object-cover animate-float-soft hero-float"
                loading="lazy"
              />
            </div>
          </div>
        </section>

        {/* Tab 导航 + 选择器 + 队列 */}
        <CategoryTabs
          activeCategory={currentCategory}
          onCategoryChange={setCurrentCategory}
        />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4 mb-8">
          <div className="lg:col-span-2 h-full">
            <ContentSelector category={currentCategory} compact generatedTexts={generatedTexts} activeTexts={activeTexts} />
          </div>
          <div className="lg:col-span-1 h-full">
            <TaskStatsCards />
          </div>
        </div>

        {/* 书架 */}
        <div>
          <div className="mb-4">
            <h2 className="text-2xl font-bold text-gray-800">📚 绘本成品</h2>
          </div>

          {/* 书架筛选 Tab */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <button
              onClick={() => setFilterCategory('all')}
              className={`px-3 py-1 rounded-full text-sm transition-colors duration-fast ${
                filterCategory === 'all'
                  ? 'bg-primary text-ink'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              全部 ({totalBooks})
            </button>
            {indexData && Object.entries(indexData.categories).map(([cat, data]) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-3 py-1 rounded-full text-sm transition-colors duration-fast ${
                  filterCategory === cat
                    ? 'bg-primary text-ink'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {data.icon} {data.label} ({data.count})
              </button>
            ))}
          </div>

          {/* 搜索 + 排序 */}
          <div className="flex gap-2 mb-4 flex-wrap items-center">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <input
                type="search"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="搜索标题、原文或含义…"
                className="w-full px-4 py-2 pr-9 rounded-full text-sm bg-white border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all duration-fast"
                aria-label="搜索绘本"
              />
              {searchText && (
                <button
                  onClick={() => setSearchText('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label="清空搜索"
                >
                  ✕
                </button>
              )}
            </div>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as SortOrder)}
              className="px-3 py-2 rounded-full text-sm bg-white border border-gray-200 text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all duration-fast"
              aria-label="排序方式"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="text-center py-16">
              <div className="text-2xl text-gray-500 animate-fade-in">加载中...</div>
            </div>
          ) : filteredBooks.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-card shadow-md overflow-hidden">
              <img
                src="https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Children%27s%20book%20illustration%2C%20an%20empty%20wooden%20bookshelf%20with%20a%20small%20potted%20plant%20on%20top%2C%20soft%20warm%20sunlight%2C%20peach%20pink%20and%20cream%20color%20palette%2C%20cute%20watercolor%20style%2C%20cozy%20and%20minimal%2C%20no%20text&image_size=landscape_4_3"
                alt="还没有绘本"
                className="w-full max-w-md mx-auto rounded-lg"
                loading="lazy"
              />
              <h3 className="text-xl font-semibold text-gray-700 mb-2 mt-4">
                {searchText.trim()
                  ? '未找到匹配的绘本'
                  : filterCategory === 'all' ? '还没有绘本' : '暂无该分类绘本'}
              </h3>
              <p className="text-gray-500">
                {searchText.trim()
                  ? '换个关键词试试，或清空搜索查看全部。'
                  : filterCategory === 'all' ? '选择一个内容开始创作吧！' : '切换到其他分类看看吧！'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredBooks.map((book: IndexBook & { category: string }, index: number) => (
                <BookCard
                  key={`${book.category}-${book.id}`}
                  book={book}
                  onDelete={handleDelete}
                  entranceDelay={index < 6 ? index * 50 : 250}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
