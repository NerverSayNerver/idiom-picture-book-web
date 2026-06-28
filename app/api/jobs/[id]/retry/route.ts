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

    if (task.status === 'failed' && task.retryCount < task.maxRetries) {
      updateTask(id, {
        status: 'pending',
        retryCount: task.retryCount + 1,
        error: undefined,
        progress: 0,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
