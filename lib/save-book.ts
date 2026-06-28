import { promises as fs } from 'fs'
import path from 'path'
import type { PictureBook } from './types'
import { getBookFullText } from './book-display'

/**
 * 保存绘本到文件系统 + 更新 index.json
 * 供 API route 和 worker 共用
 */
export async function saveBook(book: PictureBook): Promise<{ path: string }> {
  const baseDir = path.join(process.cwd(), 'public', 'generated')
  const bookDir = path.join(baseDir, book.category, book.sourceText)

  await fs.mkdir(bookDir, { recursive: true })

  await fs.writeFile(
    path.join(bookDir, 'book.json'),
    JSON.stringify(book, null, 2),
    'utf-8'
  )

  await updateIndex(baseDir, book)

  return { path: `/generated/${book.category}/${book.sourceText}` }
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
    const labels: Record<string, string> = { idiom: '成语', poetry: '古诗', 'nursery-rhyme': '儿歌', proverb: '谚语', 'fairy-tale': '童话' }
    const icons: Record<string, string> = { idiom: '🎭', poetry: '📜', 'nursery-rhyme': '🎵', proverb: '💬', 'fairy-tale': '🏰' }
    index.categories[book.category] = {
      label: labels[book.category] || book.category,
      icon: icons[book.category] || '',
      count: 0,
      items: [],
    }
  }

  const cat = index.categories[book.category]
  const existingIdx = cat.items.findIndex((i: any) => i.id === book.sourceText)
  const entry = {
    id: book.sourceText,
    sourceText: book.sourceText,
    title: book.title,
    meaning: book.meaning,
    sceneCount: book.scenes.length,
    author: book.author,
    dynasty: book.dynasty,
    fullText: book.fullText ?? getBookFullText(book),
    createdAt: book.createdAt,
  }

  if (existingIdx >= 0) {
    cat.items[existingIdx] = entry
  } else {
    cat.items.push(entry)
  }
  cat.count = cat.items.length

  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8')
}
