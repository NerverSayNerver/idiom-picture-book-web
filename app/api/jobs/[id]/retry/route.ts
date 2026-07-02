// app/api/jobs/[id]/retry/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getTask, updateTask } from '@/lib/task-db'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const task = getTask(id)
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    if (task.status !== 'failed' && task.status !== 'cancelled') {
      return NextResponse.json({ error: '只有失败或已取消的任务可重试' }, { status: 400 })
    }
    if (task.retryCount >= task.maxRetries) {
      return NextResponse.json({ error: '已达最大重试次数' }, { status: 400 })
    }

    updateTask(id, {
      status: 'pending',
      retryCount: task.retryCount + 1,
      error: undefined,
      progress: 0,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('重试任务失败:', error)
    return NextResponse.json({ error: '重试失败，请稍后重试' }, { status: 500 })
  }
}
