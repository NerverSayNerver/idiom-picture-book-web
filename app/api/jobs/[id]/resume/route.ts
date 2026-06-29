// app/api/jobs/[id]/resume/route.ts
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
      const pausedChild = children.find(c => c.status === 'paused')
      if (pausedChild) updateTask(pausedChild.id, { status: 'running' })
    } else if (job.status === 'paused') {
      updateTask(id, { status: 'running' })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('恢复任务失败:', error)
    return NextResponse.json({ error: '恢复任务失败，请稍后重试' }, { status: 500 })
  }
}
