// lib/use-jobs.ts
'use client'

import useSWR from 'swr'
import type { Task } from './task-types'

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface JobsResponse {
  jobs: Task[]
  allTasks: Task[]
}

interface JobDetailResponse {
  job: Task
  children: Task[]
}

/**
 * 轮询任务列表（2 秒间隔）
 */
export function useJobs(options?: { status?: string }) {
  const url = options?.status
    ? `/api/jobs?status=${options.status}`
    : '/api/jobs'

  const { data, error, isLoading, mutate } = useSWR<JobsResponse>(url, fetcher, {
    refreshInterval: 2000,
    revalidateOnFocus: true,
  })

  return {
    jobs: data?.jobs ?? [],
    allTasks: data?.allTasks ?? [],
    error,
    isLoading,
    refresh: mutate,
  }
}

/**
 * 获取单个 job 详情（含子任务）
 */
export function useJobDetail(jobId: string | null) {
  const { data, error, isLoading } = useSWR<JobDetailResponse>(
    jobId ? `/api/jobs/${jobId}` : null,
    fetcher,
    { refreshInterval: 2000 }
  )

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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceText, category }),
  })
  return res.json()
}

/**
 * 任务控制 API
 */
export async function pauseJobAPI(jobId: string): Promise<void> {
  await fetch(`/api/jobs/${jobId}/pause`, { method: 'POST' })
}

export async function resumeJobAPI(jobId: string): Promise<void> {
  await fetch(`/api/jobs/${jobId}/resume`, { method: 'POST' })
}

export async function cancelJobAPI(jobId: string): Promise<void> {
  await fetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' })
}

export async function retryJobAPI(jobId: string): Promise<void> {
  await fetch(`/api/jobs/${jobId}/retry`, { method: 'POST' })
}
