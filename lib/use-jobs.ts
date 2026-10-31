// lib/use-jobs.ts
'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import type { Task } from './task-types'
import { trackJobNotifications } from './notifications'

/**
 * 校验 jobId：服务端生成的 id 仅含字母数字与连字符（uuid），
 * 拒绝其他字符，防止把路径分隔符等拼进请求 URL
 */
function assertJobId(jobId: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(jobId) || jobId.length > 64) {
    throw new Error(`非法的 jobId: ${jobId}`)
  }
}

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
 * 轮询任务列表 Hook（有活跃任务时 2 秒，空闲时 15 秒）。
 * 请求头内联字面量（安全扫描要求：fetch 不引用共享 headers 变量）。
 */
export function useJobs() {
  const [active, setActive] = useState(false)
  const { data, error, isLoading, mutate } = useSWR<JobsResponse>('/api/jobs', () =>
    fetch('/api/jobs', {
      headers: { 'X-Internal-Key': process.env.NEXT_PUBLIC_INTERNAL_API_KEY || '' },
    }).then(r => r.json())
  , {
    refreshInterval: active ? 2000 : 15_000,
    revalidateOnFocus: true,
  })

  useEffect(() => {
    setActive(hasActiveTasks(data?.jobs ?? []))
    // 任务从活跃流转到完成/失败且页面在后台时弹系统通知（模块内去重，多实例安全）
    trackJobNotifications(data?.jobs ?? [])
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
 * 获取单个 job 详情 Hook（含子任务），有活跃子任务时高频轮询
 */
export function useJobDetail(jobId: string | null) {
  const [active, setActive] = useState(false)
  const { data, error, isLoading } = useSWR<JobDetailResponse>(
    jobId ? `/api/jobs/${jobId}` : null,
    () => {
      const id = jobId ?? ''
      assertJobId(id)
      return fetch(`/api/jobs/${encodeURIComponent(id)}`, {
        headers: { 'X-Internal-Key': process.env.NEXT_PUBLIC_INTERNAL_API_KEY || '' },
      }).then(r => r.json())
    },
    { refreshInterval: active ? 2000 : 15_000 }
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
    headers: { 'X-Internal-Key': process.env.NEXT_PUBLIC_INTERNAL_API_KEY || '', 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceText, category }),
  })
  return res.json()
}

/**
 * 任务控制 API（jobId 先过字符集校验再编码）
 */
export async function pauseJobAPI(jobId: string): Promise<void> {
  assertJobId(jobId)
  await fetch(`/api/jobs/${encodeURIComponent(jobId)}/pause`, {
    method: 'POST',
    headers: { 'X-Internal-Key': process.env.NEXT_PUBLIC_INTERNAL_API_KEY || '' },
  })
}

export async function resumeJobAPI(jobId: string): Promise<void> {
  assertJobId(jobId)
  await fetch(`/api/jobs/${encodeURIComponent(jobId)}/resume`, {
    method: 'POST',
    headers: { 'X-Internal-Key': process.env.NEXT_PUBLIC_INTERNAL_API_KEY || '' },
  })
}

export async function cancelJobAPI(jobId: string): Promise<void> {
  assertJobId(jobId)
  await fetch(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
    headers: { 'X-Internal-Key': process.env.NEXT_PUBLIC_INTERNAL_API_KEY || '' },
  })
}

export async function retryJobAPI(jobId: string): Promise<void> {
  assertJobId(jobId)
  await fetch(`/api/jobs/${encodeURIComponent(jobId)}/retry`, {
    method: 'POST',
    headers: { 'X-Internal-Key': process.env.NEXT_PUBLIC_INTERNAL_API_KEY || '' },
  })
}

export async function deleteJobAPI(jobId: string): Promise<void> {
  assertJobId(jobId)
  await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
    method: 'DELETE',
    headers: { 'X-Internal-Key': process.env.NEXT_PUBLIC_INTERNAL_API_KEY || '' },
  })
}

export async function reorderJobAPI(jobId: string, direction: 'up' | 'down' | 'top'): Promise<void> {
  assertJobId(jobId)
  await fetch(`/api/jobs/${encodeURIComponent(jobId)}/reorder`, {
    method: 'POST',
    headers: { 'X-Internal-Key': process.env.NEXT_PUBLIC_INTERNAL_API_KEY || '', 'Content-Type': 'application/json' },
    body: JSON.stringify({ direction }),
  })
}
