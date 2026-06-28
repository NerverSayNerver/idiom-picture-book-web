'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { IdiomSelector } from '@/components/IdiomSelector'
import { TaskQueue } from '@/components/TaskQueue'
import { BookCard } from '@/components/BookCard'
import { useTaskStore } from '@/lib/task-store'
import { TaskExecutor } from '@/lib/task-executor'
import { getAllPictureBooks, deletePictureBook } from '@/lib/db'
import type { PictureBook } from '@/lib/types'

export default function Home() {
  const { createJobs, tasks } = useTaskStore()
  const executorRef = useRef<TaskExecutor | null>(null)
  const [books, setBooks] = useState<PictureBook[]>([])
  const [loading, setLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)

  // 监听任务状态：当所有 job 都结束（completed/failed/cancelled）时重置 isGenerating
  useEffect(() => {
    if (!isGenerating) return
    const jobs = tasks.filter(t => t.type === 'job')
    if (jobs.length === 0) return
    const allDone = jobs.every(j => j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled')
    if (allDone) {
      // 延迟重置，避免闪烁
      const timer = setTimeout(() => setIsGenerating(false), 500)
      return () => clearTimeout(timer)
    }
  }, [tasks, isGenerating])

  // 初始化：加载持久化任务和绘本列表
  useEffect(() => {
    const init = async () => {
      await useTaskStore.getState().loadPersistedTasks()
      await loadBooks()

      // 如果有持久化的 pending 任务，自动恢复执行
      const tasks = useTaskStore.getState().tasks
      const hasPendingJobs = tasks.some(t => t.type === 'job' && t.status === 'pending')
      if (hasPendingJobs && !executorRef.current) {
        executorRef.current = new TaskExecutor()
        executorRef.current.start()
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 组件卸载时停止执行器
  useEffect(() => {
    return () => {
      executorRef.current?.stop()
    }
  }, [])

  const loadBooks = async () => {
    setLoading(true)
    const allBooks: PictureBook[] = []
    const seenIds = new Set<string>()

    // 1. 先加载预生成的绘本
    try {
      const response = await fetch('/pre-generated/index.json')
      if (response.ok) {
        const index = await response.json()
        for (const item of index) {
          try {
            const bookResponse = await fetch(`/pre-generated/${item.idiom}.json`)
            if (bookResponse.ok) {
              const book = await bookResponse.json()
              if (!seenIds.has(book.idiom)) {
                allBooks.push(book)
                seenIds.add(book.idiom)
              }
            }
          } catch {
            // skip
          }
        }
      }
    } catch {
      // no pre-generated books
    }

    // 2. 再加载 IndexedDB 中用户生成的绘本
    try {
      const userBooks = await getAllPictureBooks()
      for (const book of userBooks) {
        if (!seenIds.has(book.idiom)) {
          allBooks.push(book)
          seenIds.add(book.idiom)
        }
      }
    } catch {
      // skip
    }

    setBooks(allBooks)
    setLoading(false)
  }

  const handleDelete = useCallback(async (id: string) => {
    if (confirm('确定要删除这本绘本吗？')) {
      await deletePictureBook(id)
      setBooks((prev) => prev.filter((b) => b.id !== id))
    }
  }, [])

  const handleBatchGenerate = useCallback((idioms: string[]) => {
    if (isGenerating) {
      console.warn('批量生成已在运行中，忽略重复调用')
      return
    }
    setIsGenerating(true)
    createJobs(idioms)
    // 使用 ref 管理单例 executor
    if (!executorRef.current) {
      executorRef.current = new TaskExecutor()
    }
    executorRef.current.start()
  }, [createJobs, isGenerating])

  return (
    <main className="min-h-screen bg-gradient-to-b from-secondary/30 to-background">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* 上半部分：紧凑选择区 + 任务队列（等高布局） */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2">
            <IdiomSelector compact onBatchGenerate={handleBatchGenerate} />
          </div>
          <div className="lg:col-span-1 flex flex-col">
            <TaskQueue compact={true} className="flex-1" />
          </div>
        </div>

        {/* 下半部分：绘本库 */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-800">📚 我的绘本书架</h2>
            <span className="text-gray-500">{books.length} 本</span>
          </div>

          {/* 加载状态 */}
          {loading && (
            <div className="text-center py-16">
              <div className="text-2xl text-gray-500 animate-pulse">加载中...</div>
            </div>
          )}

          {/* 空状态 */}
          {!loading && books.length === 0 && (
            <div className="text-center py-16 bg-white rounded-card shadow-md">
              <div className="text-6xl mb-4">📖</div>
              <h3 className="text-xl font-semibold text-gray-700 mb-2">
                还没有绘本
              </h3>
              <p className="text-gray-500">选择一个成语开始创作吧！</p>
            </div>
          )}

          {/* 绘本网格 */}
          {!loading && books.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {books.map((book) => (
                <BookCard
                  key={book.id}
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
