// app/api/books/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { sanitizeFilename, validateCategory, assertPathWithinBase } from '@/lib/path-security'

// DELETE /api/books/:id — 删除绘本（id 格式: category:sourceText）
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // id 格式: category:sourceText
    const separatorIdx = id.indexOf(':')
    if (separatorIdx < 0) {
      return NextResponse.json({ error: 'Invalid book id format' }, { status: 400 })
    }

    const category = id.substring(0, separatorIdx)
    const sourceText = decodeURIComponent(id.substring(separatorIdx + 1))

    const safeCategory = validateCategory(category)
    const safeSourceText = sanitizeFilename(sourceText)

    const baseDir = path.join(process.cwd(), 'public', 'generated')
    const bookDir = path.join(baseDir, safeCategory, safeSourceText)
    assertPathWithinBase(bookDir, baseDir)

    // 删除绘本目录
    await fs.rm(bookDir, { recursive: true, force: true })

    // 从 index.json 移除条目
    const indexPath = path.join(baseDir, 'index.json')
    try {
      const indexRaw = await fs.readFile(indexPath, 'utf-8')
      const index = JSON.parse(indexRaw)
      if (index.categories?.[safeCategory]) {
        const cat = index.categories[safeCategory]
        cat.items = cat.items.filter((i: any) => i.id !== safeSourceText)
        cat.count = cat.items.length
        if (cat.items.length === 0) {
          delete index.categories[safeCategory]
        }
        await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8')
      }
    } catch {
      // index.json 不存在或解析失败，忽略
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('删除绘本失败:', error)
    return NextResponse.json({ error: '删除失败，请稍后重试' }, { status: 500 })
  }
}
