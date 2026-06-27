'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { useTaskStore } from '@/lib/task-store'
import { TaskExecutor } from '@/lib/task-executor'
import { TaskQueue } from '@/components/TaskQueue'

export default function GeneratePage() {
  const router = useRouter()
  const { currentIdiom } = useAppStore()
  const { createJob } = useTaskStore()
  const [executor] = useState(() => new TaskExecutor())

  useEffect(() => {
    if (!currentIdiom) {
      router.push('/')
      return
    }
    createJob(currentIdiom)
    executor.start()
  }, [currentIdiom])

  if (!currentIdiom) return null

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-primary">⏳ 正在生成绘本</h1>
          <p className="mt-2 text-lg text-gray-600">{currentIdiom}</p>
        </div>
        <TaskQueue />
      </div>
    </main>
  )
}
