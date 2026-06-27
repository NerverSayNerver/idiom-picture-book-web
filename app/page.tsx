'use client'

import { useState, useEffect } from 'react'
import { IdiomSelector } from '@/components/IdiomSelector'
import { TaskQueue } from '@/components/TaskQueue'
import { useTaskStore } from '@/lib/task-store'
import { TaskExecutor } from '@/lib/task-executor'

export default function Home() {
  const { createJobs, loadPersistedTasks } = useTaskStore()
  const [executor] = useState(() => new TaskExecutor())

  useEffect(() => {
    loadPersistedTasks()
  }, [])

  const handleBatchGenerate = (idioms: string[]) => {
    createJobs(idioms)
    executor.start()
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
