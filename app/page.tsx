'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { IdiomSelector } from '@/components/IdiomSelector'
import { TaskQueue } from '@/components/TaskQueue'
import { useTaskStore } from '@/lib/task-store'
import { TaskExecutor } from '@/lib/task-executor'

export default function Home() {
  const createJobs = useTaskStore((s) => s.createJobs)
  const loadPersistedTasks = useTaskStore((s) => s.loadPersistedTasks)
  const executorRef = useRef<TaskExecutor | null>(null)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    loadPersistedTasks().finally(() => setInitialized(true))
  }, [loadPersistedTasks])

  useEffect(() => {
    if (!executorRef.current) {
      executorRef.current = new TaskExecutor()
    }

    return () => {
      if (executorRef.current?.isExecutorRunning()) {
        executorRef.current.stop()
      }
    }
  }, [])

  const handleBatchGenerate = useCallback((idioms: string[]) => {
    createJobs(idioms)
    if (executorRef.current && !executorRef.current.isExecutorRunning()) {
      executorRef.current.start()
    }
  }, [createJobs])

  if (!initialized) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-secondary/30 to-background">
        <div className="text-xl text-gray-600">加载中...</div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-secondary/30 to-background">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <IdiomSelector onBatchGenerate={handleBatchGenerate} />
          </div>
          <div className="lg:col-span-1">
            <TaskQueue compact={true} />
          </div>
        </div>
      </div>
    </main>
  )
}
