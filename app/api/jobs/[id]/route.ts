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
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
