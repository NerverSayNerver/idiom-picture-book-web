# 任务中心重构 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 首页用轻量统计卡片替换完整任务队列，新建 `/tasks` 任务中心页面，支持查看 prompt 执行详情和优先级排序

**Architecture:** 新增 TaskStatsCards 组件用于首页统计，复用现有 TaskQueue 组件于任务中心页面；数据层扩展 prompt 和 sort_order 字段；Worker 在执行时存储 prompt

**Tech Stack:** Next.js App Router, SQLite (better-sqlite3), SWR, Tailwind CSS

---

### Task 1: 扩展 Task 类型 — 添加 prompt 和 sortOrder 字段

**文件：**
- Modify: `lib/task-types.ts`

- [ ] **Step 1: 给 Task 接口添加 prompt 和 sortOrder 字段**

在 `lib/task-types.ts` 中，找到 `Task` 接口定义，在末尾（`createdAt` 后面）添加：

```typescript
  /** 使用的完整 prompt 文本（LLM 或生图 prompt） */
  prompt?: string
  /** 等待中任务的排序序号（越小越前） */
  sortOrder?: number
```

- [ ] **Step 2: 提交**

```bash
git add lib/task-types.ts
git commit -m "feat(task-types): add prompt and sortOrder fields"
```

---

### Task 2: 数据库 Schema 扩展 — 添加 prompt 和 sort_order 列 + reorderTask

**文件：**
- Modify: `lib/task-db.ts`

- [ ] **Step 1: 初始化 Schema 中添加新列**

在 `initSchema()` 函数的 `CREATE TABLE` 语句中的 `updated_at` 列之后添加：

```sql
      prompt TEXT,
      sort_order INTEGER DEFAULT 0,
```

同时需要处理已有数据库的迁移。在 `initSchema()` 中，`CREATE TABLE IF NOT EXISTS` 之后，追加 ALTER TABLE 迁移：

```typescript
  // 迁移：为已有数据库添加新列（忽略已存在的错误）
  try { db.exec("ALTER TABLE tasks ADD COLUMN prompt TEXT") } catch {}
  try { db.exec("ALTER TABLE tasks ADD COLUMN sort_order INTEGER DEFAULT 0") } catch {}
```

- [ ] **Step 2: 修改 createTask — 自动设置 sort_order**

在 `createTask()` 函数中，当 `data.type === 'job'` 时，设置 `sort_order` 为当前最大 + 1。

修改 INSERT 语句，增加 `sort_order` 列和值。在 SQL 参数中添加 `sort_order`：

```typescript
    const maxOrder = data.type === 'job'
      ? (db.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM tasks WHERE type = 'job' AND status = 'pending'").get() as { next: number }).next
      : 0
```

INSERT 语句改为：

```typescript
    INSERT INTO tasks (id, type, parent_id, status, category, source_text, idiom, scene_id, scene_title, progress, total, retry_count, max_retries, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?, ?)
```

values 数组中在 `maxRetries` 后插入 `maxOrder`：

```typescript
    data.maxRetries ?? 3,
    maxOrder,
```

- [ ] **Step 3: 添加 reorderTask 函数**

在 `updateTask()` 函数之后添加：

```typescript
/**
 * 重新排序等待中的任务
 * direction: 'up' — 与上一个交换 | 'down' — 与下一个交换 | 'top' — 置顶
 */
export function reorderTask(id: string, direction: 'up' | 'down' | 'top'): void {
  const db = getDb()
  const task = getTask(id)
  if (!task || task.type !== 'job' || task.status !== 'pending') {
    throw new Error('Only pending jobs can be reordered')
  }

  if (direction === 'top') {
    const transaction = db.transaction(() => {
      // 当前任务 sort_order 设为 1
      const currentOrder = task.sortOrder ?? 0
      if (currentOrder === 1) return // 已经在顶部

      db.prepare("UPDATE tasks SET sort_order = sort_order + 1 WHERE type = 'job' AND status = 'pending' AND id != ?").run(id)
      db.prepare("UPDATE tasks SET sort_order = 1 WHERE id = ?").run(id)
    })
    transaction()
  } else {
    const compareOp = direction === 'up' ? '<' : '>'
    const orderBy = direction === 'up' ? 'DESC' : 'ASC'

    const transaction = db.transaction(() => {
      // 找到相邻的任务
      const neighbor = db.prepare(`
        SELECT id, sort_order FROM tasks
        WHERE type = 'job' AND status = 'pending' AND sort_order ${compareOp} ?
        ORDER BY sort_order ${orderBy} LIMIT 1
      `).get(task.sortOrder ?? 0) as { id: string; sort_order: number } | undefined

      if (!neighbor) return // 没有相邻任务（已在边界）

      // 交换 sort_order
      db.prepare("UPDATE tasks SET sort_order = ? WHERE id = ?").run(neighbor.sort_order, id)
      db.prepare("UPDATE tasks SET sort_order = ? WHERE id = ?").run(task.sortOrder ?? 0, neighbor.id)
    })
    transaction()
  }
}
```

- [ ] **Step 4: 修改 pollPendingJob — 按 sort_order 排序**

将 ORDER BY 从 `created_at` 改为 `sort_order ASC, created_at ASC`：

```typescript
    "WHERE id = (SELECT id FROM tasks WHERE type = 'job' AND status = 'pending' ORDER BY sort_order ASC, created_at ASC LIMIT 1) " +
```

- [ ] **Step 5: 添加行映射更新**

在 `rowToTask()` 中添加新列的映射：

```typescript
    prompt: row.prompt ?? undefined,
    sortOrder: row.sort_order ?? undefined,
```

- [ ] **Step 6: 提交**

```bash
git add lib/task-db.ts lib/task-types.ts
git commit -m "feat(task-db): add prompt/sort_order columns and reorderTask"
```

---

### Task 3: Worker 存储 Prompt

**文件：**
- Modify: `worker.ts`

- [ ] **Step 1: executeDecompose 中存储 prompt**

在 `executeDecompose()` 函数中，获取 system message 和 user message 并存入 task。找到调用 `decomposeSource()` 之前的代码，我们需要在 `executeDecompose` 的参数中传入 prompt。

修改 `executeDecompose()` 函数签名，增加 `sourceText` 和 `category` 参数（已存在），在函数内部构造 prompt 字符串。

实际上，更简单的方法：在 `executeDecompose` 内部直接读取 prompt 配置。或者，在 `executeJob()` 中构建 prompt 后传入。

最佳方案：在 `executeDecompose()` 中，调用 `decomposeSource()` 之后，获取 system prompt 和 user prompt 并拼接存储。

修改 `executeDecompose()`：

在成功分支的 `updateTask()` 调用中添加 `prompt`：

```typescript
// 在 decomposeSource 之后、updateTask 之前：
const { getSystemPrompt, buildUserPrompt } = require('./lib/prompts')
// 但实际上需要使用 import，文件顶部已 import
```

检查文件顶部的 import，已有 `import { buildEnhancedPrompt } from './lib/prompts'`。只需额外 import：

```typescript
import { buildEnhancedPrompt, getSystemPrompt, buildUserPrompt } from './lib/prompts'
import { getStrategy } from './lib/content-types'
```

然后在 `executeDecompose()` 的成功分支中，获取 prompt 并存储：

```typescript
    // 构造 LLM prompt 用于存储
    const sysPrompt = getSystemPrompt('decompose', category)
    const templateVars = getStrategy(category).getDecomposeVars(sourceText, category === 'poetry' ? undefined : undefined)
    // 注意：buildUserPrompt 需要 templateVars，但我们无法在这里精确获取
    // 简化方案：直接拼接 system + 简要说明
    const storedPrompt = `[System]\n${sysPrompt}\n\n[User]\n${sourceText}`
```

实际上更好：因为 decomposeSource 内部已经调用了 getSystemPrompt 和 buildUserPrompt，我们可以将 decomposeSource 返回的 prompt 信息一并返回。但为了最小改动，可以直接在 decomposeSource 外部重新构造。由于 prompt 模板是确定的，结果和 decomposeSource 内部一致。

更简单的方法：修改 `decomposeSource` 的返回类型，让其返回完整的 prompt 字符串。但这样改动太大。

最简方案：在 `executeJob()` 中，调用 `executeDecompose` 之前，先准备好 prompt 字符串，然后通过参数传入。

修改 `executeJob()` 中调用 `executeDecompose` 的地方：

```typescript
    // Step 1: Create decompose child task
    const [decomposeChild] = addChildTasks(jobId, [{ type: 'decompose', sceneTitle: '分析含义' }])
    const decomposeId = decomposeChild.id

    // Step 2: Execute decompose — 构造 prompt 用于存储
    const sysPrompt = getSystemPrompt('decompose', job.category as ContentCategory)
    const strategy = getStrategy(job.category as ContentCategory)
    const info = job.category === 'poetry'
      ? getContentInfo(job.sourceText, job.category as ContentCategory)
      : undefined
    const templateVars = strategy.getDecomposeVars(job.sourceText, info?.fullText)
    const userPrompt = buildUserPrompt('decompose', job.category as ContentCategory, templateVars)
    const decomposePrompt = `${sysPrompt}\n\n${userPrompt}`

    await executeDecompose(decomposeId, jobId, job.sourceText, job.category as ContentCategory, signal, decomposePrompt)
```

此时需要从 `./lib/prompts` 中 import `getSystemPrompt`、`buildUserPrompt`，从 `./lib/content-types` 中 import `getStrategy`、`getContentInfo`。

更新 `executeDecompose` 函数签名：

```typescript
async function executeDecompose(
  taskId: string,
  jobId: string,
  sourceText: string,
  category: ContentCategory,
  signal: AbortSignal,
  prompt: string,  // 新增
): Promise<void> {
```

在成功分支的 `updateTask` 中添加：

```typescript
    updateTask(taskId, {
      status: 'completed',
      progress: 1,
      total: 1,
      endTime: Date.now(),
      decomposeMeaning: result.meaning,
      decomposeCharacterDescription: result.characterDescription,
      decomposeStyleDescription: result.styleDescription,
      decomposeScenesJson: JSON.stringify(result.scenes),
      prompt,  // 新增
    })
```

- [ ] **Step 2: executeGenerate 中存储 prompt**

在 `executeGenerate()` 中，`buildEnhancedPrompt()` 调用之后，`generateSceneImage` 调用之前，将 enhancedPrompt 存入 task：

找到 `const enhancedPrompt = buildEnhancedPrompt({...})` 这一行，在它之后、try 块内部，将 prompt 存入 task：

```typescript
      // 存储 prompt 用于后续查看
      updateTask(taskId, { prompt: enhancedPrompt })
```

注意：此时 task 可能还是 'pending' 状态（retry 场景），或者已被设为 'running'。`updateTask` 支持部分更新，所以只传 `{ prompt: enhancedPrompt }` 不会影响其他字段。

- [ ] **Step 3: 更新 import 语句**

在文件顶部添加需要的 import：

```typescript
import { buildEnhancedPrompt, getSystemPrompt, buildUserPrompt } from './lib/prompts'
import { getStrategy, getContentInfo } from './lib/content-types'
```

- [ ] **Step 4: 提交**

```bash
git add worker.ts
git commit -m "feat(worker): store prompt in task records during execution"
```

---

### Task 4: 优先级排序 API

**文件：**
- Create: `app/api/jobs/[id]/reorder/route.ts`

- [ ] **Step 1: 创建 reorder API 路由**

创建 `app/api/jobs/[id]/reorder/route.ts`：

```typescript
// app/api/jobs/[id]/reorder/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { reorderTask } from '@/lib/task-db'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await _request.json()
    const { direction } = body

    if (!['up', 'down', 'top'].includes(direction)) {
      return NextResponse.json({ error: 'Invalid direction' }, { status: 400 })
    }

    reorderTask(id, direction as 'up' | 'down' | 'top')
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Reorder failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add app/api/jobs/[id]/reorder/route.ts
git commit -m "feat(api): add reorder endpoint for task priority"
```

---

### Task 5: 前端 API 函数 — reorderJobAPI

**文件：**
- Modify: `lib/use-jobs.ts`

- [ ] **Step 1: 添加 reorderJobAPI 函数**

在文件末尾、`deleteJobAPI` 之后添加：

```typescript
export async function reorderJobAPI(jobId: string, direction: 'up' | 'down' | 'top'): Promise<void> {
  await fetch(`/api/jobs/${jobId}/reorder`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ direction }),
  })
}
```

- [ ] **Step 2: 提交**

```bash
git add lib/use-jobs.ts
git commit -m "feat(use-jobs): add reorderJobAPI"
```

---

### Task 6: TaskCard — 增加 prompt 查看和排序按钮

**文件：**
- Modify: `components/TaskCard.tsx`

- [ ] **Step 1: 导入 reorderJobAPI**

更新 import：

```typescript
import { retryJobAPI, pauseJobAPI, resumeJobAPI, cancelJobAPI, deleteJobAPI, reorderJobAPI } from '@/lib/use-jobs'
```

- [ ] **Step 2: ChildTaskRow 增加 Prompt 查看按钮**

在 ChildTaskRow 组件中，当前已有点击查看图片弹窗和分解结果弹窗的逻辑。增加一个 Prompt 查看弹窗。

在 `ChildTaskRow` 函数中，现有 `showDetail`、`showImageModal`、`showDecomposeModal` 之后添加：

```typescript
  const [showPromptModal, setShowPromptModal] = useState(false)
  const canShowPrompt = task.status === 'completed' && !!task.prompt
```

在 existing 的 click handler 之前，添加 prompt 查看入口。在已完成子任务的右侧区域（在 `elapsed` 和 `showActions` 按钮之间）添加 📊 按钮：

找到子任务行渲染中的操作区域，在 `elapsed` 显示之后添加：

```tsx
        {canShowPrompt && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowPromptModal(true) }}
            className="flex-shrink-0 px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded-md hover:bg-purple-200 transition-colors"
            title="查看 Prompt"
          >
            📊 Prompt
          </button>
        )}
```

注意：需要将按钮放在 `elapsed` 的 `<span>` 之后，`showActions` 按钮之前。找到以下代码位置：

```tsx
        {elapsed && <span className="text-xs text-gray-400 flex-shrink-0">⏱️ {elapsed}</span>}
        {showActions && task.status === 'failed' && task.retryCount < (task.maxRetries ?? 3) && (
```

在这两行之间添加 prompt 按钮。

- [ ] **Step 3: 添加 Prompt 弹窗**

在 ChildTaskRow 的 JSX 末尾、`</div>` 闭合之前，添加 Prompt 弹窗（在 `showDecomposeModal` 弹窗之后）：

```tsx
      {/* Prompt 弹窗 */}
      {showPromptModal && task.prompt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowPromptModal(false)}
        >
          <div
            className="relative w-full max-w-3xl max-h-[85vh] bg-white rounded-xl shadow-2xl overflow-hidden mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">
                📝 {task.type === 'decompose' ? 'LLM 分析 Prompt' : task.type === 'generate' ? '生图 Prompt' : 'Prompt'}
              </h3>
              <button
                onClick={() => setShowPromptModal(false)}
                className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-full text-lg transition-colors"
              >
                ✕
              </button>
            </div>
            {/* 内容区 */}
            <div className="px-6 py-4 overflow-y-auto max-h-[calc(85vh-64px)]">
              <pre className="text-sm text-gray-700 whitespace-pre-wrap break-words bg-gray-50 rounded-lg p-4 border border-gray-100 font-mono">
                {task.prompt}
              </pre>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 4: 父任务操作栏增加排序按钮**

在 TaskCard 主组件的 actions 区域（`<div className="flex items-center justify-end space-x-2 px-4 pb-3">` 内部），在取消按钮之后、查看绘本之前，为 pending 状态添加排序按钮：

找到取消按钮的 JSX：

```tsx
            {['pending', 'running', 'paused'].includes(task.status) && (
              <button
                onClick={() => cancelJobAPI(task.id)}
                className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors"
              >
                ❌ 取消
              </button>
            )}
```

在该代码块之后添加排序按钮：

```tsx
            {task.status === 'pending' && (
              <>
                <button
                  onClick={async (e) => { e.stopPropagation(); await reorderJobAPI(task.id, 'up'); onDelete?.() }}
                  className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors"
                  title="上移"
                >
                  ↑
                </button>
                <button
                  onClick={async (e) => { e.stopPropagation(); await reorderJobAPI(task.id, 'down'); onDelete?.() }}
                  className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors"
                  title="下移"
                >
                  ↓
                </button>
                <button
                  onClick={async (e) => { e.stopPropagation(); await reorderJobAPI(task.id, 'top'); onDelete?.() }}
                  className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors"
                  title="置顶"
                >
                  ⬆
                </button>
              </>
            )}
```

- [ ] **Step 5: 提交**

```bash
git add components/TaskCard.tsx
git commit -m "feat(TaskCard): add prompt viewing and priority reorder buttons"
```

---

### Task 7: TaskStatsCards — 首页统计卡片组件

**文件：**
- Create: `components/TaskStatsCards.tsx`

- [ ] **Step 1: 创建 TaskStatsCards 组件**

```tsx
'use client'

import Link from 'next/link'
import { useJobs } from '@/lib/use-jobs'

export function TaskStatsCards() {
  const { jobs } = useJobs()

  const stats = {
    pending: jobs.filter(j => j.status === 'pending').length,
    running: jobs.filter(j => j.status === 'running').length,
    paused: jobs.filter(j => j.status === 'paused').length,
    completed: jobs.filter(j => j.status === 'completed').length,
    failed: jobs.filter(j => j.status === 'failed').length,
    cancelled: jobs.filter(j => j.status === 'cancelled').length,
  }

  const total = jobs.length

  if (total === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-800">📋 任务队列</h2>
        </div>
        <div className="text-center py-6 text-gray-400">
          <div className="text-3xl mb-2">📭</div>
          <p className="text-sm">暂无任务</p>
        </div>
      </div>
    )
  }

  const cards: { label: string; count: number; color: string; bg: string; filter: string }[] = [
    { label: '等待', count: stats.pending, color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200', filter: 'pending' },
    { label: '执行中', count: stats.running + stats.paused, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', filter: 'running' },
    { label: '已完成', count: stats.completed, color: 'text-green-600', bg: 'bg-green-50 border-green-200', filter: 'completed' },
    { label: '失败', count: stats.failed, color: 'text-red-600', bg: 'bg-red-50 border-red-200', filter: 'failed' },
  ]

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-gray-800">📋 任务队列</h2>
        <Link
          href="/tasks"
          className="text-xs text-blue-500 hover:text-blue-600 transition-colors"
        >
          查看全部 →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {cards.map(card => (
          <Link
            key={card.label}
            href={`/tasks?filter=${card.filter}`}
            className={`${card.bg} border rounded-lg p-3 text-center hover:shadow-sm transition-shadow`}
          >
            <div className={`text-2xl font-bold ${card.color}`}>{card.count}</div>
            <div className="text-xs text-gray-500 mt-0.5">{card.label}</div>
          </Link>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-xs text-gray-500">
        <span>共 {total} 个任务</span>
        {stats.failed > 0 && <span className="text-red-500">{stats.failed} 个失败</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 提交**

```bash
git add components/TaskStatsCards.tsx
git commit -m "feat(TaskStatsCards): add lightweight stats card component for homepage"
```

---

### Task 8: 首页 — 用 TaskStatsCards 替换 TaskQueue

**文件：**
- Modify: `app/page.tsx`

- [ ] **Step 1: 替换 import**

将 `import { TaskQueue } from '@/components/TaskQueue'` 替换为：

```typescript
import { TaskStatsCards } from '@/components/TaskStatsCards'
```

- [ ] **Step 2: 替换 JSX**

找到以下代码：

```tsx
          <div className="lg:col-span-1">
            <TaskQueue compact className="lg:max-h-[calc(100vh-280px)]" />
          </div>
```

替换为：

```tsx
          <div className="lg:col-span-1">
            <TaskStatsCards />
          </div>
```

- [ ] **Step 3: 提交**

```bash
git add app/page.tsx
git commit -m "refactor(page): replace TaskQueue with TaskStatsCards on homepage"
```

---

### Task 9: 任务中心页面 /tasks

**文件：**
- Create: `app/tasks/page.tsx`

- [ ] **Step 1: 创建任务中心页面**

```tsx
'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { TaskQueue } from '@/components/TaskQueue'

export default function TasksPage() {
  const searchParams = useSearchParams()
  const filterParam = searchParams.get('filter')

  // 将 URL 参数映射到 TaskQueue 的 filter 状态
  // TaskQueue 内部使用 FilterMode: 'all' | 'pending' | 'running' | 'paused' | 'completed' | 'failed'

  return (
    <main className="min-h-screen bg-gradient-to-b from-secondary/30 to-background">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* 页头 */}
        <div className="flex items-center gap-4 mb-6">
          <Link
            href="/"
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            ⬅ 返回首页
          </Link>
          <h1 className="text-2xl font-bold text-gray-800">📋 任务中心</h1>
          {filterParam && (
            <span className="text-sm text-gray-400">（已筛选：{filterParam}）</span>
          )}
        </div>

        {/* 任务队列（全功能模式） */}
        <TaskQueue compact={false} initialFilter={filterParam as any} />
      </div>
    </main>
  )
}
```

- [ ] **Step 2: 更新 TaskQueue 组件支持 initialFilter prop**

修改 `components/TaskQueue.tsx` 的接口，增加可选的 `initialFilter` prop：

```typescript
interface TaskQueueProps {
  compact?: boolean
  className?: string
  initialFilter?: FilterMode
}
```

在组件内部，使用 `useState` 时接受初始值：

```typescript
  const [filter, setFilter] = useState<FilterMode>(initialFilter || 'all')
```

当 `initialFilter` 变化时同步更新：

```typescript
  useEffect(() => {
    if (initialFilter) setFilter(initialFilter)
  }, [initialFilter])
```

注意：需要在文件顶部 import `useEffect`（已存在）。

- [ ] **Step 3: 提交**

```bash
git add app/tasks/page.tsx components/TaskQueue.tsx
git commit -m "feat(tasks): add task center page with initial filter support"
```

---

### Task 10: Header 导航 — 添加任务中心入口

**文件：**
- Modify: `components/Header.tsx`

- [ ] **Step 1: 更新 Header 组件**

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function Header() {
  const pathname = usePathname()

  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-primary">
          🎨 绘本工坊
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link
            href="/tasks"
            className={`transition-colors ${
              pathname === '/tasks'
                ? 'text-blue-600 font-medium'
                : 'text-gray-600 hover:text-primary'
            }`}
          >
            📋 任务中心
          </Link>
        </nav>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: 提交**

```bash
git add components/Header.tsx
git commit -m "feat(Header): add task center navigation link"
```

---

### Task 11: 构建验证

- [ ] **Step 1: 运行构建**

```bash
npx next build 2>&1 | tail -20
```

预期结果：无错误，所有路由正确编译（包括新 `/tasks` 页面和新的 API 路由）。

- [ ] **Step 2: 如有错误则修复**

检查构建输出中的错误信息，定位到具体文件和行号进行修复。

- [ ] **Step 3: 提交最终构建修复（如有）**

```bash
git add -A
git commit -m "fix: build fixes"
```
