// app/api/jobs/[id]/pause/route.ts
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
      const runningChild = children.find(c => c.status === 'running')
      if (runningChild) updateTask(runningChild.id, { status: 'paused' })
    } else if (job.status === 'running') {
      updateTask(id, { status: 'paused' })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('暂停任务失败:', error)
    return NextResponse.json({ error: '暂停任务失败，请稍后重试' }, { status: 500 })
  }
}
