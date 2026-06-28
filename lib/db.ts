import Dexie, { type Table } from 'dexie'
import type { PictureBook, Scene } from './types'
import type { Task } from './task-store'
import type { ContentInfo } from './types'

export class IdiomPictureBookDB extends Dexie {
  pictureBooks!: Table<PictureBook>
  scenes!: Table<{ id?: number } & Omit<Scene, 'id'> & { bookId: string; sceneId: number }>
  tasks!: Table<Task>
  recommendedIdioms!: Table<ContentInfo & { id?: number }>

  constructor() {
    super('idiom-picture-book-db')
    // 当前模式：scenes 使用自增主键，避免不同书的场景 id 冲突
    this.version(4).stores({
      pictureBooks: 'id, idiom, createdAt',
      scenes: '++id, bookId, sceneId, imageHash, [bookId+sceneId]',
      tasks: 'id, parentId, type, status, idiom',
      recommendedIdioms: '++id, idiom',
    })
  }
}

export const db = new IdiomPictureBookDB()

// 自动恢复：旧版本数据库主键变更导致 UpgradeError 时删除并重建
db.open().catch(async () => {
  console.warn('数据库升级失败（主键不兼容），删除旧库后刷新页面...')
  await db.delete()
  window.location.reload()
})

// 保存绘本
export async function savePictureBook(book: PictureBook): Promise<void> {
  await db.pictureBooks.put(book)
}

// 获取绘本
export async function getPictureBook(id: string): Promise<PictureBook | undefined> {
  return db.pictureBooks.get(id)
}

// 获取所有绘本
export async function getAllPictureBooks(): Promise<PictureBook[]> {
  return db.pictureBooks.orderBy('createdAt').reverse().toArray()
}

// 删除绘本
export async function deletePictureBook(id: string): Promise<void> {
  await db.transaction('rw', [db.pictureBooks, db.scenes], async () => {
    await db.pictureBooks.delete(id)
    await db.scenes.where('bookId').equals(id).delete()
  })
}

// 保存场景图像
export async function saveSceneImage(
  bookId: string,
  sceneId: number,
  imageBlob: Blob
): Promise<void> {
  const hash = await computeBlobHash(imageBlob)
  // 先查找是否已有该 (bookId, sceneId) 的行，有则更新（避免重复）
  const existing = await db.scenes.where('[bookId+sceneId]').equals([bookId, sceneId]).first()
  const record = {
    bookId,
    sceneId,
    imageBlob,
    imageHash: hash,
    title: '',
    description: '',
    prompt: '',
    narration: '',
  }
  if (existing) {
    // existing 有 Dexie 自增主键 id
    await db.scenes.put(record, (existing as any).id)
  } else {
    await db.scenes.add(record)
  }
}

// 获取场景图像
export async function getSceneImage(
  bookId: string,
  sceneId: number
): Promise<Blob | undefined> {
  const scene = await db.scenes.where('[bookId+sceneId]').equals([bookId, sceneId]).first()
  return scene?.imageBlob
}

// 计算 Blob 哈希（用于去重）
async function computeBlobHash(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ── 任务持久化 ────────────────────────────────────────────

export async function saveTasks(tasks: Task[]): Promise<void> {
  await db.transaction('rw', db.tasks, async () => {
    await db.tasks.clear()
    if (tasks.length > 0) {
      await db.tasks.bulkAdd(tasks)
    }
  })
}

export async function loadTasks(): Promise<Task[]> {
  return db.tasks.toArray()
}

export async function clearTasks(): Promise<void> {
  await db.tasks.clear()
}

// ── 推荐成语 ────────────────────────────────────────────

/** 批量保存推荐成语（去重） */
export async function saveRecommendedIdioms(idioms: ContentInfo[]): Promise<void> {
  await db.transaction('rw', db.recommendedIdioms, async () => {
    const existing = await db.recommendedIdioms.toArray()
    const existingSet = new Set(existing.map(e => e.sourceText))
    const newIdioms = idioms.filter(i => !existingSet.has(i.sourceText))
    if (newIdioms.length > 0) {
      await db.recommendedIdioms.bulkAdd(newIdioms)
    }
  })
}

/** 获取所有推荐成语 */
export async function getAllRecommendedIdioms(): Promise<ContentInfo[]> {
  return db.recommendedIdioms.toArray()
}

/** 随机获取 n 个推荐成语 */
export async function getRandomIdioms(n: number): Promise<ContentInfo[]> {
  const all = await db.recommendedIdioms.toArray()
  if (all.length <= n) return all
  // Fisher-Yates shuffle
  const shuffled = [...all]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, n)
}
