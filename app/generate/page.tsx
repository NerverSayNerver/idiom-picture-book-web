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
  const currentCategory = useAppStore((s) => s.currentCategory)
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
    createJob(currentIdiom, currentCategory)
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
    const allDone = jobs.every((j) =>
      ['completed', 'failed', 'cancelled'].includes(j.status)
    )
    const completedCount = jobs.filter((j) => j.status === 'completed').length
    const failedCount = jobs.filter((j) => j.status === 'failed').length

    if (allCompleted) {
      // 所有任务完成，自动跳转
      const timer = setTimeout(() => {
        router.push('/library')
      }, 1500)
      return () => clearTimeout(timer)
    }

    if (hasFailed && !allDone) {
      // 有任务失败但还有未完成的，设置失败状态（显示提示）
      setFailed(true)
    }

    if (allDone && hasFailed && completedCount > 0) {
      // 部分完成部分失败：保持 failed 状态但不清除已成功生成的数据
      setFailed(true)
    }

    if (allDone && hasFailed && completedCount === 0) {
      // 全部失败
      setFailed(true)
    }
  }, [tasks, router])

  if (!currentIdiom) return null

  const jobs = tasks.filter((t) => t.type === 'job')
  const allCompleted = jobs.length > 0 && jobs.every((j) => j.status === 'completed')
  const completedCount = jobs.filter((j) => j.status === 'completed').length
  const failedCount = jobs.filter((j) => j.status === 'failed').length

  // 生成状态标题
  let statusTitle = '⏳ 正在生成绘本'
  let statusSubtitle = ''
  if (failed && completedCount > 0) {
    statusTitle = '⚠️ 部分生成完成'
    statusSubtitle = `${completedCount} 个成功，${failedCount} 个失败`
  } else if (failed) {
    statusTitle = '⚠️ 生成出现问题'
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-primary">
            {statusTitle}
          </h1>
          <p className="mt-2 text-lg text-gray-600">{currentIdiom}{statusSubtitle && ` — ${statusSubtitle}`}</p>
        </div>

        <TaskQueue />

        {/* 所有任务完成提示 */}
        {allCompleted && (
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
