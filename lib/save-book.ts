import { promises as fs } from 'fs'
import path from 'path'
import type { PictureBook } from './types'
import { getBookFullText } from './book-display'
import { sanitizeFilename, validateCategory, assertPathWithinBase } from './path-security'

// S3: 简单的 Promise 互斥锁，防止 updateIndex 并发读写冲突
let indexLock: Promise<void> = Promise.resolve()

function acquireIndexLock(): Promise<() => void> {
  let release!: () => void
  const next = new Promise<void>((resolve) => { release = resolve })
  const prev = indexLock
  indexLock = next
  return prev.then(() => release)
}

/**
 * 保存绘本到文件系统 + 更新 index.json
 * 供 API route 和 worker 共用
 */
export async function saveBook(book: PictureBook): Promise<{ path: string }> {
  const baseDir = path.join(process.cwd(), 'public', 'generated')

  // 安全校验：品类白名单 + 文件名净化 + 路径遍历检查
  const safeCategory = validateCategory(book.category)
  const safeSourceText = sanitizeFilename(book.sourceText)
  const bookDir = path.join(baseDir, safeCategory, safeSourceText)
  assertPathWithinBase(bookDir, baseDir)

  await fs.mkdir(bookDir, { recursive: true })

  await fs.writeFile(
    path.join(bookDir, 'book.json'),
    JSON.stringify(book, null, 2),
    'utf-8'
  )

  await updateIndex(baseDir, book, safeCategory, safeSourceText)

  return { path: `/generated/${safeCategory}/${safeSourceText}` }
}

async function updateIndex(baseDir: string, book: PictureBook, safeCategory: string, safeSourceText: string) {
  const release = await acquireIndexLock()
  try {
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

    if (!index.categories[safeCategory]) {
      const labels: Record<string, string> = { idiom: '成语', poetry: '古诗', 'nursery-rhyme': '儿歌', proverb: '谚语', 'fairy-tale': '童话' }
      const icons: Record<string, string> = { idiom: '🎭', poetry: '📜', 'nursery-rhyme': '🎵', proverb: '💬', 'fairy-tale': '🏰' }
      index.categories[safeCategory] = {
        label: labels[safeCategory] || safeCategory,
        icon: icons[safeCategory] || '',
        count: 0,
        items: [],
      }
    }

    const cat = index.categories[safeCategory]
    const existingIdx = cat.items.findIndex((i: any) => i.id === safeSourceText)
    const entry = {
      id: safeSourceText,
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
  } finally {
    release()
  }
}
