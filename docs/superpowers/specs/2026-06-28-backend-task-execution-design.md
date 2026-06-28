# 后端驱动任务执行 — 架构迁移设计

**日期**：2026-06-28
**分支**：feature/multi-category-expansion
**状态**：已批准

## 问题

当前 `TaskExecutor` 运行在浏览器中（客户端），任务状态存储在 Zustand + IndexedDB。页面刷新后：
1. 所有 Zustand 内存状态丢失
2. `running`/`paused` 任务被强制标记为 `failed`（"页面刷新，执行中断"）
3. 执行器循环停止，需要用户手动重新操作

**根本原因**：执行引擎和任务状态都在客户端，没有服务端持久化。

## 目标

- 任务状态持久化到服务端数据库，页面刷新后可恢复
- 任务执行由服务端 Worker 进程驱动，不依赖浏览器生命周期
- 前端通过 API 查询任务状态，通过 SSE/轮询获取实时更新
- 保持现有功能完整性：暂停/恢复/取消/重试/批量创建

## 方案选择

| 方案 | 描述 | 优点 | 缺点 | 结论 |
|------|------|------|------|------|
| **A: Worker + SQLite** | 独立 Worker 进程 + SQLite 持久化 | 彻底解决刷新问题，无超时限制 | 需额外进程 | **采用** |
| B: Next.js 内置后台 | 在 Next.js 进程内运行后台任务 | 单进程简单 | dev 热重载杀死任务 | 否决 |
| C: 客户端 + 持久化 | 保持客户端执行，加 DB 持久化 | 改动最小 | 浏览器关闭仍丢失 | 否决 |

## 架构

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (React)                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ContentSelector│  │ TaskQueue    │  │  TaskCard            │  │
│  │ POST /api/jobs│  │ GET /api/jobs│  │ POST /api/jobs/:id/* │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         └────────┬────────┴──────────────────────┘              │
│         ┌────────┴────────┐                                     │
│         │  useJobs() hook │  ← 轮询 /api/jobs，替代 Zustand    │
│         └─────────────────┘                                     │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP
┌────────────────────────────┴────────────────────────────────────┐
│  Next.js Server                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  app/api/jobs/                                          │    │
│  │  POST /          → 创建任务                              │    │
│  │  GET  /          → 列出任务                              │    │
│  │  GET  /[id]      → 任务详情                              │    │
│  │  POST /[id]/pause → 暂停                                │    │
│  │  POST /[id]/resume → 恢复                               │    │
│  │  POST /[id]/cancel → 取消                               │    │
│  │  POST /[id]/retry → 重试                                │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  lib/task-db.ts    → SQLite CRUD（better-sqlite3）      │    │
│  └─────────────────────────────────────────────────────────┘    │
└────────────────────────────┬────────────────────────────────────┘
                             │ SQLite 文件
┌────────────────────────────┴────────────────────────────────────┐
│  worker.ts  (独立进程: npx tsx worker.ts)                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  while(true) {                                          │    │
│  │    job = db.pollPendingJob()                            │    │
│  │    if (!job) { sleep(500); continue }                   │    │
│  │    db.markRunning(job.id)                               │    │
│  │    executeJob(job)  // decompose → generate → save      │    │
│  │  }                                                      │    │
│  └─────────────────────────────────────────────────────────┘    │
  │  imports: decompose.ts, generate.ts, agnes-api.ts, save-book.ts│
└─────────────────────────────────────────────────────────────────┘
```

## 数据库 Schema

使用 **better-sqlite3**，单文件 `picture-book-tasks.db`：

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,           -- 'job' | 'decompose' | 'generate' | 'save'
  parent_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  category TEXT DEFAULT 'idiom',
  source_text TEXT,
  scene_id INTEGER,
  scene_title TEXT,
  progress INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  max_reries INTEGER DEFAULT 3,
  decompose_meaning TEXT,
  decompose_character_description TEXT,
  decompose_style_description TEXT,
  decompose_scenes_json TEXT,
  image_url TEXT,
  error TEXT,
  start_time INTEGER,
  end_time INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_tasks_parent ON tasks(parent_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_type ON tasks(type);
```

### 设计决策

- **单表**：job 和子任务共用一张表，和现有 `Task` 接口一一对应
- **parent_id**：树形关系，和现有 `parentId` 一致
- **decompose 结果存子任务上**：避免批量生成时被覆盖（保持现有逻辑）

## Worker 进程

### 启动方式

```bash
# package.json
"scripts": {
  "worker": "npx tsx worker.ts"
}
```

### 执行流程

```
worker.ts 启动
  ├── loadPersistedTasks() → 将 running/paused 标记为 failed
  └── while(true) 循环
       ├── pollPendingJob() → SELECT * FROM tasks WHERE type='job' AND status='pending' LIMIT 1
       ├── 如果无 pending → sleep(500ms) → continue
       ├── markRunning(jobId)
       └── executeJob(jobId)
            ├── executeDecompose(decomposeTaskId, jobId, sourceText, category)
            │   ├── decomposeSource() ← 现有 Server Action
            │   ├── 写入分解结果到 SQLite
            │   └── addChildTasks() → 创建 generate + save 子任务
            ├── for each generate task:
            │   └── executeGenerate(taskId)
            │       ├── generateSceneImage(prompt) ← 现有 Server Action
            │       ├── downloadImageAsBase64()
            │       └── 更新 SQLite image_url
            └── executeSave(saveTaskId)
                ├── 从 SQLite 读取完整绘本数据
                └── saveBook() ← 直接调用保存逻辑（从 API route 中提取为独立函数）
```

### 信号处理

```typescript
process.on('SIGINT', () => { abortController.abort(); process.exit(0) })
process.on('SIGTERM', () => { abortController.abort(); process.exit(0) })
```

### 和现有 task-executor.ts 的关系

- 执行逻辑**基本相同**（decompose → generate → save 管道）
- **去掉**所有 Zustand 调用（`useTaskStore`、`useAppStore`）
- **改为**直接操作 SQLite（`task-db.ts`）
- **去掉** `useAppStore` 依赖 → scene 数据从 SQLite 读取
- 保留 `AbortController` 机制支持取消

## API Routes

```
POST   /api/jobs              → 创建 job
GET    /api/jobs              → 列出所有 job（支持 ?status= 过滤）
GET    /api/jobs/[id]         → job 详情（含子任务）
POST   /api/jobs/[id]/pause   → 暂停
POST   /api/jobs/[id]/resume  → 恢复
POST   /api/jobs/[id]/cancel  → 取消
POST   /api/jobs/[id]/retry   → 重试
GET    /api/tasks/[id]        → 单个任务状态
```

### POST /api/jobs

```typescript
// 请求
{ sourceText: string, category: string }

// 响应
{ success: true, jobId: string }
```

### GET /api/jobs

```typescript
// 查询参数
?status=pending|running|completed|failed

// 响应
{ jobs: Task[] }
// 每个 job 包含 children 数组
```

### POST /api/jobs/[id]/pause

```typescript
// 响应
{ success: true }
// Worker 检测到 status=paused 后暂停当前执行
```

## 前端改造

### 删除的文件

- `lib/task-store.ts` — Zustand task store（被 API + SQLite 替代）
- `lib/task-executor.ts` — 客户端执行器（被 Worker 替代）
- `lib/db.ts` 中的 task 相关函数（`saveTasks`、`loadTasks`、`clearTasks`）

### 新增的文件

| 文件 | 职责 |
|------|------|
| `lib/task-db.ts` | SQLite CRUD（服务端，better-sqlite3） |
| `lib/use-jobs.ts` | 前端 hook：轮询 `/api/jobs` 获取任务状态 |
| `lib/save-book.ts` | 从 `app/api/save-book/route.ts` 提取保存逻辑为独立函数 |
| `app/api/jobs/route.ts` | 创建任务 + 列出任务 |
| `app/api/jobs/[id]/pause/route.ts` | 暂停任务 |
| `app/api/jobs/[id]/resume/route.ts` | 恢复任务 |
| `app/api/jobs/[id]/cancel/route.ts` | 取消任务 |
| `app/api/jobs/[id]/retry/route.ts` | 重试任务 |
| `worker.ts` | 独立 Worker 进程 |

### 修改的文件

| 文件 | 改动 |
|------|------|
| `components/TaskQueue.tsx` | `useTaskStore()` → `useJobs()` hook |
| `components/TaskCard.tsx` | Zustand 操作 → API 调用 |
| `components/ContentSelector.tsx` | `createJob()` → `POST /api/jobs` |
| `app/page.tsx` | 去掉 TaskExecutor，改用 API 轮询 |
| `app/generate/page.tsx` | 去掉 TaskExecutor，改用 API 轮询 |
| `lib/store.ts` | 去掉 TaskExecutor 相关状态 |
| `lib/db.ts` | 删除 task 表相关代码 |

### useJobs() hook

```typescript
// 轮询间隔：2 秒
// 缓存策略：SWR（stale-while-revalidate）
export function useJobs(options?: { status?: string }) {
  return useSWR(
    `/api/jobs${options?.status ? `?status=${options.status}` : ''}`,
    fetcher,
    { refreshInterval: 2000 }
  )
}
```

## 迁移策略

### Phase 1: 基础设施（无功能变更）

1. 安装 `better-sqlite3` + `@types/better-sqlite3`
2. 提取 `lib/save-book.ts`（从 API route 中分离保存逻辑）
3. 创建 `lib/task-db.ts`（SQLite CRUD）
4. 创建 `app/api/jobs/` 路由（CRUD + 控制）
5. 创建 `worker.ts`（从 `task-executor.ts` 重构）

### Phase 2: 前端迁移

6. 创建 `lib/use-jobs.ts`（轮询 hook）
7. 改造 `TaskQueue.tsx`（Zustand → API）
8. 改造 `TaskCard.tsx`（Zustand → API）
9. 改造 `ContentSelector.tsx`（createJob → API）
10. 改造 `app/page.tsx`（去掉 TaskExecutor）
11. 改造 `app/generate/page.tsx`（去掉 TaskExecutor）

### Phase 3: 清理

12. 删除 `lib/task-store.ts`
13. 删除 `lib/task-executor.ts`
14. 清理 `lib/db.ts` 中的 task 相关代码
15. 更新 `package.json` scripts

## 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| SQLite 并发写入冲突 | Worker 和 API 同时写 | better-sqlite3 单线程写入，WAL 模式 |
| Worker 进程崩溃 | 任务卡在 running | 启动时恢复 + 定期健康检查 |
| 轮询延迟 | UI 更新慢 | 2s 轮询间隔，可后续改为 SSE |
| 热重载杀死 Worker | 开发中断 | Worker 独立进程，不受 Next.js 热重载影响 |
