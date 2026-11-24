import type { PictureBook } from './types'
import { getContentInfo } from './content-info'

/**
 * 卡片级书籍信息子集：BookCard 的 BookCardBook 等宽松来源只需满足此结构。
 * 函数均按结构化类型取值，不要求完整 PictureBook。
 */
interface BookCardSource {
  category: string
  sourceText: string
  author?: string
  dynasty?: string
}

export function getBookAuthor(book: BookCardSource): string | undefined {
  return book.author ?? getContentInfo(book.sourceText, book.category)?.author
}

export function getBookDynasty(book: BookCardSource): string | undefined {
  return book.dynasty ?? getContentInfo(book.sourceText, book.category)?.dynasty
}

/** 古诗作者朝代展示，如「唐 · 李白」 */
export function formatPoetryAttribution(book: BookCardSource): string | undefined {
  const dynasty = getBookDynasty(book)
  const author = getBookAuthor(book)
  if (dynasty && author) return `${dynasty} · ${author}`
  return dynasty || author
}

export function getBookCardAuthor(book: BookCardSource): string | undefined {
  return getBookAuthor(book)
}

export function getBookCardAttribution(book: BookCardSource): string | undefined {
  const author = getBookCardAuthor(book)
  const dynasty = book.dynasty ?? getContentInfo(book.sourceText, book.category)?.dynasty
  const parts = [dynasty, author].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : undefined
}

/** 获取完整原文：古诗全诗 / 儿歌完整歌词 */
export function getBookFullText(book: PictureBook): string | undefined {
  if (book.fullText) return book.fullText
  const info = getContentInfo(book.sourceText, book.category)
  if (info?.fullText) return info.fullText
  if (book.category === 'nursery-rhyme') {
    return buildLyricsFromScenes(book)
  }
  if (book.category === 'poetry') {
    return buildPoemFromSceneTitles(book)
  }
  return undefined
}

function buildLyricsFromScenes(book: PictureBook): string {
  return book.scenes
    .map((s) => s.narration.trim())
    .filter(Boolean)
    .join('\n')
}

/**
 * 从 poetry 场景标题重建全诗。
 * 古诗后处理已保证每个场景 title 均为原诗句，此处直接拼接即可。
 */
function buildPoemFromSceneTitles(book: PictureBook): string | undefined {
  const lines = book.scenes
    .map((s) => s.title.trim())
    .filter((t) => t.length > 0)
  if (lines.length === 0) return undefined
  return lines.join('，') + '。'
}

/** 卡片摘要：古诗显示作者，儿歌显示歌词开头 */
export function getBookCardSubtitle(book: {
  category: string
  sourceText: string
  title: string
  meaning: string
  author?: string
  dynasty?: string
  fullText?: string
  scenes?: Array<{ narration?: string; title?: string }>
}): string {
  if (book.category === 'poetry') {
    const attribution = formatPoetryAttribution(book)
    if (attribution) return attribution
  }
  if (book.category === 'nursery-rhyme') {
    const fullText = getBookFullText(book as PictureBook)
    if (fullText) return fullText.replace(/\n/g, ' ')
  }
  return book.meaning
}
