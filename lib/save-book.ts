import { promises as fs } from 'fs'
import path from 'path'
import type { PictureBook } from './types'
import { getBookFullText } from './book-display'
import { sanitizeFilename, validateCategory, assertPathWithinBase } from './path-security'
import { ensureImageTiers } from './image-tiers-server'

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

  // 防御性校验：scenes 为空说明 decompose 数据缺失或任务被中断，
  // 此时不应写入 book.json 和 index.json，否则会留下"幽灵条目"
  // 导致首页出现点击后 404 的空绘本卡片
  if (!Array.isArray(book.scenes) || book.scenes.length === 0) {
    throw new Error('scenes 不能为空，拒绝保存空绘本')
  }

  await fs.mkdir(bookDir, { recursive: true })

  await fs.writeFile(
    path.join(bookDir, 'book.json'),
    JSON.stringify(book, null, 2),
    'utf-8'
  )

  // 新书自动出派生档位。这是优化不是正确性依赖：失败只记录，绝不阻断保存。
  // 并发/超时/失败吞噬都封装在 ensureImageTiers 内部（单本最多等 8s）。
  try {
    const result = await ensureImageTiers(bookDir)
    if (result.failed > 0 || result.timedOut) {
      console.warn(`[image-tiers] ${safeCategory}/${safeSourceText} 档位生成不完整`, result)
    }
  } catch (err) {
    console.warn('[image-tiers] 档位生成异常，已忽略：', (err as Error)?.message ?? err)
  }

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

    // 每次写入都刷新 generatedAt，标识最近一次生成/更新绘本的时间
    index.generatedAt = new Date().toISOString()

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
