// app/api/jobs/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { getJobWithChildren, getTask, deleteTask } from '@/lib/task-db'
import { sanitizeFilename, validateCategory, assertPathWithinBase } from '@/lib/path-security'

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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const task = getTask(id)
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // 已取消 / 已失败的任务：清理已生成的临时文件
    if (['cancelled', 'failed'].includes(task.status) && task.sourceText && task.category) {
      try {
        const safeCategory = validateCategory(task.category)
        const safeSourceText = sanitizeFilename(task.sourceText)

        const baseDir = path.join(process.cwd(), 'public', 'generated')
        const bookDir = path.join(baseDir, safeCategory, safeSourceText)
        assertPathWithinBase(bookDir, baseDir)

        const exists = await fs.stat(bookDir).then(() => true).catch(() => false)
        if (exists) {
          await fs.rm(bookDir, { recursive: true, force: true })
        }
      } catch (cleanupErr) {
        // 文件清理失败不应阻塞任务删除，记录即可
        console.error('清理任务生成文件失败:', cleanupErr)
      }
    }

    // 从数据库删除任务及其子任务
    deleteTask(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('删除任务失败:', error)
    return NextResponse.json({ error: '删除任务失败，请稍后重试' }, { status: 500 })
  }
}
