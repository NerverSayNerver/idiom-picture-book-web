# 任务队列重新设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构任务队列支持主/子任务模型、手风琴展开、批量排队生成，并优化图像生成 prompt。

**Architecture:** 采用扁平化任务模型（方案 A），通过 `parentId` 字段关联主/子任务。新增 `task-executor.ts` 驱动串行执行。首页支持多选成语批量创建 Job。

**Tech Stack:** Next.js 14, React, Zustand, TypeScript, IndexedDB (Dexie)

**Spec:** `docs/superpowers/specs/2026-06-27-task-queue-redesign.md`

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `lib/task-store.ts` | 重构：扩展 Task 接口，新增 parentId/job 概念/派生逻辑 |
| `lib/task-executor.ts` | 新增：任务执行器，驱动子任务串行执行 |
| `lib/types.ts` | 修改：SceneTemplate 新增 compositionHint |
| `app/actions/decompose.ts` | 修改：Prompt 模板增加构图指令 |
| `app/page.tsx` | 修改：首页支持多选 + 批量生成 |
| `components/TaskQueue.tsx` | 重构：主任务手风琴展开/折叠 |
| `components/TaskCard.tsx` | 重构：区分主任务/子任务渲染 |
| `components/TaskManager.tsx` | 修改：过滤/排序适配新模型 |
| `components/IdiomSelector.tsx` | 修改：支持多选 |
| `app/generate/page.tsx` | 重构：改为监听 task-store 驱动生成 |

---

### Task 1: 扩展数据类型

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/task-store.ts`

- [ ] **Step 1: 修改 types.ts，新增 compositionHint**

在 `SceneTemplate` 接口中添加字段：

```typescript
// lib/types.ts - SceneTemplate
export interface SceneTemplate {
  title: string
  description: string
  prompt: string
  narration: string
  compositionHint?: string  // 新增：构图指令
}
```

- [ ] **Step 2: 扩展 task-store.ts 的 Task 接口**

替换现有 Task 接口和类型定义：

```typescript
// lib/task-store.ts
export type TaskStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
export type TaskType = 'job' | 'decompose' | 'generate' | 'save'

export interface Task {
  id: string
  type: TaskType
  parentId: string | null
  status: TaskStatus
  idiom?: string
  sceneId?: number
  sceneTitle?: string
  progress: number
  total: number
  error?: string
  startTime?: number
  endTime?: number
  retryCount: number
  maxRetries: number
  childTaskIds: string[]
}
```

- [ ] **Step 3: 验证 TypeScript 编译**

Run: `npx tsc --noEmit`
Expected: 类型错误（因为旧代码引用了已删除的字段），下一步修复

- [ ] **Step 4: 修复 task-store.ts 中所有类型错误**

更新整个 `task-store.ts`，包含新的 Actions 和 Getters：

```typescript
import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'

export type TaskStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
export type TaskType = 'job' | 'decompose' | 'generate' | 'save'

export interface Task {
  id: string
  type: TaskType
  parentId: string | null
  status: TaskStatus
  idiom?: string
  sceneId?: number
  sceneTitle?: string
  progress: number
  total: number
  error?: string
  startTime?: number
  endTime?: number
  retryCount: number
  maxRetries: number
  childTaskIds: string[]
}

interface TaskQueueState {
  tasks: Task[]
  isRunning: boolean
  isPaused: boolean
  currentJobId: string | null

  // Job CRUD
  createJob: (idiom: string) => string
  addChildTasks: (jobId: string, tasks: Array<{ type: TaskType; sceneId?: number; sceneTitle?: string }>) => void
  createJobs: (idioms: string[]) => string[]

  // Task CRUD
  addTask: (task: Omit<Task, 'id' | 'status' | 'progress' | 'retryCount' | 'maxRetries' | 'childTaskIds'> & { maxRetries?: number }) => string
  updateTask: (taskId: string, updates: Partial<Task>) => void
  removeTask: (taskId: string) => void

  // Task control
  pauseTask: (taskId: string) => void
  resumeTask: (taskId: string) => void
  cancelTask: (taskId: string) => void
  retryTask: (taskId: string) => void

  // Global control
  pauseAll: () => void
  resumeAll: () => void
  cancelAll: () => void
  clearCompleted: () => void

  // Getters
  getTaskById: (taskId: string) => Task | undefined
  getChildTasks: (jobId: string) => Task[]
  getJobProgress: (jobId: string) => { completed: number; total: number; percent: number }
  getJobQueue: () => Task[]

  // Queue
  dequeueNextJob: () => Task | null

  reset: () => void
}

// Helper: 派生主任务状态
function deriveJobStatus(childTasks: Task[]): TaskStatus {
  if (childTasks.length === 0) return 'pending'
  const statuses = childTasks.map(t => t.status)
  if (statuses.every(s => s === 'completed')) return 'completed'
  if (statuses.some(s => s === 'running')) return 'running'
  if (statuses.some(s => s === 'failed') && !statuses.some(s => s === 'running')) return 'failed'
  if (statuses.some(s => s === 'paused') && !statuses.some(s => s === 'running')) return 'paused'
  if (statuses.some(s => s === 'cancelled')) return 'cancelled'
  return 'pending'
}

export const useTaskStore = create<TaskQueueState>((set, get) => ({
  tasks: [],
  isRunning: false,
  isPaused: false,
  currentJobId: null,

  createJob: (idiom) => {
    const jobId = uuidv4()
    const job: Task = {
      id: jobId,
      type: 'job',
      parentId: null,
      status: 'pending',
      idiom,
      progress: 0,
      total: 0,
      retryCount: 0,
      maxRetries: 0,
      childTaskIds: [],
    }
    set(state => ({ tasks: [...state.tasks, job] }))
    return jobId
  },

  addChildTasks: (jobId, childDefs) => {
    const childIds: string[] = []
    const newTasks: Task[] = childDefs.map(def => {
      const childId = uuidv4()
      childIds.push(childId)
      return {
        id: childId,
        type: def.type,
        parentId: jobId,
        status: 'pending' as TaskStatus,
        sceneId: def.sceneId,
        sceneTitle: def.sceneTitle,
        progress: 0,
        total: def.type === 'generate' ? 2 : 1,
        retryCount: 0,
        maxRetries: def.type === 'generate' ? 3 : 0,
        childTaskIds: [],
      }
    })

    set(state => ({
      tasks: state.tasks.map(t =>
        t.id === jobId
          ? { ...t, childTaskIds: [...t.childTaskIds, ...childIds], total: t.total + newTasks.length }
          : t
      ).concat(newTasks),
    }))
  },

  createJobs: (idioms) => {
    return idioms.map(idiom => get().createJob(idiom))
  },

  addTask: (taskData) => {
    const taskId = uuidv4()
    const newTask: Task = {
      ...taskData,
      id: taskId,
      status: 'pending',
      progress: 0,
      retryCount: 0,
      maxRetries: taskData.maxRetries ?? 3,
      childTaskIds: taskData.childTaskIds || [],
    }
    set(state => ({ tasks: [...state.tasks, newTask] }))
    return taskId
  },

  updateTask: (taskId, updates) => {
    set(state => {
      const newTasks = state.tasks.map(t => {
        if (t.id !== taskId) return t
        const updated = { ...t, ...updates }
        if (updates.status === 'completed' && t.status !== 'completed') {
          updated.endTime = Date.now()
        }
        if (updates.status === 'failed' && t.status !== 'failed') {
          updated.endTime = Date.now()
        }
        return updated
      })

      // 如果更新的是子任务，同步派生主任务状态
      const updatedTask = newTasks.find(t => t.id === taskId)
      if (updatedTask?.parentId) {
        const parentIdx = newTasks.findIndex(t => t.id === updatedTask.parentId)
        if (parentIdx !== -1) {
          const childTasks = newTasks.filter(t => t.parentId === updatedTask.parentId)
          const derivedStatus = deriveJobStatus(childTasks)
          const completedCount = childTasks.filter(t => t.status === 'completed').length
          newTasks[parentIdx] = {
            ...newTasks[parentIdx],
            status: derivedStatus,
            progress: completedCount,
            total: childTasks.length,
            startTime: newTasks[parentIdx].startTime || Date.now(),
            endTime: derivedStatus === 'completed' || derivedStatus === 'failed' ? Date.now() : undefined,
          }
        }
      }

      return { tasks: newTasks }
    })
  },

  removeTask: (taskId) => {
    set(state => ({
      tasks: state.tasks.filter(t => t.id !== taskId && t.parentId !== taskId),
    }))
  },

  pauseTask: (taskId) => {
    const task = get().getTaskById(taskId)
    if (!task) return
    if (task.type === 'job') {
      // 暂停 job：暂停当前 running 的子任务
      const children = get().getChildTasks(taskId)
      const runningChild = children.find(c => c.status === 'running')
      if (runningChild) get().updateTask(runningChild.id, { status: 'paused' })
      get().updateTask(taskId, { status: 'paused' })
    } else if (task.status === 'running') {
      get().updateTask(taskId, { status: 'paused' })
    }
  },

  resumeTask: (taskId) => {
    const task = get().getTaskById(taskId)
    if (!task) return
    if (task.type === 'job') {
      const children = get().getChildTasks(taskId)
      const pausedChild = children.find(c => c.status === 'paused')
      if (pausedChild) get().updateTask(pausedChild.id, { status: 'running' })
      get().updateTask(taskId, { status: 'running' })
    } else if (task.status === 'paused') {
      get().updateTask(taskId, { status: 'running' })
    }
  },

  cancelTask: (taskId) => {
    const task = get().getTaskById(taskId)
    if (!task) return
    if (task.type === 'job') {
      // 取消 job：取消所有 pending/running 子任务
      const children = get().getChildTasks(taskId)
      children.forEach(c => {
        if (c.status === 'pending' || c.status === 'running' || c.status === 'paused') {
          get().updateTask(c.id, { status: 'cancelled' })
        }
      })
      get().updateTask(taskId, { status: 'cancelled' })
    } else if (['pending', 'running', 'paused'].includes(task.status)) {
      get().updateTask(taskId, { status: 'cancelled' })
    }
  },

  retryTask: (taskId) => {
    const task = get().getTaskById(taskId)
    if (task && task.status === 'failed' && task.retryCount < (task.maxRetries ?? 3)) {
      get().updateTask(taskId, {
        status: 'pending',
        retryCount: task.retryCount + 1,
        error: undefined,
        progress: 0,
      })
    }
  },

  pauseAll: () => {
    set({ isPaused: true })
    get().getJobQueue().forEach(job => {
      if (job.status === 'running') get().pauseTask(job.id)
    })
  },

  resumeAll: () => {
    set({ isPaused: false })
    get().getJobQueue().forEach(job => {
      if (job.status === 'paused') get().resumeTask(job.id)
    })
  },

  cancelAll: () => {
    get().getJobQueue().forEach(job => {
      if (['pending', 'running', 'paused'].includes(job.status)) get().cancelTask(job.id)
    })
  },

  clearCompleted: () => {
    set(state => ({
      tasks: state.tasks.filter(t => {
        if (t.type === 'job' && (t.status === 'completed' || t.status === 'cancelled')) return false
        if (t.parentId && !state.tasks.some(p => p.id === t.parentId)) return false
        return true
      }),
    }))
  },

  getTaskById: (taskId) => get().tasks.find(t => t.id === taskId),

  getChildTasks: (jobId) => {
    const job = get().getTaskById(jobId)
    if (!job) return []
    return job.childTaskIds
      .map(id => get().getTaskById(id))
      .filter((t): t is Task => !!t)
  },

  getJobProgress: (jobId) => {
    const children = get().getChildTasks(jobId)
    const completed = children.filter(t => t.status === 'completed').length
    const total = children.length
    return { completed, total, percent: total > 0 ? Math.round((completed / total) * 100) : 0 }
  },

  getJobQueue: () => get().tasks.filter(t => t.type === 'job'),

  dequeueNextJob: () => {
    const jobs = get().getJobQueue()
    const pendingJob = jobs.find(j => j.status === 'pending')
    if (pendingJob) {
      get().updateTask(pendingJob.id, { status: 'running', startTime: Date.now() })
      set({ currentJobId: pendingJob.id })
      return pendingJob
    }
    set({ currentJobId: null, isRunning: false })
    return null
  },

  reset: () => set({
    tasks: [],
    isRunning: false,
    isPaused: false,
    currentJobId: null,
  }),
}))
```

- [ ] **Step 5: 验证 TypeScript 编译**

Run: `npx tsc --noEmit`
Expected: 可能有其他文件的类型错误（TaskCard、TaskQueue 等引用旧接口），后续 Task 修复

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/task-store.ts
git commit -m "refactor: 扩展 Task 模型支持主/子任务"
```

---

### Task 2: 新增任务执行器

**Files:**
- Create: `lib/task-executor.ts`

- [ ] **Step 1: 创建 task-executor.ts**

```typescript
// lib/task-executor.ts
import { useTaskStore } from './task-store'
import { decomposeIdiom } from '@/app/actions/decompose'
import { generateSceneImage, downloadImageAsBase64 } from '@/app/actions/generate'
import { savePictureBook, saveSceneImage } from '@/lib/db'
import { useAppStore } from './store'

function base64ToBlob(base64: string): Blob {
  const parts = base64.split(',')
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png'
  const bstr = atob(parts[1])
  const n = bstr.length
  const u8arr = new Uint8Array(n)
  for (let i = 0; i < n; i++) u8arr[i] = bstr.charCodeAt(i)
  return new Blob([u8arr], { type: mime })
}

export class TaskExecutor {
  private store = useTaskStore.getState
  private appStore = useAppStore.getState
  private abortController: AbortController | null = null

  async start() {
    this.store().isRunning = true
    this.abortController = new AbortController()

    while (this.store().isRunning && !this.store().isPaused) {
      const job = this.store().dequeueNextJob()
      if (!job) break

      try {
        await this.executeJob(job.id)
      } catch (err) {
        console.error(`Job ${job.idiom} 执行失败:`, err)
        this.store().updateTask(job.id, {
          status: 'failed',
          error: err instanceof Error ? err.message : '执行失败',
        })
      }
    }

    this.store().isRunning = false
  }

  stop() {
    this.store().isRunning = false
    this.abortController?.abort()
  }

  private async executeJob(jobId: string) {
    const job = this.store().getTaskById(jobId)
    if (!job || !job.idiom) return

    // 设置当前成语上下文
    this.appStore().setCurrentIdiom(job.idiom)

    // Step 1: 拆分
    const decomposeTaskId = this.store().addTask({
      type: 'decompose',
      parentId: jobId,
      idiom: job.idiom,
      sceneTitle: '场景拆分',
      total: 1,
      maxRetries: 0,
    })

    await this.executeDecompose(decomposeTaskId, jobId, job.idiom)

    // 检查是否被取消/暂停
    if (!this.store().isRunning || this.store().isPaused) return

    // Step 2: 获取子任务列表（拆分后动态创建的生成任务）
    const children = this.store().getChildTasks(jobId)
    const generateTasks = children.filter(t => t.type === 'generate')

    // Step 3: 逐个生成图像
    for (const task of generateTasks) {
      if (!this.store().isRunning || this.store().isPaused) return
      await this.executeGenerate(task.id)
    }

    // Step 4: 保存
    if (!this.store().isRunning || this.store().isPaused) return
    const saveTask = children.find(t => t.type === 'save')
    if (saveTask) {
      await this.executeSave(saveTask.id, jobId)
    }
  }

  private async executeDecompose(taskId: string, jobId: string, idiom: string) {
    this.store().updateTask(taskId, { status: 'running', startTime: Date.now() })

    try {
      const decomposition = await decomposeIdiom(idiom)
      this.appStore().setDecomposition(decomposition.meaning, decomposition.scenes)

      // 动态创建生成子任务 + 保存子任务
      const childDefs = decomposition.scenes.map((scene, i) => ({
        type: 'generate' as const,
        sceneId: i + 1,
        sceneTitle: scene.title,
      }))
      childDefs.push({ type: 'save' as const, sceneTitle: '保存绘本' })

      this.store().addChildTasks(jobId, childDefs)

      this.store().updateTask(taskId, { status: 'completed', progress: 1, total: 1 })
    } catch (err) {
      this.store().updateTask(taskId, {
        status: 'failed',
        error: err instanceof Error ? err.message : '拆分失败',
      })
      throw err
    }
  }

  private async executeGenerate(taskId: string) {
    const task = this.store().getTaskById(taskId)
    if (!task || !task.sceneId) return

    this.store().updateTask(taskId, { status: 'running', startTime: Date.now() })

    const scenes = this.appStore().currentScenes
    const scene = scenes[task.sceneId - 1]
    if (!scene) {
      this.store().updateTask(taskId, { status: 'failed', error: '场景不存在' })
      return
    }

    try {
      // 生成图像
      this.store().updateTask(taskId, { progress: 1, total: 2 })
      const imageUrl = await generateSceneImage(scene.prompt)

      // 下载为 base64
      this.store().updateTask(taskId, { progress: 2, total: 2 })
      const base64 = await downloadImageAsBase64(imageUrl)
      const imageBlob = base64ToBlob(base64)

      // 保存到 app store
      this.appStore().setSceneImage(task.sceneId, imageUrl, imageBlob)

      this.store().updateTask(taskId, { status: 'completed', progress: 2, total: 2 })
    } catch (err) {
      const currentTask = this.store().getTaskById(taskId)
      if (currentTask && currentTask.retryCount < (currentTask.maxRetries ?? 3)) {
        // 自动重试
        this.store().updateTask(taskId, {
          status: 'pending',
          retryCount: currentTask.retryCount + 1,
          error: `重试中 (${currentTask.retryCount + 1}/${currentTask.maxRetries})...`,
          progress: 0,
        })
        // 重新执行
        await this.executeGenerate(taskId)
      } else {
        this.store().updateTask(taskId, {
          status: 'failed',
          error: err instanceof Error ? err.message : '生成失败',
        })
        // 不抛出，继续其他场景
      }
    }
  }

  private async executeSave(taskId: string, jobId: string) {
    this.store().updateTask(taskId, { status: 'running', startTime: Date.now() })

    try {
      const book = this.appStore().saveCurrentBook()
      await savePictureBook(book)

      for (const scene of book.scenes) {
        if (scene.imageBlob) {
          await saveSceneImage(book.id, scene.id, scene.imageBlob)
        }
      }

      this.store().updateTask(taskId, { status: 'completed', progress: 1, total: 1 })
    } catch (err) {
      this.store().updateTask(taskId, {
        status: 'failed',
        error: err instanceof Error ? err.message : '保存失败',
      })
      throw err
    }
  }
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `npx tsc --noEmit`
Expected: 可能有类型错误，修复后编译通过

- [ ] **Step 3: Commit**

```bash
git add lib/task-executor.ts
git commit -m "feat: 新增 TaskExecutor 驱动任务串行执行"
```

---

### Task 3: 重构 TaskCard 组件

**Files:**
- Modify: `components/TaskCard.tsx`

- [ ] **Step 1: 重写 TaskCard.tsx，区分主任务/子任务渲染**

```tsx
'use client'

import { useState } from 'react'
import type { Task, TaskStatus } from '@/lib/task-store'
import { useTaskStore } from '@/lib/task-store'

interface TaskCardProps {
  task: Task
  expanded?: boolean
  onToggle?: () => void
}

const statusConfig: Record<TaskStatus, { color: string; icon: string; label: string }> = {
  pending: { color: 'bg-yellow-100 text-yellow-800', icon: '⏳', label: '等待中' },
  running: { color: 'bg-blue-100 text-blue-800', icon: '🔄', label: '执行中' },
  paused: { color: 'bg-orange-100 text-orange-800', icon: '⏸️', label: '已暂停' },
  completed: { color: 'bg-green-100 text-green-800', icon: '✅', label: '已完成' },
  failed: { color: 'bg-red-100 text-red-800', icon: '❌', label: '失败' },
  cancelled: { color: 'bg-gray-100 text-gray-800', icon: '🚫', label: '已取消' },
}

const typeIcons: Record<string, string> = {
  job: '📚',
  decompose: '🤖',
  generate: '🎨',
  save: '💾',
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  if (minutes > 0) return `${minutes}m${seconds % 60}s`
  return `${seconds}s`
}

// 子任务卡片
function ChildTaskRow({ task }: { task: Task }) {
  const { pauseTask, resumeTask, retryTask } = useTaskStore()
  const status = statusConfig[task.status]
  const icon = typeIcons[task.type] || '❓'

  const elapsed = task.startTime && task.endTime ? task.endTime - task.startTime
    : task.startTime ? Date.now() - task.startTime : null

  return (
    <div className="flex items-center gap-3 py-2 px-3 text-sm">
      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
        task.status === 'completed' ? 'bg-green-500 text-white' :
        task.status === 'running' ? 'bg-blue-500 text-white' :
        task.status === 'failed' ? 'bg-red-500 text-white' :
        'bg-gray-300 text-gray-600'
      }`}>
        {task.status === 'completed' ? '✓' :
         task.status === 'running' ? '↻' :
         task.status === 'failed' ? '✕' : ''}
      </span>
      <span>{icon}</span>
      <span className="flex-1 text-gray-700">{task.sceneTitle}</span>
      {task.status === 'running' && task.total > 0 && (
        <span className="text-xs text-blue-600">{task.progress}/{task.total}</span>
      )}
      {task.status === 'failed' && task.retryCount > 0 && (
        <span className="text-xs text-orange-500">🔄 {task.retryCount}/{task.maxRetries}</span>
      )}
      {elapsed && task.status !== 'pending' && (
        <span className="text-xs text-gray-400">{formatDuration(elapsed)}</span>
      )}
      {task.status === 'failed' && task.retryCount < (task.maxRetries ?? 3) && (
        <button onClick={() => retryTask(task.id)} className="text-xs text-blue-500 hover:underline">重试</button>
      )}
    </div>
  )
}

// 主任务卡片
export function TaskCard({ task, expanded = false, onToggle }: TaskCardProps) {
  const { pauseTask, resumeTask, cancelTask, getChildTasks, getJobProgress } = useTaskStore()
  const status = statusConfig[task.status]
  const isJob = task.type === 'job'
  const children = isJob ? getChildTasks(task.id) : []
  const progress = isJob ? getJobProgress(task.id) : null

  const elapsed = task.startTime && task.endTime ? task.endTime - task.startTime
    : task.startTime ? Date.now() - task.startTime : null

  return (
    <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
      {/* 主任务行 */}
      <div
        className={`flex items-center gap-3 px-4 py-3 ${isJob ? 'cursor-pointer hover:bg-gray-50' : ''}`}
        onClick={isJob ? onToggle : undefined}
      >
        {isJob && (
          <span className="text-gray-400 text-sm">{expanded ? '▼' : '▶'}</span>
        )}
        <span>{typeIcons[task.type] || '❓'}</span>
        <span className="flex-1 font-medium text-gray-800">
          {task.idiom || task.sceneTitle || '未知任务'}
        </span>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
          {status.label}
        </span>
        {progress && progress.total > 0 && (
          <div className="flex items-center gap-2 min-w-[120px]">
            <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <span className="text-xs text-gray-500">{progress.completed}/{progress.total}</span>
          </div>
        )}
        {elapsed && (
          <span className="text-xs text-gray-400">{formatDuration(elapsed)}</span>
        )}
        {/* 操作按钮 */}
        {isJob && task.status === 'running' && (
          <button onClick={(e) => { e.stopPropagation(); pauseTask(task.id) }}
            className="text-xs text-yellow-600 hover:underline">暂停</button>
        )}
        {isJob && task.status === 'paused' && (
          <button onClick={(e) => { e.stopPropagation(); resumeTask(task.id) }}
            className="text-xs text-blue-600 hover:underline">继续</button>
        )}
        {isJob && ['pending', 'running', 'paused'].includes(task.status) && (
          <button onClick={(e) => { e.stopPropagation(); cancelTask(task.id) }}
            className="text-xs text-red-500 hover:underline">取消</button>
        )}
        {isJob && task.status === 'completed' && task.idiom && (
          <a href="/library" className="text-xs text-blue-600 hover:underline">📖 查看绘本</a>
        )}
      </div>

      {/* 子任务列表（展开时显示） */}
      {isJob && expanded && children.length > 0 && (
        <div className="border-t border-gray-100 bg-gray-50 py-2">
          {children.map(child => (
            <ChildTaskRow key={child.id} task={child} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `npx tsc --noEmit`
Expected: PASS（如果还有其他文件错误，先记录后续修复）

- [ ] **Step 3: Commit**

```bash
git add components/TaskCard.tsx
git commit -m "refactor: TaskCard 区分主任务/子任务渲染"
```

---

### Task 4: 重构 TaskQueue 组件

**Files:**
- Modify: `components/TaskQueue.tsx`

- [ ] **Step 1: 重写 TaskQueue.tsx，使用主任务手风琴**

```tsx
'use client'

import { useState } from 'react'
import { useTaskStore } from '@/lib/task-store'
import { TaskCard } from './TaskCard'

interface TaskQueueProps {
  showHeader?: boolean
  showStats?: boolean
  compact?: boolean
}

export function TaskQueue({ showHeader = true, showStats = true, compact = false }: TaskQueueProps) {
  const { getJobQueue, pauseAll, resumeAll, cancelAll, clearCompleted } = useTaskStore()
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set())

  const jobs = getJobQueue()

  const runningJobs = jobs.filter(j => j.status === 'running')
  const pendingJobs = jobs.filter(j => j.status === 'pending')
  const pausedJobs = jobs.filter(j => j.status === 'paused')
  const completedJobs = jobs.filter(j => j.status === 'completed' || j.status === 'cancelled')
  const failedJobs = jobs.filter(j => j.status === 'failed')

  const hasActiveJobs = runningJobs.length > 0 || pendingJobs.length > 0 || pausedJobs.length > 0

  const toggleExpand = (jobId: string) => {
    setExpandedJobs(prev => {
      const next = new Set(prev)
      next.has(jobId) ? next.delete(jobId) : next.add(jobId)
      return next
    })
  }

  const maxItems = compact ? 3 : 10

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      {showHeader && (
        <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">📋 任务队列</h2>
            <p className="text-white/70 text-xs mt-0.5">
              {jobs.length} 个任务 | {completedJobs.length} 完成 | {failedJobs.length} 失败
            </p>
          </div>
          {hasActiveJobs && (
            <div className="flex gap-2">
              {runningJobs.length > 0 && (
                <button onClick={pauseAll} className="px-2 py-1 text-xs bg-white/20 text-white rounded hover:bg-white/30">
                  ⏸ 全部暂停
                </button>
              )}
              {pausedJobs.length > 0 && (
                <button onClick={resumeAll} className="px-2 py-1 text-xs bg-white/20 text-white rounded hover:bg-white/30">
                  ▶ 全部继续
                </button>
              )}
              <button onClick={cancelAll} className="px-2 py-1 text-xs bg-red-500/80 text-white rounded hover:bg-red-500">
                ✕ 取消全部
              </button>
            </div>
          )}
        </div>
      )}

      {showStats && jobs.length > 0 && (
        <div className="grid grid-cols-5 gap-2 p-3 bg-gray-50 border-b border-gray-100 text-center">
          <div><div className="text-lg font-bold text-yellow-500">{pendingJobs.length}</div><div className="text-xs text-gray-500">等待</div></div>
          <div><div className="text-lg font-bold text-blue-500">{runningJobs.length + pausedJobs.length}</div><div className="text-xs text-gray-500">执行中</div></div>
          <div><div className="text-lg font-bold text-green-500">{completedJobs.length}</div><div className="text-xs text-gray-500">完成</div></div>
          <div><div className="text-lg font-bold text-red-500">{failedJobs.length}</div><div className="text-xs text-gray-500">失败</div></div>
          <div><div className="text-lg font-bold text-gray-500">{jobs.length}</div><div className="text-xs text-gray-500">总计</div></div>
        </div>
      )}

      <div className="p-3 space-y-2 max-h-[400px] overflow-y-auto">
        {jobs.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <div className="text-3xl mb-2">📭</div>
            <p>暂无任务</p>
          </div>
        ) : (
          <>
            {/* 运行中 */}
            {runningJobs.slice(0, maxItems).map(job => (
              <TaskCard key={job.id} task={job} expanded={expandedJobs.has(job.id)} onToggle={() => toggleExpand(job.id)} />
            ))}
            {/* 暂停 */}
            {pausedJobs.slice(0, maxItems).map(job => (
              <TaskCard key={job.id} task={job} expanded={expandedJobs.has(job.id)} onToggle={() => toggleExpand(job.id)} />
            ))}
            {/* 等待中 */}
            {pendingJobs.slice(0, maxItems).map(job => (
              <TaskCard key={job.id} task={job} expanded={expandedJobs.has(job.id)} onToggle={() => toggleExpand(job.id)} />
            ))}
            {/* 失败 */}
            {failedJobs.slice(0, maxItems).map(job => (
              <TaskCard key={job.id} task={job} expanded={expandedJobs.has(job.id)} onToggle={() => toggleExpand(job.id)} />
            ))}
            {/* 已完成 */}
            {completedJobs.slice(0, maxItems).map(job => (
              <TaskCard key={job.id} task={job} expanded={expandedJobs.has(job.id)} onToggle={() => toggleExpand(job.id)} />
            ))}
          </>
        )}
      </div>

      {completedJobs.length > 0 && (
        <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
          <button onClick={clearCompleted} className="text-xs text-gray-500 hover:text-gray-700">
            🧹 清除已完成
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add components/TaskQueue.tsx
git commit -m "refactor: TaskQueue 使用主任务手风琴交互"
```

---

### Task 5: 更新 TaskManager 组件

**Files:**
- Modify: `components/TaskManager.tsx`

- [ ] **Step 1: 更新 TaskManager 适配新模型**

修改 `TaskManager.tsx`，将 `tasks` 替换为 `getJobQueue()`，排序和过滤基于主任务：

```tsx
'use client'

import { useState } from 'react'
import { useTaskStore, type Task, type TaskStatus } from '@/lib/task-store'
import { TaskCard } from './TaskCard'

interface TaskManagerProps {
  onTaskSelect?: (task: Task) => void
}

export function TaskManager({ onTaskSelect }: TaskManagerProps) {
  const { getJobQueue, pauseAll, resumeAll, cancelAll, clearCompleted } = useTaskStore()
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all')
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set())

  const jobs = getJobQueue()
  const filtered = filter === 'all' ? jobs : jobs.filter(j => j.status === filter)

  const stats = {
    total: jobs.length,
    running: jobs.filter(j => j.status === 'running').length,
    pending: jobs.filter(j => j.status === 'pending').length,
    paused: jobs.filter(j => j.status === 'paused').length,
    completed: jobs.filter(j => j.status === 'completed').length,
    failed: jobs.filter(j => j.status === 'failed').length,
    cancelled: jobs.filter(j => j.status === 'cancelled').length,
  }

  const statusLabels: Record<string, string> = {
    all: '全部', pending: '等待中', running: '执行中', paused: '已暂停',
    completed: '已完成', failed: '失败', cancelled: '已取消',
  }

  const toggleExpand = (jobId: string) => {
    setExpandedJobs(prev => {
      const next = new Set(prev)
      next.has(jobId) ? next.delete(jobId) : next.add(jobId)
      return next
    })
  }

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      <div className="bg-gradient-to-r from-gray-700 to-gray-900 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">⚙️ 任务管理器</h2>
            <p className="text-white/70 text-xs">共 {stats.total} 个任务</p>
          </div>
          <div className="flex gap-2">
            {stats.running > 0 && (
              <button onClick={pauseAll} className="px-2 py-1 text-xs bg-yellow-500/80 text-white rounded hover:bg-yellow-500">⏸ 全部暂停</button>
            )}
            {stats.paused > 0 && (
              <button onClick={resumeAll} className="px-2 py-1 text-xs bg-blue-500/80 text-white rounded hover:bg-blue-500">▶ 全部继续</button>
            )}
            {(stats.running > 0 || stats.pending > 0 || stats.paused > 0) && (
              <button onClick={cancelAll} className="px-2 py-1 text-xs bg-red-500/80 text-white rounded hover:bg-red-500">✕ 全部取消</button>
            )}
            {stats.completed > 0 && (
              <button onClick={clearCompleted} className="px-2 py-1 text-xs bg-gray-500/80 text-white rounded hover:bg-gray-500">🧹 清除已完成</button>
            )}
          </div>
        </div>
      </div>

      <div className="p-3 border-b border-gray-100">
        <select value={filter} onChange={e => setFilter(e.target.value as TaskStatus | 'all')}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-md">
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="p-3 space-y-2 max-h-[500px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <div className="text-3xl mb-2">📭</div><p>暂无任务</p>
          </div>
        ) : filtered.map(job => (
          <TaskCard key={job.id} task={job} expanded={expandedJobs.has(job.id)} onToggle={() => toggleExpand(job.id)} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/TaskManager.tsx
git commit -m "refactor: TaskManager 适配主/子任务模型"
```

---

### Task 6: 首页多选 + 批量生成

**Files:**
- Modify: `components/IdiomSelector.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: IdiomSelector 支持多选**

修改 `IdiomSelector.tsx`，添加多选状态和批量生成按钮：

在组件内添加：
```typescript
const [selectedIdioms, setSelectedIdioms] = useState<Set<string>>(new Set())

const toggleIdiom = (idiom: string) => {
  setSelectedIdioms(prev => {
    const next = new Set(prev)
    next.has(idiom) ? next.delete(idiom) : next.add(idiom)
    return next
  })
}

const handleBatchGenerate = () => {
  if (selectedIdioms.size === 0) return
  // 通过回调通知父组件
  onBatchGenerate?.(Array.from(selectedIdioms))
}
```

修改成语按钮渲染，增加选中状态：
```tsx
<button
  key={item.idiom}
  onClick={() => toggleIdiom(item.idiom)}
  className={`p-3 rounded-lg text-sm font-medium transition-all relative ${
    selectedIdioms.has(item.idiom)
      ? 'bg-blue-600 text-white shadow-md scale-105 ring-2 ring-blue-300'
      : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
  }`}
>
  {item.idiom}
  {selectedIdioms.has(item.idiom) && (
    <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">✓</span>
  )}
  {existingIdioms.has(item.idiom) && !selectedIdioms.has(item.idiom) && (
    <span className="absolute -top-1 -right-1 bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">✓</span>
  )}
</button>
```

添加 `onBatchGenerate` 回调到 props 接口。

- [ ] **Step 2: 更新 app/page.tsx 集成批量生成**

```tsx
'use client'

import { useState } from 'react'
import { IdiomSelector } from '@/components/IdiomSelector'
import { TaskQueue } from '@/components/TaskQueue'
import { useTaskStore } from '@/lib/task-store'
import { TaskExecutor } from '@/lib/task-executor'

export default function Home() {
  const { createJobs } = useTaskStore()
  const [executor] = useState(() => new TaskExecutor())

  const handleBatchGenerate = (idioms: string[]) => {
    createJobs(idioms)
    executor.start()
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-secondary/30 to-background">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <IdiomSelector onBatchGenerate={handleBatchGenerate} />
          </div>
          <div className="lg:col-span-1">
            <TaskQueue showHeader={true} showStats={true} compact={true} />
          </div>
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: 验证编译**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add components/IdiomSelector.tsx app/page.tsx
git commit -m "feat: 首页支持多选成语批量生成"
```

---

### Task 7: 重构 generate 页面

**Files:**
- Modify: `app/generate/page.tsx`

- [ ] **Step 1: 简化 generate/page.tsx**

generate 页面保留为单个成语的快速生成入口，但改用 TaskExecutor：

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { useTaskStore } from '@/lib/task-store'
import { TaskExecutor } from '@/lib/task-executor'
import { TaskQueue } from '@/components/TaskQueue'

export default function GeneratePage() {
  const router = useRouter()
  const { currentIdiom } = useAppStore()
  const { createJob } = useTaskStore()
  const [executor] = useState(() => new TaskExecutor())

  useEffect(() => {
    if (!currentIdiom) {
      router.push('/')
      return
    }
    const jobId = createJob(currentIdiom)
    executor.start()
  }, [currentIdiom])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-primary">⏳ 正在生成绘本</h1>
          <p className="mt-2 text-lg text-gray-600">{currentIdiom}</p>
        </div>
        <TaskQueue showHeader={true} showStats={true} />
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/generate/page.tsx
git commit -m "refactor: generate 页面改用 TaskExecutor 驱动"
```

---

### Task 8: IndexedDB 持久化

**Files:**
- Modify: `lib/db.ts`
- Modify: `lib/task-store.ts`

- [ ] **Step 1: db.ts 新增 tasks 表**

在 `IdiomPictureBookDB` 中添加 tasks 表：

```typescript
// lib/db.ts
export class IdiomPictureBookDB extends Dexie {
  pictureBooks!: Table<PictureBook>
  scenes!: Table<Scene & { bookId: string }>
  tasks!: Table<Task>  // 新增

  constructor() {
    super('idiom-picture-book-db')
    this.version(2).stores({  // 版本号从 1 升到 2
      pictureBooks: 'id, idiom, createdAt',
      scenes: 'id, bookId, imageHash',
      tasks: 'id, parentId, type, status, idiom',  // 新增
    })
  }
}
```

- [ ] **Step 2: db.ts 新增任务持久化函数**

```typescript
// lib/db.ts
export async function saveTasks(tasks: Task[]): Promise<void> {
  await db.tasks.bulkPut(tasks)
}

export async function loadTasks(): Promise<Task[]> {
  return db.tasks.toArray()
}

export async function clearTasks(): Promise<void> {
  await db.tasks.clear()
}
```

- [ ] **Step 3: task-store.ts 新增持久化逻辑**

在 store 中添加 `persistTasks` 和 `loadPersistedTasks`：

```typescript
// 在 store 的 actions 中添加
persistTasks: () => {
  const { tasks } = get()
  saveTasks(tasks).catch(console.error)
},

loadPersistedTasks: async () => {
  const tasks = await loadTasks()
  if (tasks.length === 0) return
  // 恢复任务，但将 running 状态标记为 failed（页面刷新意味着中断）
  const restored = tasks.map(t => ({
    ...t,
    status: t.status === 'running' ? 'failed' as TaskStatus : t.status,
    error: t.status === 'running' ? '页面刷新，执行中断' : t.error,
  }))
  set({ tasks: restored })
},
```

在 `updateTask`、`createJob`、`addChildTasks` 末尾自动调用 `get().persistTasks()`。

- [ ] **Step 4: 首页加载时恢复任务**

在 `app/page.tsx` 中添加：

```typescript
useEffect(() => {
  useTaskStore.getState().loadPersistedTasks()
}, [])
```

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts lib/task-store.ts app/page.tsx
git commit -m "feat: 任务队列持久化到 IndexedDB"
```

---

### Task 9: Prompt 优化

**Files:**
- Modify: `app/actions/decompose.ts`

- [ ] **Step 1: 修改 decompose.ts 的 prompt 模板**

在 USER_PROMPT_TEMPLATE 中增加构图指令要求：

```typescript
const USER_PROMPT_TEMPLATE = (idiom: string) =>
  `请将成语「${idiom}」的故事拆分为 6 个关键场景。

要求：
1. 每个场景需要包含：标题、场景描述、旁白文本（适合朗读给孩子听）
2. 场景要按故事发展顺序排列，形成完整的叙事弧线
3. 场景描述要具体、生动，适合 AI 图像生成
4. 旁白文本要简洁、有韵律感，适合亲子朗读
5. 整体风格要适合 3-8 岁儿童
6. prompt 字段必须是英文，用于 AI 图像生成
7. 所有场景必须保持统一的画风和色调，确保视觉一致性
8. 所有场景中的主要角色必须保持一致的外貌特征，确保角色识别度
9. compositionHint 字段必须是英文，描述该场景的构图方式（如 close-up shot, wide angle, bird's eye view, medium shot, over-the-shoulder, low angle 等），每个场景的构图必须不同

请严格以以下 JSON 格式返回，不要包含任何其他内容：
{
  "meaning": "成语的含义解释",
  "characterDescription": "主要角色的统一外貌描述（英文，用于所有场景的prompt）",
  "styleDescription": "统一的画风和色调描述（英文，用于所有场景的prompt）",
  "scenes": [
    {
      "title": "场景标题",
      "description": "场景描述",
      "prompt": "English prompt for AI image generation, must include characterDescription and styleDescription",
      "compositionHint": "English composition instruction, e.g. close-up shot, wide angle scene, bird's eye view, medium shot",
      "narration": "旁白文本"
    }
  ]
}`
```

- [ ] **Step 2: 修改返回值处理，包含 compositionHint**

```typescript
return {
  idiom,
  meaning: data.meaning,
  scenes: data.scenes.map((s: any, i: number) => {
    let prompt = s.prompt || `A cartoon scene for ${idiom} story`
    
    if (characterDescription) {
      prompt = `${characterDescription}, ${prompt}`
    }
    
    // 插入构图指令
    const compositionHint = s.compositionHint || ''
    if (compositionHint) {
      prompt = `${prompt}, ${compositionHint}`
    }
    
    if (styleDescription) {
      prompt = `${prompt}, ${styleDescription}`
    }

    return {
      id: i + 1,
      title: s.title || `场景 ${i + 1}`,
      description: s.description || '',
      prompt: prompt,
      narration: s.narration || '',
      compositionHint,
    }
  }),
}
```

- [ ] **Step 3: Commit**

```bash
git add app/actions/decompose.ts
git commit -m "feat: prompt 增加 compositionHint 构图指令"
```

---

### Task 10: 清理旧代码 + 最终验证

**Files:**
- Remove: `components/ProgressBar.tsx` (已被 TaskQueue/TaskCard 替代)
- Modify: `lib/task-store.ts` (移除旧的 `addTask` 等不再需要的方法，如果有)

- [ ] **Step 1: 确认 ProgressBar 不再被引用**

Run: `grep -r "ProgressBar" --include="*.tsx" --include="*.ts" app/ components/`
Expected: 无结果（generate/page.tsx 已不再导入）

- [ ] **Step 2: 全局 TypeScript 检查**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: 构建验证**

Run: `npm run build`
Expected: 成功，无错误

- [ ] **Step 4: 删除 ProgressBar.tsx（如果不再使用）**

```bash
rm components/ProgressBar.tsx
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: 清理旧代码，最终验证通过"
```
