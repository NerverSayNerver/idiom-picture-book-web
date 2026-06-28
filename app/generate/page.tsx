'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { useTaskStore } from '@/lib/task-store'
import { TaskExecutor } from '@/lib/task-executor'
import { TaskQueue } from '@/components/TaskQueue'

export default function GeneratePage() {
  const router = useRouter()
  const currentIdiom = useAppStore((s) => s.currentIdiom)
  const { createJob, tasks } = useTaskStore()
  const executorRef = useRef<TaskExecutor | null>(null)
  const jobCreatedRef = useRef(false)
  const [failed, setFailed] = useState(false)

  const handleBack = useCallback(() => {
    // 停止执行器
    executorRef.current?.stop()
    router.push('/')
  }, [router])

  // 初始化执行器并启动任务
  useEffect(() => {
    if (!currentIdiom) {
      router.push('/')
      return
    }

    // 防止重复创建 job（React Strict Mode 会双重调用 effect）
    if (jobCreatedRef.current) return
    jobCreatedRef.current = true

    // 新任务开始，重置失败状态
    setFailed(false)

    const executor = new TaskExecutor()
    executorRef.current = executor
    createJob(currentIdiom)
    executor.start()

    return () => {
      executor.stop()
      executorRef.current = null
      jobCreatedRef.current = false
    }
  }, [currentIdiom, createJob, router])

  // 监听任务完成/失败状态
  useEffect(() => {
    const jobs = tasks.filter((t) => t.type === 'job')
    if (jobs.length === 0) return

    const allCompleted = jobs.every((j) => j.status === 'completed')
    const hasFailed = jobs.some((j) => j.status === 'failed')

    if (allCompleted) {
      // 所有任务完成，自动跳转
      const timer = setTimeout(() => {
        router.push('/library')
      }, 1500)
      return () => clearTimeout(timer)
    }

    if (hasFailed) {
      setFailed(true)
    }
  }, [tasks, router])

  if (!currentIdiom) return null

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-primary">
            {failed ? '⚠️ 生成出现问题' : '⏳ 正在生成绘本'}
          </h1>
          <p className="mt-2 text-lg text-gray-600">{currentIdiom}</p>
        </div>

        <TaskQueue />

        {/* 所有任务完成提示 */}
        {tasks.filter((t) => t.type === 'job').every((j) => j.status === 'completed') && (
          <div className="text-center">
            <p className="text-green-600 font-medium">✅ 生成完成，即将跳转到书架...</p>
          </div>
        )}

        {/* 失败状态：返回按钮 */}
        {failed && (
          <div className="flex justify-center gap-4">
            <button
              onClick={handleBack}
              className="px-6 py-2 bg-gray-100 text-gray-700 rounded-button text-sm hover:bg-gray-200 transition-colors"
            >
              ← 返回首页
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
