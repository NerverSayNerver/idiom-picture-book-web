import Dexie, { type Table } from 'dexie'
import type { ContentInfo } from './types'

export class PictureBookDB extends Dexie {
  recommendedItems!: Table<ContentInfo & { id?: number }>

  constructor() {
    super('picture-book-db')
    this.version(6).stores({
      recommendedItems: '++id, category, sourceText',
    })
  }
}

export const db = new PictureBookDB()

// ── 推荐缓存 ──

/** 批量保存推荐条目（按品类覆盖） */
export async function saveRecommendedItems(
  items: ContentInfo[],
  category: string
): Promise<void> {
  await db.transaction('rw', db.recommendedItems, async () => {
    await db.recommendedItems.where('category').equals(category).delete()
    const tagged = items.map(i => ({ ...i, category }))
    if (tagged.length > 0) {
      await db.recommendedItems.bulkAdd(tagged as any)
    }
  })
}

/** 获取某品类所有推荐条目 */
export async function getAllRecommendedItems(category: string): Promise<ContentInfo[]> {
  return db.recommendedItems.where('category').equals(category).toArray()
}

/** 从某品类随机获取 n 个推荐条目 */
export async function getRandomItems(category: string, n: number): Promise<ContentInfo[]> {
  const all = await getAllRecommendedItems(category)
  if (all.length <= n) return all
  const shuffled = [...all]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, n)
}

// ── 向后兼容 ──

/** @deprecated 使用 saveRecommendedItems */
export const saveRecommendedIdioms = (idioms: ContentInfo[]) =>
  saveRecommendedItems(idioms, 'idiom')

/** @deprecated 使用 getAllRecommendedItems */
export const getAllRecommendedIdioms = () => getAllRecommendedItems('idiom')

/** @deprecated 使用 getRandomItems */
export const getRandomIdioms = (n: number) => getRandomItems('idiom', n)
