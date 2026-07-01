# 任务中心重构设计

## 背景

当前首页的 TaskQueue 组件同时展示统计数据和完整的任务列表（含手风琴展开），导致：
1. 任务展开时挤压下方"绘本成品"区域
2. 首页负载过重，不利于快速选择内容
3. 缺少任务排查手段（无法查看 prompt）
4. 缺少任务优先级管理

## 目标

1. 首页仅展示轻量任务统计，引导用户到独立任务中心
2. 新建 `/tasks` 任务中心页面，完整展示任务执行进展（手风琴布局）
3. 支持查看每个子任务的具体 prompt 和执行细节（方便排查）
4. 支持等待中任务的优先级排序（上移/下移/置顶）

## 架构总览

```
首页 (page.tsx)                   任务中心 (/tasks)
┌─────────────────────────┐      ┌──────────────────────────────┐
│ CategoryTabs             │      │ 统计栏 (可点击筛选)          │
│ ┌───────────────────┐   │      │ ┌──────────────────────────┐ │
│ │ ContentSelector    │   │      │ │ ⏳ N  🔄 N  ✅ N  ❌ N  │ │
│ │ (lg:col-span-2)    │   │      │ └──────────────────────────┘ │
│ └───────────────────┘   │      │ 手风琴任务列表                │
│ ┌───────────┐           │      │ ┌──────────────────────────┐ │
│ │ 统计卡片   │           │      │ │ 📚 父任务 ▼             │ │
│ │ (col-span-1)│         │      │ │ ├ 🤖 分析 + 📊 查看prompt│ │
│ └───────────┘           │      │ │ ├ 🎨 场景 + 📊 查看prompt│ │
│                         │      │ │ └ 💾 保存                │ │
│ 绘本成品 (Bookshelf)     │      │ │ [↑][↓] 排序 (等待中)    │ │
│                         │      │ └──────────────────────────┘ │
└─────────────────────────┘      └──────────────────────────────┘
```

## 模块设计

### 模块 1：TaskStatsCards — 首页统计卡片

**文件**：`components/TaskStatsCards.tsx`（新建）

职责：仅展示任务统计数据，指向任务中心的入口。

```
┌──────────────────────┐
│ 📋 任务队列           │
│ ┌──────┐ ┌──────┐   │
│ │ ⏳ 3  │ │ 🔄 2 │   │  ← 点击跳转 /tasks?filter=pending|running
│ │ 等待  │ │ 执行  │   │
│ └──────┘ └──────┘   │
│ ┌──────┐ ┌──────┐   │
│ │ ✅ 12 │ │ ❌ 1  │   │  ← 点击跳转 /tasks?filter=completed|failed
│ │ 完成  │ │ 失败  │   │
│ └──────┘ └──────┘   │
│ 📊 共 18 个任务       │
│ → 查看全部 →         │  ← Link to /tasks
└──────────────────────┘
```

- 使用 `useJobs()` hook 获取数据
- 4 个 stat 卡片，每个点击后导航到 `/tasks?status=<filter>`
- 底部跳转链接到 `/tasks`
- 特征：轻量、无展开、无操作按钮

### 模块 2：任务中心页面 /tasks

**文件**：`app/tasks/page.tsx`（新建）

全功能任务管理页面，复用现有 TaskQueue 组件。布局：

```
<main className="min-h-screen bg-gradient-to-b from-secondary/30 to-background">
  <div className="max-w-7xl mx-auto px-4 py-8">
    <!-- 页头 + 返回 -->
    <div className="flex items-center gap-3 mb-6">
      <Link href="/">⬅ 返回首页</Link>
      <h1>📋 任务中心</h1>
    </div>

    <!-- 复用 TaskQueue（全模式） -->
    <TaskQueue />
  </div>
</main>
```

`TaskQueue` 组件维持现有全部功能：
- 统计栏（可点击筛选）
- 状态分组（执行中 → 已暂停 → 等待中 → 失败 → 已完成）
- 手风琴展开子任务
- 任务操作（暂停/继续/取消/重试/删除）
- 完成通知

### 模块 3：数据层扩展

#### Task 类型扩展

**文件**：`lib/task-types.ts`

```typescript
interface Task {
  // ...现有字段
  prompt?: string        // 新增：使用的完整 prompt 文本
  sortOrder?: number     // 新增：等待中任务排序序号
}
```

#### 数据库 Schema 扩展

**文件**：`lib/task-db.ts`

```sql
ALTER TABLE tasks ADD COLUMN prompt TEXT;
ALTER TABLE tasks ADD COLUMN sort_order INTEGER DEFAULT 0;
```

初始化 schema 时加入新列（已有表通过 ALTER TABLE 添加，使用 try-catch 兼容已存在的情况）。

新增函数：

```typescript
function deleteTask(id: string): void         // 已实现
function reorderTask(id: string, direction: 'up' | 'down' | 'top'): void
```

`reorderTask` 逻辑：
- `up`：与 sort_order 小于当前且最大的 pending 任务交换
- `down`：与 sort_order 大于当前且最小的 pending 任务交换
- `top`：当前设为 1，其他所有 pending 任务 sort_order + 1

#### Worker 存储 Prompt

**文件**：`worker.ts`

| 函数 | 存储位置 |
|------|---------|
| `executeDecompose()` | `updateTask(taskId, { ..., prompt: systemMessage + '\n' + userMessage })` |
| `executeGenerate()` | `updateTask(taskId, { ..., prompt: enhancedPrompt })` |

#### 创建任务时设置排序

`createTask()` 中，当 `type === 'job'` 时自动设置 `sort_order`：
```sql
sort_order = (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tasks WHERE type = 'job' AND status = 'pending')
```

### 模块 4：API 扩展

#### 优先级排序

**文件**：`app/api/jobs/[id]/reorder/route.ts`（新建）

```typescript
POST /api/jobs/:id/reorder
Body: { direction: 'up' | 'down' | 'top' }
Response: { success: true }
```

限制：仅 `status === 'pending'` 的任务可排序。

**前端函数**：`lib/use-jobs.ts` 新增 `reorderJobAPI(jobId, direction)`

### 模块 5：UI 交互

#### Prompt 查看

在 `ChildTaskRow` 中，对已完成的子任务增加 📊 按钮：

| 子任务类型 | 弹窗内容 |
|-----------|---------|
| decompose | LLM system message + user message（格式化展示） |
| generate  | 增强后的生图 prompt |
| save      | 构造的 PictureBook JSON 片段 |

弹窗复用现有模态窗口模式（`fixed inset-0 z-50`）。

对失败的子任务，错误详情中增加 Prompt 显示区域。

#### 优先级排序

在等待中（pending）的父任务操作栏中增加 ↑ ↓ ⬆ 按钮：

```
[❌ 取消]  [↑] [↓] [⬆ 置顶]
```

- ↑ 与上一个等待中任务交换顺序
- ↓ 与下一个等待中任务交换顺序
- ⬆ 置顶到第一位

操作后调用 `reorderJobAPI()`，成功后 `refresh()` 刷新列表。

### 模块 6：导航入口

**文件**：`components/Header.tsx`

```tsx
<header className="bg-white shadow-sm">
  <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
    <Link href="/" className="text-xl font-bold text-primary">🎨 绘本工坊</Link>
    <nav className="flex gap-4 text-sm">
      <Link href="/tasks" className="text-gray-600 hover:text-primary transition-colors">
        📋 任务中心
      </Link>
    </nav>
  </div>
</header>
```

HTML 语义：使用 `<nav>` 包裹导航链接。

布局：flex `justify-between`，左侧 Logo，右侧导航。

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `components/TaskStatsCards.tsx` | **新建** | 首页统计卡片组件 |
| `app/tasks/page.tsx` | **新建** | 任务中心页面 |
| `app/api/jobs/[id]/reorder/route.ts` | **新建** | 优先级排序 API |
| `lib/task-types.ts` | 修改 | Task 接口增加 `prompt`、`sortOrder` 字段 |
| `lib/task-db.ts` | 修改 | Schema 扩展 + `reorderTask()` + 创建任务设 sort_order |
| `lib/use-jobs.ts` | 修改 | 新增 `reorderJobAPI()` |
| `components/Header.tsx` | 修改 | 增加"任务中心"导航链接 |
| `app/page.tsx` | 修改 | 用 TaskStatsCards 替换 TaskQueue |
| `worker.ts` | 修改 | decompose/generate 步骤存储 prompt |
| `components/TaskCard.tsx` | 修改 | 子任务增加 prompt 查看 + 排序按钮 |

## 未涉及的范围

- 不修改 `components/TaskQueue.tsx` 的主体逻辑（仅增加 `onDelete`、`refresh` 等已修改的部分）
- 不修改现有的 API routes（cancel/pause/resume/retry）
- 不修改 `lib/save-book.ts`、`lib/store.ts` 等无关模块
- 不修改 worker 的执行逻辑，仅增加 prompt 存储

## 边界情况

1. **排序仅限等待中**：非 pending 状态的任务不显示排序按钮，API 返回 400
2. **并发排序**：使用事务保证 sort_order 交换的原子性
3. **Prompt 存储兼容性**：已有任务 prompt 字段为 null，UI 做空值处理，显示"无 prompt 记录"
4. **首页统计高度**：TaskStatsCards 高度约 200px，不挤压书架
5. **导航激活态**：任务中心页面时 Header 链接高亮
