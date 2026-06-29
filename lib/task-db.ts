// lib/task-db.ts
// SQLite 任务持久化（替代 IndexedDB），供 API route 和 worker 共用

import Database from 'better-sqlite3'
import path from 'path'
import { existsSync, mkdirSync } from 'fs'
import { v4 as uuidv4 } from 'uuid'
import type { Task, TaskStatus, TaskType, ChildTaskDef } from './task-types'
import { deriveJobStatus } from './task-types'

const DATA_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DATA_DIR, 'picture-book-tasks.db')

let _db: Database.Database | null = null

/** 当前时间戳（秒），统一全表时间单位 */
function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function getDb(): Database.Database {
  if (!_db) {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
    _db = new Database(DB_PATH)
    _db.pragma('journal_mode = WAL')
    _db.pragma('foreign_keys = ON')
    initSchema(_db)
  }
  return _db
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      parent_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      category TEXT DEFAULT 'idiom',
      source_text TEXT,
      idiom TEXT,
      scene_id INTEGER,
      scene_title TEXT,
      image_url TEXT,
      progress INTEGER DEFAULT 0,
      total INTEGER DEFAULT 0,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 3,
      decompose_meaning TEXT,
      decompose_character_description TEXT,
      decompose_style_description TEXT,
      decompose_scenes_json TEXT,
      error TEXT,
      start_time INTEGER,
      end_time INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
  `)
}

// ── Row ↔ Task mapping ──────────────────────────────────────

interface TaskRow {
  id: string
  type: TaskType
  parent_id: string | null
  status: TaskStatus
  category: string | null
  source_text: string | null
  idiom: string | null
  scene_id: number | null
  scene_title: string | null
  image_url: string | null
  progress: number
  total: number
  retry_count: number
  max_retries: number
  decompose_meaning: string | null
  decompose_character_description: string | null
  decompose_style_description: string | null
  decompose_scenes_json: string | null
  error: string | null
  start_time: number | null
  end_time: number | null
  created_at: number
  updated_at: number
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    type: row.type,
    parentId: row.parent_id,
    status: row.status,
    category: row.category ?? undefined,
    sourceText: row.source_text ?? undefined,
    idiom: row.idiom ?? undefined,
    sceneId: row.scene_id ?? undefined,
    sceneTitle: row.scene_title ?? undefined,
    imageUrl: row.image_url ?? undefined,
    progress: row.progress,
    total: row.total,
    retryCount: row.retry_count,
    maxRetries: row.max_retries,
    childTaskIds: [], // 懒加载
    decomposeMeaning: row.decompose_meaning ?? undefined,
    decomposeCharacterDescription: row.decompose_character_description ?? undefined,
    decomposeStyleDescription: row.decompose_style_description ?? undefined,
    decomposeScenesJson: row.decompose_scenes_json ?? undefined,
    error: row.error ?? undefined,
    startTime: row.start_time ?? undefined,
    endTime: row.end_time ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ── CRUD ────────────────────────────────────────────────────

export function createTask(data: {
  type: TaskType
  parentId?: string | null
  category?: string
  sourceText?: string
  idiom?: string
  sceneId?: number
  sceneTitle?: string
  total?: number
  maxRetries?: number
}): Task {
  const db = getDb()
  const id = uuidv4()
  const now = nowSeconds()

  db.prepare(`
    INSERT INTO tasks (id, type, parent_id, status, category, source_text, idiom, scene_id, scene_title, progress, total, retry_count, max_retries, created_at, updated_at)
    VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?)
  `).run(
    id,
    data.type,
    data.parentId ?? null,
    data.category ?? 'idiom',
    data.sourceText ?? null,
    data.idiom ?? null,
    data.sceneId ?? null,
    data.sceneTitle ?? null,
    data.total ?? 1,
    data.maxRetries ?? 3,
    now,
    now,
  )

  return getTask(id)!
}

export function getTask(id: string): Task | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined
  if (!row) return null
  const task = rowToTask(row)
  task.childTaskIds = getChildIds(id)
  return task
}

export function getChildIds(parentId: string): string[] {
  const db = getDb()
  const rows = db.prepare('SELECT id FROM tasks WHERE parent_id = ?').all(parentId) as { id: string }[]
  return rows.map(r => r.id)
}

export function getChildTasks(parentId: string): Task[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM tasks WHERE parent_id = ? ORDER BY created_at').all(parentId) as TaskRow[]
  return rows.map(rowToTask)
}

export function updateTask(id: string, updates: Partial<Task>): void {
  const db = getDb()
  const now = nowSeconds()

  const setClauses: string[] = ['updated_at = ?']
  const values: any[] = [now]

  if (updates.status !== undefined) {
    setClauses.push('status = ?')
    values.push(updates.status)
  }
  if (updates.progress !== undefined) {
    setClauses.push('progress = ?')
    values.push(updates.progress)
  }
  if (updates.total !== undefined) {
    setClauses.push('total = ?')
    values.push(updates.total)
  }
  if (updates.error !== undefined) {
    setClauses.push('error = ?')
    values.push(updates.error)
  }
  if (updates.startTime !== undefined) {
    setClauses.push('start_time = ?')
    values.push(updates.startTime)
  }
  if (updates.endTime !== undefined) {
    setClauses.push('end_time = ?')
    values.push(updates.endTime)
  }
  if (updates.retryCount !== undefined) {
    setClauses.push('retry_count = ?')
    values.push(updates.retryCount)
  }
  if (updates.imageUrl !== undefined) {
    setClauses.push('image_url = ?')
    values.push(updates.imageUrl)
  }
  if (updates.decomposeMeaning !== undefined) {
    setClauses.push('decompose_meaning = ?')
    values.push(updates.decomposeMeaning)
  }
  if (updates.decomposeCharacterDescription !== undefined) {
    setClauses.push('decompose_character_description = ?')
    values.push(updates.decomposeCharacterDescription)
  }
  if (updates.decomposeStyleDescription !== undefined) {
    setClauses.push('decompose_style_description = ?')
    values.push(updates.decomposeStyleDescription)
  }
  if (updates.decomposeScenesJson !== undefined) {
    setClauses.push('decompose_scenes_json = ?')
    values.push(updates.decomposeScenesJson)
  }

  values.push(id)
  db.prepare(`UPDATE tasks SET ${setClauses.join(', ')} WHERE id = ?`).run(...values)

  // Auto-derive parent job status
  const task = getTask(id)
  if (task?.parentId) {
    deriveParentStatus(task.parentId)
  }
}

function deriveParentStatus(parentId: string): void {
  const children = getChildTasks(parentId)
  if (children.length === 0) return
  const derived = deriveJobStatus(children)
  const completedCount = children.filter(c => c.status === 'completed').length

  const now = nowSeconds()
  const updates: string[] = ['status = ?', 'progress = ?', 'updated_at = ?']
  const values: any[] = [derived, completedCount, now]

  if (derived === 'completed' || derived === 'failed') {
    updates.push('end_time = ?')
    values.push(now)
  }

  values.push(parentId)
  getDb().prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values)
}

export function addChildTasks(parentId: string, defs: ChildTaskDef[]): Task[] {
  const children: Task[] = []
  for (const def of defs) {
    const child = createTask({
      type: def.type,
      parentId,
      sceneId: def.sceneId,
      sceneTitle: def.sceneTitle,
      total: def.total,
      maxRetries: def.maxRetries,
    })
    children.push(child)
  }
  return children
}

// ── Queue operations ────────────────────────────────────────

export function pollPendingJob(): Task | null {
  const db = getDb()
  const now = nowSeconds()
  // 原子认领：UPDATE + RETURNING 在单条语句内完成认领和返回，防止多 worker 重复执行
  const row = db.prepare(
    "UPDATE tasks SET status = 'running', start_time = ?, updated_at = ? " +
    "WHERE id = (SELECT id FROM tasks WHERE type = 'job' AND status = 'pending' ORDER BY created_at LIMIT 1) " +
    "RETURNING *"
  ).get(now, now) as TaskRow | undefined
  if (!row) return null
  return rowToTask(row)
}

// ── Query ───────────────────────────────────────────────────

export function listJobs(filter?: { status?: TaskStatus }): Task[] {
  const db = getDb()
  let query = "SELECT * FROM tasks WHERE type = 'job'"
  const params: any[] = []

  if (filter?.status) {
    query += " AND status = ?"
    params.push(filter.status)
  }

  query += " ORDER BY created_at DESC"
  const rows = db.prepare(query).all(...params) as TaskRow[]
  return rows.map(row => {
    const task = rowToTask(row)
    task.childTaskIds = getChildIds(task.id)
    return task
  })
}

/** 获取所有任务（含子任务），供前端渲染完整队列用 */
export function getAllTasks(): Task[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all() as TaskRow[]
  return rows.map(rowToTask)
}

export function getJobWithChildren(id: string): { job: Task; children: Task[] } | null {
  const job = getTask(id)
  if (!job) return null
  const children = getChildTasks(id)
  return { job, children }
}

// ── Startup recovery ────────────────────────────────────────

export function recoverInterruptedTasks(): number {
  const db = getDb()
  const now = nowSeconds()
  const result = db.prepare(
    "UPDATE tasks SET status = 'failed', error = '页面刷新，执行中断', end_time = ?, updated_at = ? WHERE status IN ('running', 'paused')"
  ).run(now, now)
  return result.changes
}

// ── Cleanup ─────────────────────────────────────────────────

export function closeDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}
