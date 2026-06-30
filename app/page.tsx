'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { CategoryTabs } from '@/components/CategoryTabs'
import { ContentSelector } from '@/components/ContentSelector'
import { TaskQueue } from '@/components/TaskQueue'
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

export default function Home() {
  const currentCategory = useAppStore((s) => s.currentCategory)
  const setCurrentCategory = useAppStore((s) => s.setCurrentCategory)

  // 书架数据
  const [indexData, setIndexData] = useState<IndexData | null>(null)
  const [filterCategory, setFilterCategory] = useState<string>('all')
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
    if (filterCategory === 'all') {
      return Object.entries(indexData.categories).flatMap(([cat, data]) =>
        data.items.map((item: IndexBook) => ({ ...item, category: cat }))
      )
    }
    return (indexData.categories[filterCategory]?.items || []).map((item: IndexBook) => ({
      ...item,
      category: filterCategory,
    }))
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
        {/* Tab 导航 + 选择器 + 队列 */}
        <CategoryTabs
          activeCategory={currentCategory}
          onCategoryChange={setCurrentCategory}
        />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4 mb-8">
          <div className="lg:col-span-2">
            <ContentSelector category={currentCategory} compact generatedTexts={generatedTexts} activeTexts={activeTexts} />
          </div>
          <div className="lg:col-span-1 flex flex-col">
            <TaskQueue compact className="flex-1" />
          </div>
        </div>

        {/* 书架 */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-800">📚 绘本成品</h2>
            <span className="text-gray-500">{totalBooks} 本</span>
          </div>

          {/* 书架筛选 Tab */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <button
              onClick={() => setFilterCategory('all')}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                filterCategory === 'all'
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              全部 ({totalBooks})
            </button>
            {indexData && Object.entries(indexData.categories).map(([cat, data]) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  filterCategory === cat
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {data.icon} {data.label} ({data.count})
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-16">
              <div className="text-2xl text-gray-500 animate-pulse">加载中...</div>
            </div>
          ) : filteredBooks.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-card shadow-md">
              <div className="text-6xl mb-4">📖</div>
              <h3 className="text-xl font-semibold text-gray-700 mb-2">
                {filterCategory === 'all' ? '还没有绘本' : '暂无该分类绘本'}
              </h3>
              <p className="text-gray-500">
                {filterCategory === 'all' ? '选择一个内容开始创作吧！' : '切换到其他分类看看吧！'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredBooks.map((book: any) => (
                <BookCard
                  key={`${book.category}-${book.id}`}
                  book={book}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
