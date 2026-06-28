import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import type { PictureBook } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const book: PictureBook = await request.json()
    const baseDir = path.join(process.cwd(), 'public', 'generated')
    const bookDir = path.join(baseDir, book.category, book.sourceText)

    // 创建目录
    await fs.mkdir(bookDir, { recursive: true })

    // 保存 book.json
    await fs.writeFile(
      path.join(bookDir, 'book.json'),
      JSON.stringify(book, null, 2),
      'utf-8'
    )

    // 更新 index.json
    await updateIndex(baseDir, book)

    return NextResponse.json({
      success: true,
      path: `/generated/${book.category}/${book.sourceText}`,
    })
  } catch (error) {
    console.error('保存绘本失败:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}

async function updateIndex(baseDir: string, book: PictureBook) {
  const indexPath = path.join(baseDir, 'index.json')
  let index: any = {
    version: 2,
    generatedAt: new Date().toISOString(),
    categories: {},
  }

  try {
    const existing = await fs.readFile(indexPath, 'utf-8')
    index = JSON.parse(existing)
  } catch {
    // 文件不存在，使用默认
  }

  if (!index.categories[book.category]) {
    index.categories[book.category] = {
      label: book.category,
      icon: '',
      count: 0,
      items: [],
    }
  }

  const cat = index.categories[book.category]
  const existingIdx = cat.items.findIndex((i: any) => i.id === book.sourceText)
  const entry = {
    id: book.sourceText,
    title: book.title,
    meaning: book.meaning,
    sceneCount: book.scenes.length,
    author: book.author,
    dynasty: book.dynasty,
  }

  if (existingIdx >= 0) {
    cat.items[existingIdx] = entry
  } else {
    cat.items.push(entry)
  }
  cat.count = cat.items.length

  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8')
}
