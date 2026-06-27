'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { useTaskStore } from '@/lib/task-store'
import { TaskExecutor } from '@/lib/task-executor'
import { TaskQueue } from '@/components/TaskQueue'

export default function GeneratePage() {
  const router = useRouter()
  const currentIdiom = useAppStore((s) => s.currentIdiom)
  const createJob = useTaskStore((s) => s.createJob)
  const getJobQueue = useTaskStore((s) => s.getJobQueue)
  const executorRef = useRef<TaskExecutor | null>(null)
  const [navigated, setNavigated] = useState(false)

  useEffect(() => {
    if (!currentIdiom) {
      router.push('/')
      return
    }

    if (!executorRef.current) {
      executorRef.current = new TaskExecutor()
    }

    const executor = executorRef.current
    createJob(currentIdiom)

    if (!executor.isExecutorRunning()) {
      executor.start()
    }

    return () => {
      if (executor.isExecutorRunning()) {
        executor.stop()
      }
    }
  }, [currentIdiom, createJob, router])

  const checkCompletion = useCallback(() => {
    if (navigated || !currentIdiom) return

    const jobs = getJobQueue()
    const currentJob = jobs.find((j) => j.idiom === currentIdiom)

    if (currentJob?.status === 'completed') {
      setNavigated(true)
      setTimeout(() => {
        router.push('/library')
      }, 1000)
    }
  }, [currentIdiom, getJobQueue, navigated, router])

  useEffect(() => {
    const interval = setInterval(checkCompletion, 500)
    return () => clearInterval(interval)
  }, [checkCompletion])

  if (!currentIdiom) return null

  const jobs = getJobQueue()
  const currentJob = jobs.find((j) => j.idiom === currentIdiom)
  const isCompleted = currentJob?.status === 'completed'
  const isFailed = currentJob?.status === 'failed'

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-primary">⏳ 正在生成绘本</h1>
          <p className="mt-2 text-lg text-gray-600">{currentIdiom}</p>
          {isCompleted && (
            <p className="mt-4 text-green-600 font-medium">
              ✅ 生成完成！正在跳转到绘本库...
            </p>
          )}
          {isFailed && (
            <p className="mt-4 text-red-600">
              ❌ 生成失败，请返回重试
            </p>
          )}
        </div>
        <TaskQueue />
        {isFailed && (
          <div className="text-center">
            <button
              onClick={() => router.push('/')}
              className="button-primary"
            >
              返回首页
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
