'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { CategoryTabs } from '@/components/CategoryTabs'
import { ContentSelector } from '@/components/ContentSelector'
import { TaskQueue } from '@/components/TaskQueue'
import { BookCard } from '@/components/BookCard'
import { useTaskStore } from '@/lib/task-store'
import { TaskExecutor } from '@/lib/task-executor'
import { useAppStore } from '@/lib/store'
import type { ContentCategory } from '@/lib/types'

interface IndexBook {
  id: string
  title: string
  meaning: string
  sceneCount: number
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
  const { createJobs, tasks } = useTaskStore()
  const executorRef = useRef<TaskExecutor | null>(null)

  // 书架数据
  const [indexData, setIndexData] = useState<IndexData | null>(null)
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)

  // 监听任务状态
  useEffect(() => {
    if (!isGenerating) return
    const jobs = tasks.filter(t => t.type === 'job')
    if (jobs.length === 0) return
    const allDone = jobs.every(j => j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled')
    if (allDone) {
      const timer = setTimeout(() => setIsGenerating(false), 500)
      return () => clearTimeout(timer)
    }
  }, [tasks, isGenerating])

  // 加载书架 + 恢复任务
  useEffect(() => {
    const init = async () => {
      await useTaskStore.getState().loadPersistedTasks()
      await loadIndex()
      const tasks = useTaskStore.getState().tasks
      const hasPendingJobs = tasks.some(t => t.type === 'job' && t.status === 'pending')
      if (hasPendingJobs && !executorRef.current) {
        executorRef.current = new TaskExecutor()
        executorRef.current.start()
      }
    }
    init()
    return () => { executorRef.current?.stop() }
  }, [])

  const loadIndex = async () => {
    setLoading(true)
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

  const getFilteredBooks = useCallback(() => {
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
  }, [indexData, filterCategory])

  const handleDelete = useCallback((id: string) => {
    // 文件系统删除后续实现
  }, [])

  const handleBatchGenerate = useCallback((idioms: string[]) => {
    if (isGenerating) return
    setIsGenerating(true)
    createJobs(idioms)
    if (!executorRef.current) {
      executorRef.current = new TaskExecutor()
    }
    executorRef.current.start()
  }, [createJobs, isGenerating])

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
            <ContentSelector category={currentCategory} compact />
          </div>
          <div className="lg:col-span-1 flex flex-col">
            <TaskQueue compact className="flex-1" />
          </div>
        </div>

        {/* 书架 */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-800">📚 我的绘本书架</h2>
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
