// lib/use-jobs.ts
'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import type { Task } from './task-types'
import { trackJobNotifications } from './notifications'

/**
 * 接口错误（含 HTTP 状态码）。
 * 关键：fetch 必须检查 res.ok —— 否则 401/500 返回的 JSON 会被当成"成功"解析，
 * jobs 变成 []，SWR 的 error 永远 undefined，UI 就显示"暂无任务"。
 */
export class JobsError extends Error {
  status: number

  constructor(status: number, message?: string) {
    super(message ?? `HTTP ${status}`)
    this.name = 'JobsError'
    this.status = status
  }
}

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

function hasActiveTasks(items: Task[]): boolean {
  return items.some(j => ['running', 'pending'].includes(j.status))
}

/**
 * 轮询任务列表 Hook（有活跃任务时 2 秒，空闲时 15 秒）。
 * 请求头内联字面量（安全扫描要求：fetch 不引用共享 headers 变量）。
 */
export function useJobs() {
  const [active, setActive] = useState(false)
  const { data, error, isLoading, isValidating, mutate } = useSWR<JobsResponse, JobsError>('/api/jobs', async () => {
    const res = await fetch('/api/jobs', {
      headers: { 'X-Internal-Key': process.env.NEXT_PUBLIC_INTERNAL_API_KEY || '' },
    })
    if (!res.ok) throw new JobsError(res.status)
    return (await res.json()) as JobsResponse
  }, {
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
    /** 接口状态码（如 401/500），供 UI 区分"真的没任务"与"请求失败" */
    errorStatus: error instanceof JobsError ? error.status : undefined,
    isLoading,
    isValidating,
    /** 是否已经拿到过一次成功响应（区分加载中与空列表） */
    hasLoaded: data !== undefined,
    refresh: mutate,
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
  if (!res.ok) throw new JobsError(res.status)
  return res.json()
}

/**
 * 任务控制 API（jobId 先过字符集校验再编码）
 * 全部检查 res.ok：失败必须 throw，调用方的 catch 才能生效。
 */
export async function pauseJobAPI(jobId: string): Promise<void> {
  assertJobId(jobId)
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/pause`, {
    method: 'POST',
    headers: { 'X-Internal-Key': process.env.NEXT_PUBLIC_INTERNAL_API_KEY || '' },
  })
  if (!res.ok) throw new JobsError(res.status)
}

export async function resumeJobAPI(jobId: string): Promise<void> {
  assertJobId(jobId)
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/resume`, {
    method: 'POST',
    headers: { 'X-Internal-Key': process.env.NEXT_PUBLIC_INTERNAL_API_KEY || '' },
  })
  if (!res.ok) throw new JobsError(res.status)
}

export async function cancelJobAPI(jobId: string): Promise<void> {
  assertJobId(jobId)
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
    headers: { 'X-Internal-Key': process.env.NEXT_PUBLIC_INTERNAL_API_KEY || '' },
  })
  if (!res.ok) throw new JobsError(res.status)
}

export async function retryJobAPI(jobId: string): Promise<void> {
  assertJobId(jobId)
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/retry`, {
    method: 'POST',
    headers: { 'X-Internal-Key': process.env.NEXT_PUBLIC_INTERNAL_API_KEY || '' },
  })
  if (!res.ok) throw new JobsError(res.status)
}

export async function deleteJobAPI(jobId: string): Promise<void> {
  assertJobId(jobId)
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
    method: 'DELETE',
    headers: { 'X-Internal-Key': process.env.NEXT_PUBLIC_INTERNAL_API_KEY || '' },
  })
  if (!res.ok) throw new JobsError(res.status)
}

export async function reorderJobAPI(jobId: string, direction: 'up' | 'down' | 'top'): Promise<void> {
  assertJobId(jobId)
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/reorder`, {
    method: 'POST',
    headers: { 'X-Internal-Key': process.env.NEXT_PUBLIC_INTERNAL_API_KEY || '', 'Content-Type': 'application/json' },
    body: JSON.stringify({ direction }),
  })
  if (!res.ok) throw new JobsError(res.status)
}
