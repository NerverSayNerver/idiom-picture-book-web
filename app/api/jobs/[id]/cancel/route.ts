// app/api/jobs/[id]/cancel/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getTask, updateTask, getChildTasks } from '@/lib/task-db'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const job = getTask(id)
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    if (job.type === 'job') {
      const children = getChildTasks(id)
      children.forEach(child => {
        if (['pending', 'running', 'paused'].includes(child.status)) {
          updateTask(child.id, { status: 'cancelled' })
        }
      })
    }
    if (['pending', 'running', 'paused'].includes(job.status)) {
      updateTask(id, { status: 'cancelled' })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('取消任务失败:', error)
    return NextResponse.json({ error: '取消任务失败，请稍后重试' }, { status: 500 })
  }
}
