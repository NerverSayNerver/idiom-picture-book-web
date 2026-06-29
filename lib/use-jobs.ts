// lib/use-jobs.ts
'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import type { Task } from './task-types'

const authHeaders = { 'X-Internal-Key': process.env.NEXT_PUBLIC_INTERNAL_API_KEY || '' }
const fetcher = (url: string) => fetch(url, { headers: authHeaders }).then(r => r.json())

interface JobsResponse {
  jobs: Task[]
  allTasks: Task[]
}

interface JobDetailResponse {
  job: Task
  children: Task[]
}

function hasActiveTasks(items: Task[]): boolean {
  return items.some(j => ['running', 'pending'].includes(j.status))
}

/**
 * 轮询任务列表（有活跃任务时 2 秒，空闲时 15 秒）
 */
export function useJobs(options?: { status?: string }) {
  const url = options?.status
    ? `/api/jobs?status=${options.status}`
    : '/api/jobs'

  const [active, setActive] = useState(false)
  const { data, error, isLoading, mutate } = useSWR<JobsResponse>(url, fetcher, {
    refreshInterval: active ? 2000 : 15000,
    revalidateOnFocus: true,
  })

  useEffect(() => {
    setActive(hasActiveTasks(data?.jobs ?? []))
  }, [data?.jobs])

  return {
    jobs: data?.jobs ?? [],
    allTasks: data?.allTasks ?? [],
    error,
    isLoading,
    refresh: mutate,
  }
}

/**
 * 获取单个 job 详情（含子任务），有活跃子任务时高频轮询
 */
export function useJobDetail(jobId: string | null) {
  const [active, setActive] = useState(false)
  const { data, error, isLoading } = useSWR<JobDetailResponse>(
    jobId ? `/api/jobs/${jobId}` : null,
    fetcher,
    { refreshInterval: active ? 2000 : 15000 }
  )

  useEffect(() => {
    setActive(hasActiveTasks(data?.children ?? []))
  }, [data?.children])

  return {
    job: data?.job ?? null,
    children: data?.children ?? [],
    error,
    isLoading,
  }
}

/**
 * 创建任务
 */
export async function createJobAPI(sourceText: string, category: string): Promise<{ jobId: string; duplicate?: boolean }> {
  const res = await fetch('/api/jobs', {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceText, category }),
  })
  return res.json()
}

/**
 * 任务控制 API
 */
export async function pauseJobAPI(jobId: string): Promise<void> {
  await fetch(`/api/jobs/${jobId}/pause`, { method: 'POST', headers: authHeaders })
}

export async function resumeJobAPI(jobId: string): Promise<void> {
  await fetch(`/api/jobs/${jobId}/resume`, { method: 'POST', headers: authHeaders })
}

export async function cancelJobAPI(jobId: string): Promise<void> {
  await fetch(`/api/jobs/${jobId}/cancel`, { method: 'POST', headers: authHeaders })
}

export async function retryJobAPI(jobId: string): Promise<void> {
  await fetch(`/api/jobs/${jobId}/retry`, { method: 'POST', headers: authHeaders })
}
