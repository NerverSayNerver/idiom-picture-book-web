import Dexie, { type Table } from 'dexie'
import type { PictureBook, Scene } from './types'
import type { Task } from './task-store'

export class IdiomPictureBookDB extends Dexie {
  pictureBooks!: Table<PictureBook>
  scenes!: Table<Scene & { bookId: string }>
  tasks!: Table<Task>

  constructor() {
    super('idiom-picture-book-db')
    this.version(1).stores({
      pictureBooks: 'id, idiom, createdAt',
      scenes: 'id, bookId, imageHash',
    })
    this.version(2).stores({
      pictureBooks: 'id, idiom, createdAt',
      scenes: 'id, bookId, imageHash',
      tasks: 'id, parentId, type, status, idiom',
    })
  }
}

export const db = new IdiomPictureBookDB()

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
  await db.scenes.put({
    id: sceneId,
    bookId,
    imageBlob,
    imageHash: hash,
    title: '',
    description: '',
    prompt: '',
    narration: '',
  })
}

// 获取场景图像
export async function getSceneImage(
  bookId: string,
  sceneId: number
): Promise<Blob | undefined> {
  const scene = await db.scenes.where({ bookId, id: sceneId }).first()
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
  await db.tasks.bulkPut(tasks)
}

export async function loadTasks(): Promise<Task[]> {
  return db.tasks.toArray()
}

export async function clearTasks(): Promise<void> {
  await db.tasks.clear()
}
