'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { useJobs, createJobAPI } from '@/lib/use-jobs'
import { TaskQueue } from '@/components/TaskQueue'

export default function GeneratePage() {
  const router = useRouter()
  const currentIdiom = useAppStore((s) => s.currentIdiom)
  const currentCategory = useAppStore((s) => s.currentCategory)
  const { jobs } = useJobs()
  const [failed, setFailed] = useState(false)
  const [jobCreated, setJobCreated] = useState(false)

  const handleBack = useCallback(() => {
    router.push('/')
  }, [router])

  // 创建任务并通过 API 提交
  useEffect(() => {
    if (!currentIdiom) {
      router.push('/')
      return
    }

    // 防止重复创建
    if (jobCreated) return
    setJobCreated(true)
    setFailed(false)

    createJobAPI(currentIdiom, currentCategory)
  }, [currentIdiom, currentCategory, jobCreated, router])

  // 监听任务完成/失败状态
  useEffect(() => {
    const jobList = jobs.filter((t) => t.type === 'job')
    if (jobList.length === 0) return

    const allCompleted = jobList.every((j) => j.status === 'completed')
    const hasFailed = jobList.some((j) => j.status === 'failed')
    const allDone = jobList.every((j) =>
      ['completed', 'failed', 'cancelled'].includes(j.status)
    )
    const completedCount = jobList.filter((j) => j.status === 'completed').length
    const failedCount = jobList.filter((j) => j.status === 'failed').length

    if (allCompleted) {
      const timer = setTimeout(() => {
        router.push('/library')
      }, 1500)
      return () => clearTimeout(timer)
    }

    if (hasFailed && !allDone) {
      setFailed(true)
    }

    if (allDone && hasFailed) {
      setFailed(true)
    }
  }, [jobs, router])

  if (!currentIdiom) return null

  const jobList = jobs.filter((t) => t.type === 'job')
  const allCompleted = jobList.length > 0 && jobList.every((j) => j.status === 'completed')
  const completedCount = jobList.filter((j) => j.status === 'completed').length
  const failedCount = jobList.filter((j) => j.status === 'failed').length

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

        {allCompleted && (
          <div className="text-center">
            <p className="text-green-600 font-medium">✅ 生成完成，即将跳转到书架...</p>
          </div>
        )}

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
