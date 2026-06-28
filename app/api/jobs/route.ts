// app/api/jobs/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createTask, listJobs, getAllTasks } from '@/lib/task-db'
import type { TaskStatus } from '@/lib/task-types'

// POST /api/jobs — 创建任务
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sourceText, category } = body as { sourceText: string; category?: string }

    if (!sourceText || typeof sourceText !== 'string') {
      return NextResponse.json({ error: 'sourceText is required' }, { status: 400 })
    }

    // 去重检查
    const existing = listJobs()
    const duplicate = existing.find(
      j => j.sourceText === sourceText && ['pending', 'running', 'paused'].includes(j.status)
    )
    if (duplicate) {
      return NextResponse.json({ jobId: duplicate.id, duplicate: true })
    }

    const job = createTask({
      type: 'job',
      sourceText,
      idiom: sourceText,
      category: category || 'idiom',
    })

    return NextResponse.json({ success: true, jobId: job.id })
  } catch (error) {
    console.error('创建任务失败:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// GET /api/jobs — 列出任务
export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get('status') as TaskStatus | null
    const jobs = listJobs(status ? { status } : undefined)
    const allTasks = getAllTasks()
    return NextResponse.json({ jobs, allTasks })
  } catch (error) {
    console.error('查询任务失败:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
