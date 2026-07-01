// app/api/jobs/[id]/reorder/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { reorderTask } from '@/lib/task-db'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await _request.json()
    const { direction } = body

    if (!['up', 'down', 'top'].includes(direction)) {
      return NextResponse.json({ error: 'Invalid direction' }, { status: 400 })
    }

    reorderTask(id, direction as 'up' | 'down' | 'top')
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Reorder failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
