// app/api/jobs/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getJobWithChildren } from '@/lib/task-db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const result = getJobWithChildren(id)
    if (!result) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error('获取任务详情失败:', error)
    return NextResponse.json({ error: '获取任务详情失败，请稍后重试' }, { status: 500 })
  }
}
