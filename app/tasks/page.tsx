'use client'

import Link from 'next/link'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { TaskQueue } from '@/components/TaskQueue'

function TasksContent() {
  const searchParams = useSearchParams()
  const filterParam = searchParams.get('filter')

  return (
    <main className="min-h-screen bg-gradient-to-b from-secondary/30 to-background">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* 页头 */}
        <div className="flex items-center gap-4 mb-6">
          <Link
            href="/"
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            ⬅ 返回首页
          </Link>
          <h1 className="text-2xl font-bold text-gray-800">📋 任务中心</h1>
          {filterParam && (
            <span className="text-sm text-gray-400">（筛选：{
              { pending: '等待中', running: '执行中', completed: '已完成', failed: '失败' }[filterParam] || filterParam
            }）</span>
          )}
        </div>

        {/* 任务队列（全功能模式） */}
        <TaskQueue compact={false} initialFilter={filterParam ?? undefined} />
      </div>
    </main>
  )
}

export default function TasksPage() {
  return (
    <Suspense fallback={<div className="text-center py-16 text-gray-500">加载中...</div>}>
      <TasksContent />
    </Suspense>
  )
}
