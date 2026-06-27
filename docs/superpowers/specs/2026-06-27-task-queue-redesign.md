# 任务队列重新设计规格文档

## 背景

当前任务队列是扁平结构，没有主/子任务概念。用户需要：
1. 一个成语的分析作为主任务，包含多个子任务
2. 点击主任务可展开查看子任务详情（手风琴式）
3. 支持批量排队生成多个成语绘本
4. 严格串行执行策略

## 一、数据模型

### Task 接口扩展

```typescript
export type TaskStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
export type TaskType = 'job' | 'decompose' | 'generate' | 'save'

export interface Task {
  id: string
  type: TaskType            // 'job' = 主任务，其余 = 子任务
  parentId: string | null   // 主任务为 null，子任务指向 jobId
  status: TaskStatus
  idiom?: string            // 仅主任务
  sceneId?: number          // 仅 generate 子任务
  sceneTitle?: string
  progress: number
  total: number
  error?: string
  startTime?: number
  endTime?: number
  retryCount: number
  maxRetries: number
  childTaskIds: string[]    // 仅主任务，子任务 ID 列表
}
```

### 主任务状态派生规则

主任务的 status 由子任务自动推算，不需要手动设置：

| 条件 | 主任务 status |
|------|-------------|
| 所有子任务 completed | completed |
| 任一子任务 running | running |
| 任一子任务 failed 且无 running | failed |
| 任一子任务 paused 且无 running | paused |
| 全部 pending | pending |
| 已取消（用户手动） | cancelled |

## 二、Store 变更

### 新增 Actions

```typescript
// 创建主任务（仅主任务，不含子任务）
// 子任务在 decompose 完成后动态创建
createJob: (idiom: string) => string  // 返回 jobId

// 为主任务添加子任务（decompose 完成后调用）
addChildTasks: (jobId: string, tasks: Array<{ type: TaskType; sceneId?: number; sceneTitle?: string }>) => void

// 子任务状态变更时自动同步主任务状态
updateTask: (taskId: string, updates: Partial<Task>) => void
// 内部逻辑：更新子任务后，自动调用 deriveJobStatus(parentId)

// 批量创建多个主任务
createJobs: (idioms: string[]) => string[]  // 返回 jobIds

// 执行队列：取出下一个 pending 的 job 开始执行
dequeueNextJob: () => Task | null

// 标记 job 完成后，自动调用 dequeueNextJob
```

### 新增 Computed Getters

```typescript
getJobById: (jobId: string) => Task | undefined
getChildTasks: (jobId: string) => Task[]
getJobProgress: (jobId: string) => { completed: number; total: number; percent: number }
getJobQueue: () => Task[]  // 返回所有主任务，按创建时间排序
```

## 三、UI 设计

### 3.1 首页变更

成语网格改为支持多选：
- 每个成语按钮增加复选框样式
- 选中的成语高亮 + 勾选标记
- 已有绘本（✓标记）仍然显示，点击时弹重复检查对话框
- 底部按钮区：「🚀 批量生成（N 个）」，N = 选中数量

### 3.2 任务队列面板（首页右侧）

```
┌─────────────────────────────────────────────┐
│ 📋 任务队列                    [全部暂停] [取消] │
├─────────────────────────────────────────────┤
│ ▶ 📚 守株待兔  ■■■■□□  4/6  12:30          │ ← 主任务，可点击展开
│                                             │
│ ✅ 📚 叶公好龙  ■■■■■■  6/6  完成 (8:30)   │ ← 已完成，折叠状态
│                                             │
│ ⏸ 📚 拔苗助长  ■■□□□□  2/6  暂停中         │
└─────────────────────────────────────────────┘
```

展开后：
```
┌─────────────────────────────────────────────┐
│ ▼ 📚 守株待兔  ■■■■□□  4/6  12:30          │
│   ├ ✅ 🤖 场景拆分                    3s     │
│   ├ ✅ 🎨 场景1：兔子撞树             28s    │
│   ├ 🔄 🎨 场景2：农夫等待  ■■□□  2/4  15s  │ ← 当前执行
│   ├ ⏳ 🎨 场景3：田地荒芜                  │
│   └ ⏳ 💾 保存绘本                          │
└─────────────────────────────────────────────┘
```

### 3.3 主任务卡片

| 元素 | 说明 |
|------|------|
| 左侧箭头 | ▶/▼ 切换展开 |
| 📚 + 成语名 | 粗体 |
| 进度条 | completed/total，来自 getJobProgress |
| 耗时 | 从第一个子任务开始到最后一个结束 |
| 操作按钮 | 暂停/取消（暂停当前子任务，后续子任务标记 paused） |

### 3.4 子任务卡片

| 元素 | 说明 |
|------|------|
| 类型图标 | 🤖 拆分 / 🎨 生成 / 💾 保存 |
| 场景标题 | sceneTitle |
| 独立进度条 | progress/total |
| 耗时 | 单个子任务的执行时间 |
| 重试指示 | 🔄 2/3 |

## 四、生成流程重构

当前 generate/page.tsx 的逻辑改为由 task-store 驱动：

### 4.1 新流程

1. 用户在首页选中多个成语 → 点击「批量生成」
2. 为每个成语调用 `createJob(idiom)` → 创建主任务（此时无子任务）
3. 调用 `dequeueNextJob()` → 取出第一个 pending 的 job
4. 执行该 job：
   a. 创建一个拆分子任务 → 调用 decomposeIdiom
   b. 拆分完成后，调用 `addChildTasks(jobId, scenes)` → 动态创建 N 个生成子任务 + 1 个保存子任务
   c. 依次执行生成子任务 → 调用 generateSceneImage + downloadImageAsBase64
   d. 执行保存子任务 → 调用 savePictureBook
5. job 完成 → 调用 `dequeueNextJob()` → 继续下一个 job
6. 全部完成

### 4.2 执行器

新增 `lib/task-executor.ts`，导出 `TaskExecutor` 类：

```typescript
class TaskExecutor {
  private isRunning = false
  private currentJobId: string | null = null

  // 启动执行循环
  async start(): Promise<void>

  // 执行单个 job 的所有子任务
  async executeJob(jobId: string): Promise<void>

  // 执行单个子任务
  async executeTask(taskId: string): Promise<void>

  // 处理拆分任务：调用 decomposeIdiom，完成后 addChildTasks
  private async handleDecompose(taskId: string, jobId: string, idiom: string): Promise<void>

  // 处理生成任务：调用 generateSceneImage + downloadImageAsBase64
  private async handleGenerate(taskId: string): Promise<void>

  // 处理保存任务：调用 savePictureBook + saveSceneImage
  private async handleSave(taskId: string, jobId: string): Promise<void>

  // 停止执行
  stop(): void
}
```

执行器在页面组件中实例化，通过 `useEffect` 启动。不是全局单例——页面关闭即停止。

核心循环逻辑：
1. `dequeueNextJob()` 取出 pending job
2. 设置 job 为 running，创建拆分子任务
3. 执行拆分 → 动态创建生成子任务 → 逐个执行 → 执行保存
4. 标记 job 完成 → 回到步骤 1
5. 如果某个子任务失败且未达重试上限，标记 pending 后重新执行
6. 如果用户暂停/取消，检查状态后中断循环

### 4.3 页面跳转

- 生成完成后不再自动跳转
- 用户点击已完成的主任务 → 显示「📖 查看绘本」按钮 → 跳转阅读页
- 生成过程用户可以继续选择新成语排队

## 五、Prompt 优化

当前 prompt 有共同前缀（91 chars），导致图片风格过于单一。

### 优化策略

1. **场景描述更具体**：在 prompt 中增加构图指令（close-up, wide shot, bird's eye view 等）
2. **增加场景序号上下文**：告知图像生成 API 这是第几个场景，暗示需要叙事变化
3. **角色姿态多样化**：在 characterDescription 中强调角色需要在不同场景中有不同姿态和表情

### prompt 结构变更

```
{characterDescription}, {sceneDescription}, {compositionHint}, {styleDescription}
```

新增 `compositionHint` 字段，由 LLM 在拆分时为每个场景生成构图建议（如 "close-up shot", "wide angle scene", "overhead view"）。

## 六、历史持久化

### IndexedDB 表结构

现有 `tasks` 表新增字段：
- `parentId`
- `idiom`
- `childTaskIds`
- `jobId`（用于快速查询某 job 的所有子任务）

页面加载时从 IndexedDB 恢复任务队列，如果任务状态为 `running` 则标记为 `failed`（因为页面刷新意味着执行中断）。

## 七、受影响的文件

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `lib/task-store.ts` | 重构 | 扩展 Task 接口，新增 parentId、job 概念、派生逻辑 |
| `lib/task-executor.ts` | 新增 | 任务执行器，驱动子任务执行 |
| `lib/types.ts` | 修改 | SceneTemplate 新增 compositionHint |
| `app/actions/decompose.ts` | 修改 | Prompt 模板增加构图指令 |
| `app/page.tsx` | 修改 | 首页支持多选成语 + 批量生成 |
| `components/TaskQueue.tsx` | 重构 | 主任务手风琴展开/折叠 |
| `components/TaskCard.tsx` | 重构 | 区分主任务/子任务渲染 |
| `components/TaskManager.tsx` | 修改 | 过滤/排序适配新模型 |
| `components/IdiomSelector.tsx` | 修改 | 支持多选 |
| `app/generate/page.tsx` | 重构 | 改为监听 task-store 驱动生成 |

## 八、不做的事

- 不支持任务重排序（严格按创建顺序串行）
- 不支持并行生成（严格串行）
- 不支持跨页面的任务详情页（面板内展开即可）
- 不实现 Web Worker 后台执行（浏览器关闭即中断）
