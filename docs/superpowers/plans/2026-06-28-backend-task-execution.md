# Backend Task Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move task execution from browser to server-side Worker process with SQLite persistence, eliminating task loss on page refresh.

**Architecture:** Independent `worker.ts` process polls SQLite for pending jobs and executes the decompose→generate→save pipeline. Frontend communicates via API routes and polls for status updates. Task state persists in SQLite (replaces IndexedDB).

**Tech Stack:** better-sqlite3, Next.js API Routes, tsx (for worker), SWR (for polling)

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `lib/save-book.ts` | **Create** | Extract save logic from API route into reusable function |
| `lib/task-db.ts` | **Create** | SQLite CRUD for tasks (replaces IndexedDB) |
| `lib/task-types.ts` | **Create** | Shared task type definitions (extracted from task-store.ts) |
| `lib/use-jobs.ts` | **Create** | Frontend hook: polls `/api/jobs` for status |
| `worker.ts` | **Create** | Standalone Worker process |
| `app/api/jobs/route.ts` | **Create** | POST create + GET list |
| `app/api/jobs/[id]/route.ts` | **Create** | GET detail |
| `app/api/jobs/[id]/pause/route.ts` | **Create** | POST pause |
| `app/api/jobs/[id]/resume/route.ts` | **Create** | POST resume |
| `app/api/jobs/[id]/cancel/route.ts` | **Create** | POST cancel |
| `app/api/jobs/[id]/retry/route.ts` | **Create** | POST retry |
| `app/api/save-book/route.ts` | **Modify** | Use extracted `saveBook()` from `lib/save-book.ts` |
| `components/TaskQueue.tsx` | **Modify** | Zustand → `useJobs()` hook |
| `components/TaskCard.tsx` | **Modify** | Zustand → API calls |
| `components/ContentSelector.tsx` | **Modify** | `createJob()` → `POST /api/jobs` |
| `app/page.tsx` | **Modify** | Remove TaskExecutor, use API polling |
| `app/generate/page.tsx` | **Modify** | Remove TaskExecutor, use API polling |
| `lib/task-store.ts` | **Delete** | Replaced by API + SQLite |
| `lib/task-executor.ts` | **Delete** | Replaced by worker.ts |
| `lib/db.ts` | **Modify** | Remove task-related functions |
| `package.json` | **Modify** | Add worker script, dependencies |

---

## Task 1: Install Dependencies + Extract Save Logic

**Files:**
- Create: `lib/save-book.ts`
- Modify: `app/api/save-book/route.ts`

- [ ] **Step 1: Install better-sqlite3**

```bash
npm install better-sqlite3
npm install -D @types/better-sqlite3
```

- [ ] **Step 2: Create `lib/save-book.ts`**

Extract the save logic from the API route into a reusable function that both the API route and worker can call:

```typescript
// lib/save-book.ts
import { promises as fs } from 'fs'
import path from 'path'
import type { PictureBook } from './types'

/**
 * 保存绘本到文件系统 + 更新 index.json
 * 供 API route 和 worker 共用
 */
export async function saveBook(book: PictureBook): Promise<{ path: string }> {
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
```

- [ ] **Step 3: Simplify `app/api/save-book/route.ts`**

```typescript
// app/api/save-book/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { saveBook } from '@/lib/save-book'
import type { PictureBook } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const book: PictureBook = await request.json()
    const result = await saveBook(book)
    return NextResponse.json({ success: true, path: result.path })
  } catch (error) {
    console.error('保存绘本失败:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
```

- [ ] **Step 4: Verify existing save-book still works**

Run: `npm run build` (or `npx next build`)
Expected: Build succeeds, no errors

- [ ] **Step 5: Commit**

```bash
git add lib/save-book.ts app/api/save-book/route.ts package.json package-lock.json
git commit -m "refactor: extract saveBook logic to lib/save-book.ts"
```

---

## Task 2: Create Shared Task Types

**Files:**
- Create: `lib/task-types.ts`

Extract task type definitions from `task-store.ts` so they can be shared between the API layer, worker, and frontend without importing the Zustand store.

- [ ] **Step 1: Create `lib/task-types.ts`**

```typescript
// lib/task-types.ts

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type TaskType = 'job' | 'decompose' | 'generate' | 'save'

export interface Task {
  id: string
  type: TaskType
  parentId: string | null
  status: TaskStatus
  category?: string
  sourceText?: string
  idiom?: string
  sceneId?: number
  sceneTitle?: string
  imageUrl?: string
  progress: number
  total: number
  error?: string
  startTime?: number
  endTime?: number
  retryCount: number
  maxRetries: number
  childTaskIds: string[]
  decomposeMeaning?: string
  decomposeCharacterDescription?: string
  decomposeStyleDescription?: string
  decomposeScenesJson?: string
  createdAt?: number
  updatedAt?: number
}

export interface ChildTaskDef {
  type: TaskType
  sceneId?: number
  sceneTitle?: string
  total?: number
  maxRetries?: number
}

/**
 * 根据子任务状态推导 job 状态
 */
export function deriveJobStatus(childTasks: Task[]): TaskStatus {
  if (childTasks.length === 0) return 'pending'

  const statuses = new Set(childTasks.map(t => t.status))

  if (childTasks.every(t => t.status === 'completed')) return 'completed'
  if (statuses.has('running')) return 'running'
  if (statuses.has('failed')) return 'failed'
  if (statuses.has('paused')) return 'paused'
  if (statuses.has('cancelled')) return 'cancelled'
  return 'pending'
}
```

- [ ] **Step 2: Update `lib/task-store.ts` to import from `task-types.ts`**

Replace the type definitions and `deriveJobStatus` in `task-store.ts` with imports:

```typescript
// At the top of lib/task-store.ts, add:
import { type Task, type TaskStatus, type TaskType, type ChildTaskDef, deriveJobStatus } from './task-types'

// Remove the following from task-store.ts:
// - type TaskStatus = ...
// - type TaskType = ...
// - interface Task { ... }
// - interface ChildTaskDef { ... }
// - function deriveJobStatus(...) { ... }
```

Re-export from task-store for backward compatibility:

```typescript
export type { Task, TaskStatus, TaskType, ChildTaskDef } from './task-types'
export { deriveJobStatus } from './task-types'
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add lib/task-types.ts lib/task-store.ts
git commit -m "refactor: extract task types to lib/task-types.ts"
```

---

## Task 3: Create SQLite Task Database

**Files:**
- Create: `lib/task-db.ts`

- [ ] **Step 1: Create `lib/task-db.ts`**

```typescript
// lib/task-db.ts
import Database from 'better-sqlite3'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import type { Task, TaskStatus, TaskType, ChildTaskDef } from './task-types'
import { deriveJobStatus } from './task-types'

const DB_PATH = path.join(process.cwd(), 'picture-book-tasks.db')

let _db: Database.Database | null = null

function getDb(): Database.Database {
  if (!_db) {
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
  const now = Math.floor(Date.now() / 1000)

  const stmt = db.prepare(`
    INSERT INTO tasks (id, type, parent_id, status, category, source_text, idiom, scene_id, scene_title, progress, total, retry_count, max_retries, created_at, updated_at)
    VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?)
  `)

  stmt.run(
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
  const now = Math.floor(Date.now() / 1000)

  // Build SET clause dynamically
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

  const now = Math.floor(Date.now() / 1000)
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
  const row = db.prepare(
    "SELECT * FROM tasks WHERE type = 'job' AND status = 'pending' ORDER BY created_at LIMIT 1"
  ).get() as TaskRow | undefined
  if (!row) return null
  return rowToTask(row)
}

export function markRunning(id: string): void {
  const now = Math.floor(Date.now() / 1000)
  getDb().prepare(
    "UPDATE tasks SET status = 'running', start_time = ?, updated_at = ? WHERE id = ?"
  ).run(now, now, id)
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

export function getJobWithChildren(id: string): { job: Task; children: Task[] } | null {
  const job = getTask(id)
  if (!job) return null
  const children = getChildTasks(id)
  return { job, children }
}

// ── Startup recovery ────────────────────────────────────────

export function recoverInterruptedTasks(): number {
  const db = getDb()
  const now = Math.floor(Date.now() / 1000)
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit lib/task-db.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/task-db.ts
git commit -m "feat: SQLite task database (better-sqlite3)"
```

---

## Task 4: Create API Routes

**Files:**
- Create: `app/api/jobs/route.ts`
- Create: `app/api/jobs/[id]/route.ts`
- Create: `app/api/jobs/[id]/pause/route.ts`
- Create: `app/api/jobs/[id]/resume/route.ts`
- Create: `app/api/jobs/[id]/cancel/route.ts`
- Create: `app/api/jobs/[id]/retry/route.ts`

- [ ] **Step 1: Create `app/api/jobs/route.ts`**

```typescript
// app/api/jobs/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createTask, listJobs } from '@/lib/task-db'
import type { TaskStatus } from '@/lib/task-types'

// POST /api/jobs — 创建任务
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sourceText, category } = body as { sourceText: string; category?: string }

    if (!sourceText || typeof sourceText !== 'string') {
      return NextResponse.json({ error: 'sourceText is required' }, { status: 400 })
    }

    // 去重检查
    const existing = listJobs()
    const duplicate = existing.find(
      j => j.sourceText === sourceText && ['pending', 'running', 'paused'].includes(j.status)
    )
    if (duplicate) {
      return NextResponse.json({ jobId: duplicate.id, duplicate: true })
    }

    const job = createTask({
      type: 'job',
      sourceText,
      idiom: sourceText,
      category: category || 'idiom',
    })

    return NextResponse.json({ success: true, jobId: job.id })
  } catch (error) {
    console.error('创建任务失败:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// GET /api/jobs — 列出任务
export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get('status') as TaskStatus | null
    const jobs = listJobs(status ? { status } : undefined)
    return NextResponse.json({ jobs })
  } catch (error) {
    console.error('查询任务失败:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create `app/api/jobs/[id]/route.ts`**

```typescript
// app/api/jobs/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getJobWithChildren } from '@/lib/task-db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const result = getJobWithChildren(id)
    if (!result) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
```

- [ ] **Step 3: Create pause/resume/cancel/retry routes**

`app/api/jobs/[id]/pause/route.ts`:
```typescript
// app/api/jobs/[id]/pause/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getTask, updateTask, getChildTasks } from '@/lib/task-db'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const job = getTask(id)
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    if (job.type === 'job') {
      const children = getChildTasks(id)
      const runningChild = children.find(c => c.status === 'running')
      if (runningChild) updateTask(runningChild.id, { status: 'paused' })
    } else if (job.status === 'running') {
      updateTask(id, { status: 'paused' })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
```

`app/api/jobs/[id]/resume/route.ts`:
```typescript
// app/api/jobs/[id]/resume/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getTask, updateTask, getChildTasks } from '@/lib/task-db'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const job = getTask(id)
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    if (job.type === 'job') {
      const children = getChildTasks(id)
      const pausedChild = children.find(c => c.status === 'paused')
      if (pausedChild) updateTask(pausedChild.id, { status: 'running' })
    } else if (job.status === 'paused') {
      updateTask(id, { status: 'running' })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
```

`app/api/jobs/[id]/cancel/route.ts`:
```typescript
// app/api/jobs/[id]/cancel/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getTask, updateTask, getChildTasks } from '@/lib/task-db'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const job = getTask(id)
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    if (job.type === 'job') {
      const children = getChildTasks(id)
      children.forEach(child => {
        if (['pending', 'running', 'paused'].includes(child.status)) {
          updateTask(child.id, { status: 'cancelled' })
        }
      })
    }
    if (['pending', 'running', 'paused'].includes(job.status)) {
      updateTask(id, { status: 'cancelled' })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
```

`app/api/jobs/[id]/retry/route.ts`:
```typescript
// app/api/jobs/[id]/retry/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getTask, updateTask } from '@/lib/task-db'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const task = getTask(id)
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    if (task.status === 'failed' && task.retryCount < task.maxRetries) {
      updateTask(id, {
        status: 'pending',
        retryCount: task.retryCount + 1,
        error: undefined,
        progress: 0,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add app/api/jobs/
git commit -m "feat: job API routes (create, list, detail, pause, resume, cancel, retry)"
```

---

## Task 5: Create Worker Process

**Files:**
- Create: `worker.ts`

- [ ] **Step 1: Create `worker.ts`**

```typescript
// worker.ts
import { pollPendingJob, markRunning, updateTask, getTask, getChildTasks, addChildTasks, recoverInterruptedTasks, closeDb } from './lib/task-db'
import { decomposeSource } from './app/actions/decompose'
import { generateSceneImage, downloadImageAsBase64 } from './app/actions/generate'
import { saveBook } from './lib/save-book'
import type { Task, ChildTaskDef } from './lib/task-types'
import type { ContentCategory, SceneTemplate } from './lib/types'

// ── Helpers ─────────────────────────────────────────────────

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(resolve, ms)
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      })
    }
  })

function base64ToBlob(base64: string): Blob {
  const [header, data] = base64.split(',')
  const mimeMatch = header.match(/:(.*?);/)
  const mime = mimeMatch?.[1] ?? 'image/png'
  const binary = atob(data)
  const array = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i)
  }
  return new Blob([array], { type: mime })
}

// ── Execution Pipeline ──────────────────────────────────────

async function executeJob(jobId: string, signal: AbortSignal): Promise<void> {
  const job = getTask(jobId)
  if (!job || !job.sourceText) return

  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

  // Step 1: Create decompose child task
  const [decomposeChild] = addChildTasks(jobId, [{ type: 'decompose', sceneTitle: '分析成语含义' }])
  const decomposeId = decomposeChild.id

  // Step 2: Execute decompose
  await executeDecompose(decomposeId, jobId, job.sourceText, job.category as ContentCategory, signal)

  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

  // Step 3: Execute generate + save children sequentially
  const children = getChildTasks(jobId)
  for (const child of children) {
    if (signal.aborted) break
    if (child.status === 'completed') continue

    if (child.type === 'generate') {
      await executeGenerate(child.id, signal)
    } else if (child.type === 'save') {
      await executeSave(child.id, jobId, signal)
    }
  }
}

async function executeDecompose(
  taskId: string,
  jobId: string,
  sourceText: string,
  category: ContentCategory,
  signal: AbortSignal,
): Promise<void> {
  updateTask(taskId, { status: 'running', startTime: Date.now() })

  try {
    const result = await decomposeSource(sourceText, category)

    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

    // Create generate child tasks + save task
    const childDefs: ChildTaskDef[] = result.scenes.map((scene, i) => ({
      type: 'generate' as const,
      sceneId: i + 1,
      sceneTitle: `场景 ${i + 1}：${scene.title}`,
      total: 1,
      maxRetries: 3,
    }))
    childDefs.push({ type: 'save' as const, sceneTitle: '保存绘本', total: 1, maxRetries: 1 })

    addChildTasks(jobId, childDefs)

    updateTask(taskId, {
      status: 'completed',
      progress: 1,
      total: 1,
      endTime: Date.now(),
      decomposeMeaning: result.meaning,
      decomposeCharacterDescription: result.characterDescription,
      decomposeStyleDescription: result.styleDescription,
      decomposeScenesJson: JSON.stringify(result.scenes),
    })
  } catch (error) {
    updateTask(taskId, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      endTime: Date.now(),
    })
    throw error
  }
}

async function executeGenerate(taskId: string, signal: AbortSignal): Promise<void> {
  const task = getTask(taskId)
  if (!task || task.sceneId === undefined) return

  const maxAttempts = 1 + (task.maxRetries ?? 3)

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

    const currentTask = getTask(taskId)
    if (!currentTask) return

    if (attempt > 1) {
      await sleep(1000, signal)
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      updateTask(taskId, { status: 'pending', retryCount: attempt - 1, error: undefined, progress: 0 })
    }

    // Get scene from decompose result
    const job = currentTask.parentId ? getTask(currentTask.parentId) : null
    const decomposeTask = job ? getChildTasks(job.id).find(c => c.type === 'decompose') : null
    if (!decomposeTask?.decomposeScenesJson) {
      updateTask(taskId, { status: 'failed', error: 'No decomposition data found' })
      return
    }

    const scenes: SceneTemplate[] = JSON.parse(decomposeTask.decomposeScenesJson)
    const scene = scenes.find(s => s.id === task.sceneId)
    if (!scene) {
      updateTask(taskId, { status: 'failed', error: `Scene ${task.sceneId} not found` })
      return
    }

    updateTask(taskId, { status: 'running', startTime: Date.now() })

    try {
      const imageUrl = await generateSceneImage(scene.prompt)
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

      updateTask(taskId, {
        status: 'completed',
        progress: 1,
        total: 1,
        imageUrl,
        endTime: Date.now(),
      })
      return
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      if (attempt < maxAttempts) {
        console.log(`图像生成重试 ${attempt}/${maxAttempts - 1}...`)
        continue
      }
      updateTask(taskId, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        endTime: Date.now(),
      })
      return
    }
  }
}

async function executeSave(taskId: string, jobId: string, signal: AbortSignal): Promise<void> {
  updateTask(taskId, { status: 'running', startTime: Date.now() })

  try {
    const job = getTask(jobId)
    const decomposeTask = getChildTasks(jobId).find(c => c.type === 'decompose')
    const generateTasks = getChildTasks(jobId).filter(c => c.type === 'generate')

    if (!job || !decomposeTask) {
      throw new Error('缺少任务数据')
    }

    // Build PictureBook from task data
    const scenes: SceneTemplate[] = decomposeTask.decomposeScenesJson
      ? JSON.parse(decomposeTask.decomposeScenesJson)
      : []

    const book = {
      id: jobId,
      category: (job.category || 'idiom') as ContentCategory,
      sourceText: job.sourceText || '',
      title: job.sourceText || '',
      idiom: job.sourceText || '',
      meaning: decomposeTask.decomposeMeaning || '',
      createdAt: new Date().toISOString(),
      scenes: scenes.map((s, i) => {
        const genTask = generateTasks.find(g => g.sceneId === i + 1)
        return {
          ...s,
          id: i + 1,
          imageUrl: genTask?.imageUrl,
        }
      }),
    }

    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

    await saveBook(book as any)

    updateTask(taskId, {
      status: 'completed',
      progress: 1,
      total: 1,
      endTime: Date.now(),
    })
  } catch (error) {
    updateTask(taskId, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      endTime: Date.now(),
    })
    throw error
  }
}

// ── Main Loop ───────────────────────────────────────────────

async function main() {
  console.log('🔧 Worker 启动...')

  // Recover interrupted tasks from previous run
  const recovered = recoverInterruptedTasks()
  if (recovered > 0) {
    console.log(`♻️ 恢复了 ${recovered} 个中断的任务`)
  }

  const abortController = new AbortController()
  const signal = abortController.signal

  process.on('SIGINT', () => {
    console.log('\n🛑 收到 SIGINT，正在停止...')
    abortController.abort()
  })
  process.on('SIGTERM', () => {
    console.log('\n🛑 收到 SIGTERM，正在停止...')
    abortController.abort()
  })

  console.log('🔄 开始轮询任务队列...')

  while (!signal.aborted) {
    const job = pollPendingJob()
    if (!job) {
      await sleep(500, signal).catch(() => {})
      continue
    }

    console.log(`📋 开始执行: ${job.sourceText} (${job.category})`)
    markRunning(job.id)

    try {
      await executeJob(job.id, signal)
      console.log(`✅ 完成: ${job.sourceText}`)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        updateTask(job.id, { status: 'cancelled', error: '任务已取消', endTime: Date.now() })
      } else {
        updateTask(job.id, {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          endTime: Date.now(),
        })
      }
      console.log(`❌ 失败: ${job.sourceText} - ${error}`)
    }
  }

  closeDb()
  console.log('👋 Worker 已停止')
}

main()
```

- [ ] **Step 2: Add worker script to package.json**

```json
"scripts": {
  "worker": "npx tsx worker.ts"
}
```

- [ ] **Step 3: Verify worker compiles**

Run: `npx tsc --noEmit worker.ts`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add worker.ts package.json
git commit -m "feat: standalone worker process for task execution"
```

---

## Task 6: Create Frontend Hook

**Files:**
- Create: `lib/use-jobs.ts`

- [ ] **Step 1: Create `lib/use-jobs.ts`**

```typescript
// lib/use-jobs.ts
'use client'

import useSWR from 'swr'
import type { Task } from './task-types'

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface JobsResponse {
  jobs: Task[]
}

interface JobDetailResponse {
  job: Task
  children: Task[]
}

/**
 * 轮询任务列表（2 秒间隔）
 */
export function useJobs(options?: { status?: string }) {
  const url = options?.status
    ? `/api/jobs?status=${options.status}`
    : '/api/jobs'

  const { data, error, isLoading, mutate } = useSWR<JobsResponse>(url, fetcher, {
    refreshInterval: 2000,
    revalidateOnFocus: true,
  })

  return {
    jobs: data?.jobs ?? [],
    error,
    isLoading,
    refresh: mutate,
  }
}

/**
 * 获取单个 job 详情（含子任务）
 */
export function useJobDetail(jobId: string | null) {
  const { data, error, isLoading } = useSWR<JobDetailResponse>(
    jobId ? `/api/jobs/${jobId}` : null,
    fetcher,
    { refreshInterval: 2000 }
  )

  return {
    job: data?.job ?? null,
    children: data?.children ?? [],
    error,
    isLoading,
  }
}

/**
 * 创建任务
 */
export async function createJobAPI(sourceText: string, category: string): Promise<{ jobId: string; duplicate?: boolean }> {
  const res = await fetch('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceText, category }),
  })
  return res.json()
}

/**
 * 任务控制 API
 */
export async function pauseJobAPI(jobId: string): Promise<void> {
  await fetch(`/api/jobs/${jobId}/pause`, { method: 'POST' })
}

export async function resumeJobAPI(jobId: string): Promise<void> {
  await fetch(`/api/jobs/${jobId}/resume`, { method: 'POST' })
}

export async function cancelJobAPI(jobId: string): Promise<void> {
  await fetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' })
}

export async function retryJobAPI(jobId: string): Promise<void> {
  await fetch(`/api/jobs/${jobId}/retry`, { method: 'POST' })
}
```

- [ ] **Step 2: Install SWR**

```bash
npm install swr
```

- [ ] **Step 3: Commit**

```bash
git add lib/use-jobs.ts package.json package-lock.json
git commit -m "feat: useJobs hook for polling task status via API"
```

---

## Task 7: Migrate TaskQueue Component

**Files:**
- Modify: `components/TaskQueue.tsx`

- [ ] **Step 1: Rewrite `components/TaskQueue.tsx`**

Replace Zustand imports with `useJobs` hook. The component logic stays the same, only the data source changes.

Key changes:
- `const { tasks } = useTaskStore()` → `const { jobs } = useJobs()`
- `pauseAll`, `resumeAll`, `cancelAll`, `clearCompleted` → API calls
- Remove `useMemo(() => tasks.filter(...), [tasks])` since `useJobs` already returns jobs

```typescript
// components/TaskQueue.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useJobs, pauseJobAPI, resumeJobAPI, cancelJobAPI } from '@/lib/use-jobs'
import type { Task, TaskStatus } from '@/lib/task-types'
import { TaskCard } from './TaskCard'

interface TaskQueueProps {
  compact?: boolean
  className?: string
}

type FilterMode = 'all' | 'pending' | 'running' | 'paused' | 'completed' | 'failed'

export function TaskQueue({ compact = false, className = '' }: TaskQueueProps) {
  const { jobs } = useJobs()
  const [filter, setFilter] = useState<FilterMode>('all')
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set())
  const [notify, setNotify] = useState<string | null>(null)

  // ── 完成通知 ──
  const [hadActiveJobs, setHadActiveJobs] = useState(false)

  useEffect(() => {
    const activeJobs = jobs.filter(j => ['pending', 'running', 'paused'].includes(j.status))
    if (activeJobs.length > 0) {
      setHadActiveJobs(true)
    } else if (hadActiveJobs && jobs.length > 0) {
      const completed = jobs.filter(j => j.status === 'completed').length
      const failed = jobs.filter(j => j.status === 'failed').length
      if (completed > 0 || failed > 0) {
        const msg = completed > 0 && failed === 0
          ? `✅ 全部完成！成功生成 ${completed} 个绘本`
          : failed > 0 && completed === 0
          ? `❌ 全部失败，共 ${failed} 个任务失败`
          : `✅ ${completed} 个成功，❌ ${failed} 个失败`
        setNotify(msg)
        setTimeout(() => setNotify(null), 4000)
      }
      setHadActiveJobs(false)
    }
  }, [jobs, hadActiveJobs])

  const toggleExpand = useCallback((jobId: string) => {
    setExpandedJobs(prev => {
      const next = new Set(prev)
      next.has(jobId) ? next.delete(jobId) : next.add(jobId)
      return next
    })
  }, [])

  // ── 统计数据 ──
  const stats = {
    pending: jobs.filter(j => j.status === 'pending').length,
    running: jobs.filter(j => j.status === 'running').length,
    paused: jobs.filter(j => j.status === 'paused').length,
    completed: jobs.filter(j => j.status === 'completed').length,
    failed: jobs.filter(j => j.status === 'failed').length,
    cancelled: jobs.filter(j => j.status === 'cancelled').length,
  }

  // ── 筛选逻辑 ──
  const filteredJobs = filter === 'all' ? jobs : jobs.filter(j => {
    switch (filter) {
      case 'pending': return j.status === 'pending'
      case 'running': return j.status === 'running' || j.status === 'paused'
      case 'paused': return j.status === 'paused'
      case 'completed': return j.status === 'completed' || j.status === 'cancelled'
      case 'failed': return j.status === 'failed'
      default: return true
    }
  })

  const runningJobs = filteredJobs.filter(j => j.status === 'running')
  const pausedJobs = filteredJobs.filter(j => j.status === 'paused')
  const pendingJobs = filteredJobs.filter(j => j.status === 'pending')
  const failedJobs = filteredJobs.filter(j => j.status === 'failed')
  const completedJobs = filteredJobs.filter(j => j.status === 'completed' || j.status === 'cancelled')

  const hasActive = stats.pending > 0 || stats.running > 0 || stats.paused > 0
  const hasCompleted = stats.completed > 0 || stats.cancelled > 0 || stats.failed > 0

  const toggleFilter = useCallback((mode: FilterMode) => {
    setFilter(prev => prev === mode ? 'all' : mode)
  }, [])

  // ── 全局控制 ──
  const handlePauseAll = useCallback(async () => {
    for (const j of jobs.filter(j => j.status === 'running')) {
      await pauseJobAPI(j.id)
    }
  }, [jobs])

  const handleResumeAll = useCallback(async () => {
    for (const j of jobs.filter(j => j.status === 'paused')) {
      await resumeJobAPI(j.id)
    }
  }, [jobs])

  const handleCancelAll = useCallback(async () => {
    for (const j of jobs.filter(j => ['pending', 'running', 'paused'].includes(j.status))) {
      await cancelJobAPI(j.id)
    }
  }, [jobs])

  // ── 分组 ──
  const orderedGroups: { label: string; color: string; jobs: Task[] }[] = [
    { label: '执行中', color: 'bg-blue-500 animate-pulse', jobs: runningJobs },
    { label: '已暂停', color: 'bg-orange-500', jobs: pausedJobs },
    { label: '等待中', color: 'bg-yellow-500', jobs: pendingJobs },
    { label: '失败', color: 'bg-red-500', jobs: failedJobs },
    { label: '已完成', color: 'bg-green-500', jobs: completedJobs },
  ]

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const toggleGroupCollapse = useCallback((label: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      next.has(label) ? next.delete(label) : next.add(label)
      return next
    })
  }, [])

  const statItems = [
    { label: '等待', mode: 'pending' as FilterMode, count: stats.pending, activeClass: 'text-yellow-500 ring-2 ring-yellow-300', defaultClass: 'text-yellow-500' },
    { label: '执行中', mode: 'running' as FilterMode, count: stats.running + stats.paused, activeClass: 'text-blue-500 ring-2 ring-blue-300', defaultClass: 'text-blue-500' },
    { label: '完成', mode: 'completed' as FilterMode, count: stats.completed + stats.cancelled, activeClass: 'text-green-500 ring-2 ring-green-300', defaultClass: 'text-green-500' },
    { label: '失败', mode: 'failed' as FilterMode, count: stats.failed, activeClass: 'text-red-500 ring-2 ring-red-300', defaultClass: 'text-red-500' },
    { label: '总计', mode: 'all' as FilterMode, count: jobs.length, activeClass: 'text-gray-700 ring-2 ring-gray-300', defaultClass: 'text-gray-700' },
  ]

  return (
    <div className={`bg-white rounded-lg shadow-md overflow-hidden relative flex flex-col ${className}`}>
      {notify && (
        <div className="absolute top-0 left-0 right-0 z-10 px-4 py-3 bg-green-50 border-b border-green-200 text-green-800 text-sm font-medium animate-slideDown">
          {notify}
        </div>
      )}

      <div className={`bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3 flex items-center justify-between ${notify ? 'pt-12' : ''}`}>
        <div>
          <h2 className="text-lg font-bold text-white">📋 任务队列</h2>
          <p className="text-white/70 text-xs mt-0.5">
            {jobs.length} 个任务 | {stats.completed} 完成 | {stats.failed} 失败
          </p>
        </div>
        {hasActive && (
          <div className="flex gap-2">
            {stats.running > 0 && (
              <button onClick={handlePauseAll} className="px-2 py-1 text-xs bg-white/20 text-white rounded hover:bg-white/30">⏸ 全部暂停</button>
            )}
            {stats.paused > 0 && (
              <button onClick={handleResumeAll} className="px-2 py-1 text-xs bg-white/20 text-white rounded hover:bg-white/30">▶ 全部继续</button>
            )}
            <button onClick={handleCancelAll} className="px-2 py-1 text-xs bg-red-500/80 text-white rounded hover:bg-red-500">✕ 取消全部</button>
          </div>
        )}
      </div>

      {jobs.length > 0 && (
        <div className="grid grid-cols-5 gap-2 p-3 bg-gray-50 border-b border-gray-100 text-center">
          {statItems.map(item => (
            <button
              key={item.label}
              onClick={() => toggleFilter(item.mode)}
              className={`rounded-lg p-1 transition-all cursor-pointer hover:bg-gray-100 ${
                filter === item.mode ? 'bg-white shadow-sm ' + item.activeClass : item.defaultClass
              }`}
            >
              <div className="text-lg font-bold">{item.count}</div>
              <div className="text-xs text-gray-500">{item.label}</div>
            </button>
          ))}
        </div>
      )}

      <div className="p-3 space-y-3 flex-1 overflow-y-auto min-h-0 [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar]:h-0">
        {jobs.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <div className="text-3xl mb-2">📭</div><p>暂无任务</p>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p>当前筛选条件下无匹配任务</p>
          </div>
        ) : (
          orderedGroups.map(group =>
            group.jobs.length > 0 ? (
              <div key={group.label} className="space-y-2">
                <h3
                  className="text-sm font-medium text-gray-500 flex items-center cursor-pointer select-none hover:text-gray-700"
                  onClick={() => toggleGroupCollapse(group.label)}
                >
                  <span className={`w-2 h-2 rounded-full mr-2 ${group.color}`}></span>
                  {group.label} ({group.jobs.length})
                  <span className="ml-1 text-xs text-gray-400">{collapsedGroups.has(group.label) ? '▶' : '▼'}</span>
                </h3>
                {!collapsedGroups.has(group.label) && group.jobs.map(job => (
                  <TaskCard key={job.id} task={job} expanded={expandedJobs.has(job.id)} onToggle={() => toggleExpand(job.id)} />
                ))}
              </div>
            ) : null
          )
        )}
      </div>

      {hasCompleted && (
        <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
          <span className="text-xs text-gray-500">任务状态自动刷新</span>
          {stats.failed > 0 && (
            <span className="text-xs text-orange-500">失败任务可点击展开后重试</span>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/TaskQueue.tsx
git commit -m "refactor: TaskQueue uses useJobs() hook instead of Zustand"
```

---

## Task 8: Migrate TaskCard Component

**Files:**
- Modify: `components/TaskCard.tsx`

- [ ] **Step 1: Rewrite `components/TaskCard.tsx`**

Replace all `useTaskStore()` calls with API calls. The component keeps the same UI, only the data source and action handlers change.

Key changes:
- `useTaskStore()` → removed
- `retryTask(id)` → `retryJobAPI(id)`
- `pauseTask(id)` → `pauseJobAPI(id)`
- `resumeTask(id)` → `resumeJobAPI(id)`
- `cancelTask(id)` → `cancelJobAPI(id)`
- `getChildTasks(id)` → passed as prop or fetched from API
- `getJobProgress(id)` → computed from children prop

The full rewritten component is long. Key changes to apply:

1. Remove `import { useTaskStore } from '@/lib/task-store'`
2. Add `import { retryJobAPI, pauseJobAPI, resumeJobAPI, cancelJobAPI } from '@/lib/use-jobs'`
3. In `ChildTaskRow`: replace `const { retryTask, getTaskById } = useTaskStore()` with API calls
4. In `TaskCard`: replace `const { pauseTask, resumeTask, cancelTask, getChildTasks, getJobProgress } = useTaskStore()` with props + API calls
5. Add `childTasks` and `jobProgress` as props to `TaskCard`

- [ ] **Step 2: Commit**

```bash
git add components/TaskCard.tsx
git commit -m "refactor: TaskCard uses API calls instead of Zustand"
```

---

## Task 9: Migrate Pages

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/generate/page.tsx`
- Modify: `components/ContentSelector.tsx`

- [ ] **Step 1: Migrate `components/ContentSelector.tsx`**

Replace `createJob` from Zustand with `createJobAPI`:

```typescript
// Remove:
import { useTaskStore } from '@/lib/task-store'
const createJob = useTaskStore((s) => s.createJob)

// Add:
import { createJobAPI } from '@/lib/use-jobs'

// In handleStart:
const handleStart = async () => {
  const text = selectedItem || customInput.trim()
  if (!text) return
  if (!strategy.validate(text)) {
    alert(`请输入有效的${strategy.label}`)
    return
  }
  setCurrentCategory(category)
  setCurrentIdiom(text)
  await createJobAPI(text, category)
  setSelectedItem(null)
  setCustomInput('')
}
```

- [ ] **Step 2: Migrate `app/page.tsx`**

Remove TaskExecutor, rely on API polling via useJobs:

```typescript
// Remove:
import { TaskExecutor } from '@/lib/task-executor'
const executorRef = useRef<TaskExecutor | null>(null)

// Remove the useEffect that starts TaskExecutor
// The useJobs() hook in TaskQueue handles polling automatically
```

- [ ] **Step 3: Migrate `app/generate/page.tsx`**

Remove TaskExecutor, use API polling:

```typescript
// Remove:
import { TaskExecutor } from '@/lib/task-executor'
const executorRef = useRef<TaskExecutor | null>(null)

// Replace executor.start() with createJobAPI()
// useJobs() in TaskQueue handles status polling
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx app/generate/page.tsx components/ContentSelector.tsx
git commit -m "refactor: pages use API instead of client-side TaskExecutor"
```

---

## Task 10: Cleanup Old Code

**Files:**
- Delete: `lib/task-store.ts`
- Delete: `lib/task-executor.ts`
- Modify: `lib/db.ts`

- [ ] **Step 1: Delete `lib/task-store.ts`**

```bash
git rm lib/task-store.ts
```

- [ ] **Step 2: Delete `lib/task-executor.ts`**

```bash
git rm lib/task-executor.ts
```

- [ ] **Step 3: Clean up `lib/db.ts`**

Remove task-related functions:

```typescript
// Remove these functions from lib/db.ts:
// - saveTasks
// - loadTasks
// - clearTasks
// - getAllPictureBooks (deprecated)
// - getPictureBook (deprecated)
// - savePictureBook (deprecated)
// - deletePictureBook (deprecated)
// - saveSceneImage (deprecated)
// - getSceneImage (deprecated)
```

Keep only the recommendedItems functions.

- [ ] **Step 4: Remove Dexie dependency (if no longer needed)**

Check if Dexie is used elsewhere. If only used for tasks, remove:

```bash
npm uninstall dexie
```

- [ ] **Step 5: Verify build passes**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "cleanup: remove client-side task-store, task-executor, and IndexedDB task persistence"
```

---

## Task 11: End-to-End Verification

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Start the worker**

In a separate terminal:

```bash
npm run worker
```

- [ ] **Step 3: Create a test task**

Open browser, select a content item, click "开始生成". Verify:
- Job appears in TaskQueue
- Worker picks up the job (check worker terminal output)
- Task progresses through decompose → generate → save
- Task completes successfully

- [ ] **Step 4: Test page refresh recovery**

While a task is running, refresh the browser page. Verify:
- Page reloads without errors
- Task status persists (shows in TaskQueue)
- Worker continues execution (or recovers interrupted task)

- [ ] **Step 5: Test pause/resume/cancel**

Click pause on a running task. Verify:
- Worker pauses execution
- Click resume → worker continues
- Click cancel → task is cancelled

- [ ] **Step 6: Test retry**

Let a task fail (or manually trigger failure). Click retry. Verify:
- Task goes back to pending
- Worker picks it up again

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "chore: end-to-end verification complete"
```
