# 成语绘本工坊 Web 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个面向亲子用户的成语绘本生成平台，支持 LLM 场景拆分、实时图像生成、翻页阅读、视频生成和 PDF 导出。

**Architecture:** Next.js App Router + Server Actions 保护 API Key，IndexedDB 本地存储图像 blob，Agnes API 统一提供 LLM、图像和视频能力。

**Tech Stack:** Next.js 14, React 18, Tailwind CSS, shadcn/ui, Dexie.js, react-pageflip, jsPDF, Zustand

**项目目录:** `/Users/mk/work/child/idiom-picture-book-web`

---

## Task 1: 项目初始化

**Files:**
- Create: `idiom-picture-book-web/package.json`
- Create: `idiom-picture-book-web/next.config.js`
- Create: `idiom-picture-book-web/tsconfig.json`
- Create: `idiom-picture-book-web/tailwind.config.ts`
- Create: `idiom-picture-book-web/postcss.config.js`
- Create: `idiom-picture-book-web/.env.local`
- Create: `idiom-picture-book-web/.gitignore`
- Create: `idiom-picture-book-web/app/layout.tsx`
- Create: `idiom-picture-book-web/app/page.tsx`
- Create: `idiom-picture-book-web/app/globals.css`

- [ ] **Step 1: 创建项目目录并初始化**

```bash
mkdir -p /Users/mk/work/child/idiom-picture-book-web
cd /Users/mk/work/child/idiom-picture-book-web
```

- [ ] **Step 2: 创建 package.json**

```json
{
  "name": "idiom-picture-book-web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "dexie": "^3.2.0",
    "dexie-react-hooks": "^1.1.0",
    "react-pageflip": "^2.0.0",
    "jspdf": "^2.5.0",
    "html2canvas": "^1.4.0",
    "zustand": "^4.4.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.0.0",
    "lucide-react": "^0.300.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/react": "^18.0.0",
    "@types/node": "^20.0.0",
    "tailwindcss": "^3.3.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0"
  }
}
```

- [ ] **Step 3: 创建 next.config.js**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['apihub.agnes-ai.com'],
  },
}

module.exports = nextConfig
```

- [ ] **Step 4: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 5: 创建 tailwind.config.ts**

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#fcb69f',
        secondary: '#ffecd2',
        accent: '#f093fb',
        success: '#4caf50',
        background: '#faf7f5',
      },
      borderRadius: {
        'card': '16px',
        'button': '25px',
      },
      fontFamily: {
        sans: ['Noto Sans SC', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
```

- [ ] **Step 6: 创建 postcss.config.js**

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 7: 创建 .env.local**

```env
AGNES_API_KEY=your_agnes_api_key_here
```

- [ ] **Step 8: 创建 .gitignore**

```
# dependencies
/node_modules
/.pnp
.pnp.js

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# local env files
.env*.local

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts

# superpowers
.superpowers/
```

- [ ] **Step 9: 创建 app/globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&display=swap');

:root {
  --foreground-rgb: 0, 0, 0;
  --background-rgb: 250, 247, 245;
}

body {
  color: rgb(var(--foreground-rgb));
  background: rgb(var(--background-rgb));
  font-family: 'Noto Sans SC', sans-serif;
}

/* 童趣绘本风全局样式 */
.card {
  @apply rounded-card shadow-md transition-transform hover:scale-[1.02];
}

.button-primary {
  @apply rounded-button bg-gradient-to-r from-primary to-accent px-6 py-3 text-white font-semibold shadow-lg hover:shadow-xl transition-all;
}
```

- [ ] **Step 10: 创建 app/layout.tsx**

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '成语绘本工坊',
  description: '和宝贝一起创造成语故事',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-background">
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 11: 创建 app/page.tsx（占位）**

```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold text-primary">🎨 成语绘本工坊</h1>
      <p className="mt-4 text-lg text-gray-600">和宝贝一起创造成语故事</p>
    </main>
  )
}
```

- [ ] **Step 12: 安装依赖并验证**

```bash
cd /Users/mk/work/child/idiom-picture-book-web
npm install
npm run dev
```

Expected: 开发服务器启动，访问 http://localhost:3000 显示首页

- [ ] **Step 13: 提交代码**

```bash
git init
git add .
git commit -m "feat: 初始化 Next.js 项目框架"
```

---

## Task 2: Agnes API 统一封装

**Files:**
- Create: `idiom-picture-book-web/lib/agnes-api.ts`
- Create: `idiom-picture-book-web/lib/types.ts`

- [ ] **Step 1: 创建类型定义 lib/types.ts**

```typescript
// 成语分解结果
export interface IdiomDecomposition {
  idiom: string
  meaning: string
  scenes: SceneTemplate[]
}

// 场景模板（LLM 返回）
export interface SceneTemplate {
  title: string
  description: string
  prompt: string
  narration: string
}

// 场景（包含图像）
export interface Scene extends SceneTemplate {
  id: number
  imageBlob?: Blob
  imageHash?: string
  imageUrl?: string
}

// 绘本
export interface PictureBook {
  id: string
  title: string
  idiom: string
  meaning: string
  createdAt: string
  scenes: Scene[]
  videoBlob?: Blob
  videoUrl?: string
}

// Agnes API 响应类型
export interface AgnesChatResponse {
  id: string
  choices: Array<{
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface AgnesImageResponse {
  data: Array<{
    url: string
  }>
}

export interface AgnesVideoTaskResponse {
  id: string
  task_id: string
  video_id: string
  status: string
  progress: number
}

export interface AgnesVideoResultResponse {
  id: string
  video_id: string
  status: string
  progress: number
  remixed_from_video_id?: string
  error?: string
}
```

- [ ] **Step 2: 创建 Agnes API 封装 lib/agnes-api.ts**

```typescript
import type {
  AgnesChatResponse,
  AgnesImageResponse,
  AgnesVideoTaskResponse,
  AgnesVideoResultResponse,
} from './types'

const API_BASE = 'https://apihub.agnes-ai.com/v1'
const API_KEY = process.env.AGNES_API_KEY

if (!API_KEY) {
  console.warn('AGNES_API_KEY is not set')
}

// LLM 对话（场景拆分）
export async function chatCompletion(
  messages: Array<{ role: string; content: string }>
): Promise<AgnesChatResponse> {
  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'agnes-2.0-flash',
      messages,
      temperature: 0.7,
      max_tokens: 2048,
    }),
  })

  if (!response.ok) {
    throw new Error(`Chat API error: ${response.status}`)
  }

  return response.json()
}

// 图像生成
export async function generateImage(
  prompt: string,
  size = '1024x768'
): Promise<AgnesImageResponse> {
  const response = await fetch(`${API_BASE}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'agnes-image-2.1-flash',
      prompt,
      size,
      extra_body: { response_format: 'url' },
    }),
  })

  if (!response.ok) {
    throw new Error(`Image API error: ${response.status}`)
  }

  return response.json()
}

// 创建视频任务（关键帧动画）
export async function createVideoTask(
  imageUrls: string[],
  prompt?: string
): Promise<AgnesVideoTaskResponse> {
  const response = await fetch('https://apihub.agnes-ai.com/v1/videos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'agnes-video-v2.0',
      prompt: prompt || '生成流畅的绘本故事动画，场景之间自然过渡，卡通漫画风格',
      extra_body: {
        image: imageUrls,
        mode: 'keyframes',
      },
      num_frames: 241,
      frame_rate: 24,
    }),
  })

  if (!response.ok) {
    throw new Error(`Video API error: ${response.status}`)
  }

  return response.json()
}

// 查询视频生成状态
export async function getVideoResult(
  videoId: string
): Promise<AgnesVideoResultResponse> {
  const response = await fetch(
    `https://apihub.agnes-ai.com/agnesapi?video_id=${videoId}`,
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
    }
  )

  if (!response.ok) {
    throw new Error(`Video result API error: ${response.status}`)
  }

  return response.json()
}

// 下载图像为 Blob
export async function downloadImageAsBlob(url: string): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Download error: ${response.status}`)
  }
  return response.blob()
}
```

- [ ] **Step 3: 验证编译**

```bash
cd /Users/mk/work/child/idiom-picture-book-web
npm run build
```

Expected: 编译成功，无类型错误

- [ ] **Step 4: 提交代码**

```bash
git add lib/agnes-api.ts lib/types.ts
git commit -m "feat: 添加 Agnes API 统一封装和类型定义"
```

---

## Task 3: IndexedDB 数据库封装

**Files:**
- Create: `idiom-picture-book-web/lib/db.ts`

- [ ] **Step 1: 创建 IndexedDB 封装 lib/db.ts**

```typescript
import Dexie, { type Table } from 'dexie'
import type { PictureBook, Scene } from './types'

export class IdiomPictureBookDB extends Dexie {
  pictureBooks!: Table<PictureBook>
  scenes!: Table<Scene & { bookId: string }>

  constructor() {
    super('idiom-picture-book-db')
    this.version(1).stores({
      pictureBooks: 'id, idiom, createdAt',
      scenes: 'id, bookId, imageHash',
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
```

- [ ] **Step 2: 验证编译**

```bash
npm run build
```

Expected: 编译成功

- [ ] **Step 3: 提交代码**

```bash
git add lib/db.ts
git commit -m "feat: 添加 IndexedDB 数据库封装"
```

---

## Task 4: 成语数据与 Server Actions

**Files:**
- Create: `idiom-picture-book-web/lib/idioms.ts`
- Create: `idiom-picture-book-web/app/actions/decompose.ts`
- Create: `idiom-picture-book-web/app/actions/generate.ts`

- [ ] **Step 1: 创建成语数据 lib/idioms.ts**

```typescript
export interface IdiomInfo {
  idiom: string
  meaning: string
  category: string
}

export const IDIOM_LIST: IdiomInfo[] = [
  { idiom: '画蛇添足', meaning: '比喻做多余的事，反而不恰当', category: '寓言' },
  { idiom: '守株待兔', meaning: '比喻不主动努力，希望得到意外收获', category: '寓言' },
  { idiom: '亡羊补牢', meaning: '比喻出了问题以后想办法补救', category: '寓言' },
  { idiom: '井底之蛙', meaning: '比喻见识狭隘、目光短浅的人', category: '寓言' },
  { idiom: '狐假虎威', meaning: '比喻仰仗别人的权势来欺压人', category: '寓言' },
  { idiom: '掩耳盗铃', meaning: '比喻自己欺骗自己', category: '寓言' },
  { idiom: '刻舟求剑', meaning: '比喻拘泥于成法，不知变通', category: '寓言' },
  { idiom: '愚公移山', meaning: '比喻坚持不懈地改造自然', category: '励志' },
  { idiom: '拔苗助长', meaning: '比喻违反客观规律，急于求成', category: '寓言' },
  { idiom: '叶公好龙', meaning: '比喻自称爱好某事物，其实并不是真爱好', category: '寓言' },
]

export function getIdiomInfo(idiom: string): IdiomInfo | undefined {
  return IDIOM_LIST.find((item) => item.idiom === idiom)
}
```

- [ ] **Step 2: 创建 LLM 场景拆分 Server Action**

```typescript
// app/actions/decompose.ts
'use server'

import { chatCompletion } from '@/lib/agnes-api'
import type { IdiomDecomposition } from '@/lib/types'

const SYSTEM_PROMPT = '你是一位专业的儿童绘本故事策划，擅长将成语故事拆分为适合儿童阅读的场景。请始终以 JSON 格式返回结果。'

const USER_PROMPT_TEMPLATE = (idiom: string) =>
  `请将成语「${idiom}」的故事拆分为 6 个关键场景。

要求：
1. 每个场景需要包含：标题、场景描述（用于生成图像的提示词）、旁白文本（适合朗读给孩子听）
2. 场景要按故事发展顺序排列，形成完整的叙事弧线
3. 场景描述要具体、生动，适合 AI 图像生成
4. 旁白文本要简洁、有韵律感，适合亲子朗读
5. 整体风格要适合 3-8 岁儿童
6. prompt 字段必须是英文，用于 AI 图像生成

请严格以以下 JSON 格式返回，不要包含任何其他内容：
{
  "meaning": "成语的含义解释",
  "scenes": [
    {
      "title": "场景标题",
      "description": "场景描述",
      "prompt": "English prompt for AI image generation, cartoon style",
      "narration": "旁白文本"
    }
  ]
}`

export async function decomposeIdiom(idiom: string): Promise<IdiomDecomposition> {
  const result = await chatCompletion([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: USER_PROMPT_TEMPLATE(idiom) },
  ])

  const content = result.choices[0]?.message?.content
  if (!content) {
    throw new Error('LLM 返回内容为空')
  }

  // 尝试解析 JSON（可能包含 markdown 代码块）
  let jsonStr = content
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim()
  }

  const data = JSON.parse(jsonStr)

  // 验证返回格式
  if (!data.meaning || !Array.isArray(data.scenes) || data.scenes.length !== 6) {
    throw new Error('LLM 返回格式不正确')
  }

  return {
    idiom,
    meaning: data.meaning,
    scenes: data.scenes.map((s: any, i: number) => ({
      id: i + 1,
      title: s.title,
      description: s.description,
      prompt: s.prompt,
      narration: s.narration,
    })),
  }
}
```

- [ ] **Step 3: 创建图像生成 Server Action**

```typescript
// app/actions/generate.ts
'use server'

import { generateImage, downloadImageAsBlob, createVideoTask, getVideoResult } from '@/lib/agnes-api'
import type { Scene } from '@/lib/types'

export async function generateSceneImage(prompt: string): Promise<string> {
  const result = await generateImage(prompt)
  const imageUrl = result.data[0]?.url
  if (!imageUrl) {
    throw new Error('图像生成失败')
  }
  return imageUrl
}

export async function downloadImage(url: string): Promise<ArrayBuffer> {
  const blob = await downloadImageAsBlob(url)
  return blob.arrayBuffer()
}

export async function generateBookVideo(
  imageUrls: string[]
): Promise<{ videoUrl: string }> {
  // 1. 创建视频任务
  const task = await createVideoTask(imageUrls)
  const videoId = task.video_id

  // 2. 轮询等待完成（最多 5 分钟）
  for (let i = 0; i < 30; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10000))
    const result = await getVideoResult(videoId)

    if (result.status === 'completed' && result.remixed_from_video_id) {
      return { videoUrl: result.remixed_from_video_id }
    } else if (result.status === 'failed') {
      throw new Error('视频生成失败')
    }
  }

  throw new Error('视频生成超时')
}
```

- [ ] **Step 4: 验证编译**

```bash
npm run build
```

Expected: 编译成功

- [ ] **Step 5: 提交代码**

```bash
git add lib/idioms.ts app/actions/decompose.ts app/actions/generate.ts
git commit -m "feat: 添加成语数据和 Server Actions"
```

---

## Task 5: Zustand 状态管理

**Files:**
- Create: `idiom-picture-book-web/lib/store.ts`

- [ ] **Step 1: 创建 Zustand store**

```typescript
import { create } from 'zustand'
import type { PictureBook, Scene, SceneTemplate } from './types'
import { v4 as uuidv4 } from 'uuid'

interface AppState {
  // 当前生成中的绘本
  currentIdiom: string | null
  currentMeaning: string | null
  currentScenes: Scene[]
  isDecomposing: boolean
  isGenerating: boolean
  generatingSceneId: number | null
  error: string | null

  // 已保存的绘本
  pictureBooks: PictureBook[]

  // Actions
  setCurrentIdiom: (idiom: string) => void
  setDecomposition: (meaning: string, scenes: SceneTemplate[]) => void
  setSceneImage: (sceneId: number, imageUrl: string, imageBlob: Blob) => void
  setGeneratingScene: (sceneId: number | null) => void
  setDecomposing: (isDecomposing: boolean) => void
  setGenerating: (isGenerating: boolean) => void
  setError: (error: string | null) => void
  saveCurrentBook: () => PictureBook
  reset: () => void
  loadBooks: (books: PictureBook[]) => void
  deleteBook: (id: string) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  currentIdiom: null,
  currentMeaning: null,
  currentScenes: [],
  isDecomposing: false,
  isGenerating: false,
  generatingSceneId: null,
  error: null,
  pictureBooks: [],

  setCurrentIdiom: (idiom) => set({ currentIdiom: idiom, error: null }),

  setDecomposition: (meaning, scenes) =>
    set({
      currentMeaning: meaning,
      currentScenes: scenes.map((s, i) => ({
        ...s,
        id: i + 1,
      })),
    }),

  setSceneImage: (sceneId, imageUrl, imageBlob) =>
    set((state) => ({
      currentScenes: state.currentScenes.map((s) =>
        s.id === sceneId ? { ...s, imageUrl, imageBlob } : s
      ),
    })),

  setGeneratingScene: (sceneId) => set({ generatingSceneId: sceneId }),
  setDecomposing: (isDecomposing) => set({ isDecomposing }),
  setGenerating: (isGenerating) => set({ isGenerating }),
  setError: (error) => set({ error }),

  saveCurrentBook: () => {
    const state = get()
    const book: PictureBook = {
      id: uuidv4(),
      title: state.currentIdiom!,
      idiom: state.currentIdiom!,
      meaning: state.currentMeaning!,
      createdAt: new Date().toISOString(),
      scenes: state.currentScenes,
    }
    set((state) => ({
      pictureBooks: [...state.pictureBooks, book],
    }))
    return book
  },

  reset: () =>
    set({
      currentIdiom: null,
      currentMeaning: null,
      currentScenes: [],
      isDecomposing: false,
      isGenerating: false,
      generatingSceneId: null,
      error: null,
    }),

  loadBooks: (books) => set({ pictureBooks: books }),

  deleteBook: (id) =>
    set((state) => ({
      pictureBooks: state.pictureBooks.filter((b) => b.id !== id),
    })),
}))
```

- [ ] **Step 2: 安装 uuid 依赖**

```bash
npm install uuid
npm install -D @types/uuid
```

- [ ] **Step 3: 验证编译**

```bash
npm run build
```

Expected: 编译成功

- [ ] **Step 4: 提交代码**

```bash
git add lib/store.ts package.json
git commit -m "feat: 添加 Zustand 状态管理"
```

---

## Task 6: 首页 - 成语选择器

**Files:**
- Create: `idiom-picture-book-web/components/IdiomSelector.tsx`
- Modify: `idiom-picture-book-web/app/page.tsx`

- [ ] **Step 1: 创建成语选择器组件**

```tsx
// components/IdiomSelector.tsx
'use client'

import { useState } from 'react'
import { IDIOM_LIST } from '@/lib/idioms'
import { useAppStore } from '@/lib/store'
import { useRouter } from 'next/navigation'

export function IdiomSelector() {
  const [customIdiom, setCustomIdiom] = useState('')
  const [selectedIdiom, setSelectedIdiom] = useState<string | null>(null)
  const setCurrentIdiom = useAppStore((s) => s.setCurrentIdiom)
  const router = useRouter()

  const handleSelect = (idiom: string) => {
    setSelectedIdiom(idiom)
    setCustomIdiom('')
  }

  const handleCustomInput = (value: string) => {
    setCustomIdiom(value)
    setSelectedIdiom(null)
  }

  const handleStart = () => {
    const idiom = selectedIdiom || customIdiom.trim()
    if (!idiom) return
    setCurrentIdiom(idiom)
    router.push('/generate')
  }

  const activeIdiom = selectedIdiom || customIdiom.trim()

  return (
    <div className="w-full max-w-2xl mx-auto space-y-8">
      {/* 标题 */}
      <div className="text-center">
        <h1 className="text-4xl font-bold text-primary">🎨 成语绘本工坊</h1>
        <p className="mt-2 text-lg text-gray-600">和宝贝一起创造成语故事</p>
      </div>

      {/* 成语网格 */}
      <div className="bg-white rounded-card p-6 shadow-md">
        <h2 className="text-lg font-semibold mb-4 text-gray-800">🎭 选择成语</h2>
        <div className="grid grid-cols-5 gap-3">
          {IDIOM_LIST.map((item) => (
            <button
              key={item.idiom}
              onClick={() => handleSelect(item.idiom)}
              className={`p-3 rounded-lg text-sm font-medium transition-all ${
                selectedIdiom === item.idiom
                  ? 'bg-primary text-white shadow-md scale-105'
                  : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
              }`}
            >
              {item.idiom}
            </button>
          ))}
        </div>
      </div>

      {/* 自定义输入 */}
      <div className="bg-white rounded-card p-6 shadow-md">
        <h2 className="text-lg font-semibold mb-4 text-gray-800">✏️ 或输入自定义成语</h2>
        <input
          type="text"
          value={customIdiom}
          onChange={(e) => handleCustomInput(e.target.value)}
          placeholder="输入一个成语..."
          className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
        />
      </div>

      {/* 开始按钮 */}
      <div className="flex justify-center">
        <button
          onClick={handleStart}
          disabled={!activeIdiom}
          className="button-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          🚀 开始生成绘本
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 更新首页 app/page.tsx**

```tsx
import { IdiomSelector } from '@/components/IdiomSelector'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gradient-to-b from-secondary/30 to-background">
      <IdiomSelector />
    </main>
  )
}
```

- [ ] **Step 3: 验证页面**

```bash
npm run dev
```

Expected: 访问 http://localhost:3000 显示成语选择器，可以点击成语或输入自定义成语

- [ ] **Step 4: 提交代码**

```bash
git add components/IdiomSelector.tsx app/page.tsx
git commit -m "feat: 添加首页成语选择器"
```

---

## Task 7: 生成进度页

**Files:**
- Create: `idiom-picture-book-web/components/ProgressBar.tsx`
- Create: `idiom-picture-book-web/components/SceneCard.tsx`
- Create: `idiom-picture-book-web/app/generate/page.tsx`

- [ ] **Step 1: 创建进度条组件**

```tsx
// components/ProgressBar.tsx
'use client'

interface ProgressBarProps {
  current: number
  total: number
  label?: string
}

export function ProgressBar({ current, total, label }: ProgressBarProps) {
  const percentage = Math.round((current / total) * 100)

  return (
    <div className="w-full space-y-2">
      <div className="flex justify-between text-sm text-gray-600">
        <span>{label}</span>
        <span>{current} / {total}</span>
      </div>
      <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 创建场景卡片组件**

```tsx
// components/SceneCard.tsx
'use client'

import type { Scene } from '@/lib/types'

interface SceneCardProps {
  scene: Scene
  status: 'waiting' | 'generating' | 'completed'
}

export function SceneCard({ scene, status }: SceneCardProps) {
  const statusConfig = {
    waiting: { bg: 'bg-gray-100', icon: '⏸️', text: '等待中', textColor: 'text-gray-500' },
    generating: { bg: 'bg-yellow-50', icon: '⏳', text: '生成中...', textColor: 'text-yellow-600' },
    completed: { bg: 'bg-green-50', icon: '✅', text: '已完成', textColor: 'text-green-600' },
  }

  const config = statusConfig[status]

  return (
    <div className={`${config.bg} rounded-card p-4 transition-all`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{config.icon}</span>
        <span className={`text-sm font-medium ${config.textColor}`}>{config.text}</span>
      </div>
      <h3 className="font-semibold text-gray-800">{scene.title}</h3>
      <p className="text-sm text-gray-600 mt-1 line-clamp-2">{scene.description}</p>
    </div>
  )
}
```

- [ ] **Step 3: 创建生成进度页**

```tsx
// app/generate/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { decomposeIdiom } from '@/app/actions/decompose'
import { generateSceneImage, downloadImage } from '@/app/actions/generate'
import { savePictureBook, saveSceneImage } from '@/lib/db'
import { ProgressBar } from '@/components/ProgressBar'
import { SceneCard } from '@/components/SceneCard'

export default function GeneratePage() {
  const router = useRouter()
  const {
    currentIdiom,
    currentScenes,
    isDecomposing,
    isGenerating,
    generatingSceneId,
    error,
    setDecomposition,
    setSceneImage,
    setDecomposing,
    setGenerating,
    setGeneratingScene,
    setError,
    saveCurrentBook,
  } = useAppStore()

  const [completedCount, setCompletedCount] = useState(0)

  useEffect(() => {
    if (!currentIdiom) {
      router.push('/')
      return
    }

    generateBook()
  }, [currentIdiom])

  const generateBook = async () => {
    try {
      // 阶段 1: LLM 场景拆分
      setDecomposing(true)
      const decomposition = await decomposeIdiom(currentIdiom!)
      setDecomposition(decomposition.meaning, decomposition.scenes)
      setDecomposing(false)

      // 阶段 2: 逐个生成图像
      setGenerating(true)
      for (let i = 0; i < decomposition.scenes.length; i++) {
        const scene = decomposition.scenes[i]
        setGeneratingScene(i + 1)

        // 生成图像
        const imageUrl = await generateSceneImage(scene.prompt)

        // 下载图像
        const imageBuffer = await downloadImage(imageUrl)
        const imageBlob = new Blob([imageBuffer])

        // 保存到 store
        setSceneImage(i + 1, imageUrl, imageBlob)
        setCompletedCount(i + 1)
      }

      setGenerating(false)
      setGeneratingScene(null)

      // 保存绘本到 IndexedDB
      const book = saveCurrentBook()
      await savePictureBook(book)

      // 保存图像到 IndexedDB
      for (const scene of book.scenes) {
        if (scene.imageBlob) {
          await saveSceneImage(book.id, scene.id, scene.imageBlob)
        }
      }

      // 跳转到阅读页
      router.push(`/read/${book.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败')
      setDecomposing(false)
      setGenerating(false)
      setGeneratingScene(null)
    }
  }

  if (!currentIdiom) {
    return null
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-8">
        {/* 标题 */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-primary">⏳ 正在生成绘本</h1>
          <p className="mt-2 text-lg text-gray-600">{currentIdiom}</p>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-card p-4 text-red-700">
            ❌ {error}
          </div>
        )}

        {/* 阶段 1: LLM 场景拆分 */}
        {isDecomposing && (
          <div className="bg-white rounded-card p-6 shadow-md text-center">
            <div className="text-4xl mb-4">🤖</div>
            <h2 className="text-xl font-semibold mb-2">AI 正在构思故事...</h2>
            <p className="text-gray-600">正在将「{currentIdiom}」拆分为 6 个精彩场景</p>
          </div>
        )}

        {/* 阶段 2: 图像生成 */}
        {currentScenes.length > 0 && (
          <>
            <div className="bg-white rounded-card p-6 shadow-md">
              <ProgressBar
                current={completedCount}
                total={6}
                label="图像生成进度"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {currentScenes.map((scene) => (
                <SceneCard
                  key={scene.id}
                  scene={scene}
                  status={
                    generatingSceneId === scene.id
                      ? 'generating'
                      : scene.imageUrl
                      ? 'completed'
                      : 'waiting'
                  }
                />
              ))}
            </div>
          </>
        )}

        {/* 趣味知识 */}
        <div className="bg-blue-50 rounded-card p-6 border border-blue-100">
          <h3 className="font-semibold text-blue-800 mb-2">💡 小知识</h3>
          <p className="text-blue-700 text-sm">
            成语是中华文化的瑰宝，每个成语背后都有一个有趣的故事。
            通过漫画绘本的形式，可以让孩子更容易理解成语的含义。
          </p>
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 4: 验证生成流程**

```bash
npm run dev
```

Expected: 选择成语后跳转到生成页，显示 LLM 拆分和图像生成进度

- [ ] **Step 5: 提交代码**

```bash
git add components/ProgressBar.tsx components/SceneCard.tsx app/generate/page.tsx
git commit -m "feat: 添加生成进度页"
```

---

## Task 8: 翻页阅读器

**Files:**
- Create: `idiom-picture-book-web/components/BookViewer.tsx`
- Create: `idiom-picture-book-web/app/read/[id]/page.tsx`

- [ ] **Step 1: 创建翻页阅读器组件**

```tsx
// components/BookViewer.tsx
'use client'

import { useState, useCallback, useEffect } from 'react'
import type { PictureBook } from '@/lib/types'

interface BookViewerProps {
  book: PictureBook
}

export function BookViewer({ book }: BookViewerProps) {
  const [currentPage, setCurrentPage] = useState(0)
  const totalScenes = book.scenes.length

  const goToNext = useCallback(() => {
    setCurrentPage((prev) => Math.min(prev + 1, totalScenes - 1))
  }, [totalScenes])

  const goToPrev = useCallback(() => {
    setCurrentPage((prev) => Math.max(prev - 1, 0))
  }, [])

  // 键盘事件
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        goToNext()
      } else if (e.key === 'ArrowLeft') {
        goToPrev()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goToNext, goToPrev])

  const scene = book.scenes[currentPage]
  const imageSrc = scene.imageUrl
    ? scene.imageUrl
    : scene.imageBlob
    ? URL.createObjectURL(scene.imageBlob)
    : null

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* 工具栏 */}
      <div className="flex justify-between items-center">
        <button onClick={() => window.history.back()} className="text-gray-600 hover:text-gray-800">
          ← 返回
        </button>
        <h2 className="text-xl font-bold text-gray-800">{book.title}</h2>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-blue-100 text-blue-700 rounded-button text-sm hover:bg-blue-200">
            🔊 朗读
          </button>
          <button className="px-4 py-2 bg-green-100 text-green-700 rounded-button text-sm hover:bg-green-200">
            📄 PDF
          </button>
        </div>
      </div>

      {/* 翻页阅读器 */}
      <div className="flex items-center gap-4">
        <button
          onClick={goToPrev}
          disabled={currentPage === 0}
          className="text-3xl text-gray-400 hover:text-gray-600 disabled:opacity-30"
        >
          ◀
        </button>

        <div className="flex-1 flex" style={{ perspective: '800px' }}>
          {/* 左页 - 插图 */}
          <div
            className="w-1/2 bg-gradient-to-r from-secondary to-primary/20 rounded-l-card p-6 shadow-lg"
            style={{ transform: 'rotateY(2deg)' }}
          >
            <div className="text-center mb-4">
              <span className="text-sm text-gray-500">第 {currentPage + 1} 幕</span>
              <h3 className="text-xl font-bold text-gray-800">{scene.title}</h3>
            </div>
            {imageSrc && (
              <img
                src={imageSrc}
                alt={scene.title}
                className="w-full h-auto rounded-lg shadow-md"
              />
            )}
          </div>

          {/* 右页 - 文本 */}
          <div
            className="w-1/2 bg-gradient-to-l from-secondary to-primary/20 rounded-r-card p-6 shadow-lg"
            style={{ transform: 'rotateY(-2deg)' }}
          >
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-gray-700 mb-2">📖 场景描述</h4>
                <p className="text-gray-600">{scene.description}</p>
              </div>
              <div className="bg-white/60 rounded-lg p-4">
                <h4 className="font-semibold text-gray-700 mb-2">💬 旁白</h4>
                <p className="text-gray-800 italic text-lg">&ldquo;{scene.narration}&rdquo;</p>
              </div>
              {currentPage === 0 && (
                <div className="bg-white/60 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-700 mb-2">💡 成语含义</h4>
                  <p className="text-gray-600">{book.meaning}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={goToNext}
          disabled={currentPage === totalScenes - 1}
          className="text-3xl text-primary hover:text-accent disabled:opacity-30"
        >
          ▶
        </button>
      </div>

      {/* 页码指示器 */}
      <div className="flex justify-center items-center gap-4">
        <div className="flex gap-2">
          {book.scenes.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentPage(i)}
              className={`w-3 h-3 rounded-full transition-all ${
                i === currentPage ? 'bg-primary scale-125' : 'bg-gray-300'
              }`}
            />
          ))}
        </div>
        <span className="text-sm text-gray-500">
          {currentPage + 1} / {totalScenes}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 创建阅读页面**

```tsx
// app/read/[id]/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getPictureBook } from '@/lib/db'
import { BookViewer } from '@/components/BookViewer'
import type { PictureBook } from '@/lib/types'

export default function ReadPage() {
  const params = useParams()
  const [book, setBook] = useState<PictureBook | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadBook = async () => {
      const id = params.id as string
      const loadedBook = await getPictureBook(id)
      setBook(loadedBook || null)
      setLoading(false)
    }
    loadBook()
  }, [params.id])

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-xl text-gray-600">加载中...</div>
      </main>
    )
  }

  if (!book) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">绘本未找到</h1>
          <a href="/" className="button-primary">返回首页</a>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gradient-to-b from-secondary/30 to-background">
      <BookViewer book={book} />
    </main>
  )
}
```

- [ ] **Step 3: 验证阅读功能**

```bash
npm run dev
```

Expected: 生成完成后自动跳转到阅读页，可以翻页阅读绘本

- [ ] **Step 4: 提交代码**

```bash
git add components/BookViewer.tsx app/read/[id]/page.tsx
git commit -m "feat: 添加翻页阅读器"
```

---

## Task 9: PDF 导出功能

**Files:**
- Create: `idiom-picture-book-web/lib/pdf.ts`

- [ ] **Step 1: 创建 PDF 生成函数**

```typescript
// lib/pdf.ts
import jsPDF from 'jspdf'
import type { PictureBook } from './types'

export async function generatePDF(book: PictureBook): Promise<void> {
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  // 封面页
  pdf.setFillColor(252, 182, 159) // primary color
  pdf.rect(0, 0, pageWidth, pageHeight, 'F')

  pdf.setFontSize(36)
  pdf.setTextColor(255, 255, 255)
  pdf.text(book.title, pageWidth / 2, pageHeight / 2 - 20, { align: 'center' })

  pdf.setFontSize(16)
  pdf.text('成语绘本', pageWidth / 2, pageHeight / 2 + 10, { align: 'center' })

  pdf.setFontSize(12)
  pdf.text(`生成时间: ${new Date(book.createdAt).toLocaleDateString('zh-CN')}`, pageWidth / 2, pageHeight / 2 + 30, { align: 'center' })

  // 场景页
  for (const scene of book.scenes) {
    pdf.addPage()

    // 背景色
    pdf.setFillColor(250, 247, 245)
    pdf.rect(0, 0, pageWidth, pageHeight, 'F')

    // 标题
    pdf.setFontSize(24)
    pdf.setTextColor(51, 51, 51)
    pdf.text(scene.title, pageWidth / 2, 20, { align: 'center' })

    // 插图
    if (scene.imageBlob) {
      const imageUrl = URL.createObjectURL(scene.imageBlob)
      const img = new Image()
      await new Promise((resolve) => {
        img.onload = resolve
        img.src = imageUrl
      })

      const imgWidth = 120
      const imgHeight = (img.height / img.width) * imgWidth
      const imgX = (pageWidth - imgWidth) / 2
      const imgY = 30

      pdf.addImage(img, 'PNG', imgX, imgY, imgWidth, imgHeight)
      URL.revokeObjectURL(imageUrl)
    }

    // 旁白
    pdf.setFontSize(14)
    pdf.setTextColor(102, 102, 102)
    const narrationY = 150
    pdf.text(`"${scene.narration}"`, pageWidth / 2, narrationY, {
      align: 'center',
      maxWidth: pageWidth - 40,
    })
  }

  // 封底页
  pdf.addPage()
  pdf.setFillColor(252, 182, 159)
  pdf.rect(0, 0, pageWidth, pageHeight, 'F')

  pdf.setFontSize(20)
  pdf.setTextColor(255, 255, 255)
  pdf.text('💡 成语含义', pageWidth / 2, pageHeight / 2 - 20, { align: 'center' })

  pdf.setFontSize(16)
  pdf.text(book.meaning, pageWidth / 2, pageHeight / 2 + 10, {
    align: 'center',
    maxWidth: pageWidth - 40,
  })

  // 下载 PDF
  pdf.save(`${book.title}.pdf`)
}
```

- [ ] **Step 2: 在阅读页添加 PDF 导出按钮**

更新 `app/read/[id]/page.tsx`，在工具栏中添加 PDF 导出功能：

```tsx
// 在 BookViewer 组件中添加
const handleExportPDF = async () => {
  const { generatePDF } = await import('@/lib/pdf')
  await generatePDF(book)
}

// 修改 PDF 按钮
<button onClick={handleExportPDF} className="...">
  📄 PDF
</button>
```

- [ ] **Step 3: 验证 PDF 导出**

```bash
npm run dev
```

Expected: 点击 PDF 按钮后下载包含封面、场景和封底的 PDF 文件

- [ ] **Step 4: 提交代码**

```bash
git add lib/pdf.ts
git commit -m "feat: 添加 PDF 导出功能"
```

---

## Task 10: 视频生成功能

**Files:**
- Create: `idiom-picture-book-web/components/VideoGenerator.tsx`
- Modify: `idiom-picture-book-web/app/read/[id]/page.tsx`

- [ ] **Step 1: 创建视频生成组件**

```tsx
// components/VideoGenerator.tsx
'use client'

import { useState } from 'react'
import { generateBookVideo } from '@/app/actions/generate'

interface VideoGeneratorProps {
  imageUrls: string[]
  onVideoGenerated: (videoUrl: string) => void
}

export function VideoGenerator({ imageUrls, onVideoGenerated }: VideoGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    setIsGenerating(true)
    setError(null)

    try {
      const { videoUrl } = await generateBookVideo(imageUrls)
      onVideoGenerated(videoUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : '视频生成失败')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="space-y-4">
      <button
        onClick={handleGenerate}
        disabled={isGenerating}
        className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-button font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
      >
        {isGenerating ? '⏳ 生成中...' : '🎬 生成视频'}
      </button>

      {isGenerating && (
        <div className="bg-purple-50 rounded-card p-4 text-center">
          <p className="text-purple-700">正在生成视频，请稍候...</p>
          <p className="text-sm text-purple-500 mt-1">预计需要 2-5 分钟</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 rounded-card p-4 text-red-700">
          ❌ {error}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 在阅读页集成视频生成**

更新 `app/read/[id]/page.tsx`：

```tsx
import { VideoGenerator } from '@/components/VideoGenerator'

// 在 BookViewer 组件中添加
const [videoUrl, setVideoUrl] = useState<string | null>(null)

// 获取所有场景的图像 URL
const imageUrls = book.scenes
  .map((s) => s.imageUrl)
  .filter((url): url is string => !!url)

// 添加视频生成按钮和播放器
{imageUrls.length > 0 && (
  <VideoGenerator
    imageUrls={imageUrls}
    onVideoGenerated={setVideoUrl}
  />
)}

{videoUrl && (
  <div className="mt-4">
    <video src={videoUrl} controls className="w-full rounded-card" />
    <a
      href={videoUrl}
      download
      className="mt-2 inline-block text-blue-600 hover:underline"
    >
      📥 下载视频
    </a>
  </div>
)}
```

- [ ] **Step 3: 验证视频生成**

```bash
npm run dev
```

Expected: 点击「生成视频」按钮后，等待 2-5 分钟，显示生成的视频

- [ ] **Step 4: 提交代码**

```bash
git add components/VideoGenerator.tsx
git commit -m "feat: 添加视频生成功能"
```

---

## Task 11: 最终集成与优化

**Files:**
- Modify: `idiom-picture-book-web/app/layout.tsx`
- Create: `idiom-picture-book-web/components/Header.tsx`

- [ ] **Step 1: 创建 Header 组件**

```tsx
// components/Header.tsx
'use client'

import Link from 'next/link'

export function Header() {
  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
        <Link href="/" className="text-xl font-bold text-primary">
          🎨 成语绘本工坊
        </Link>
        <nav className="flex gap-4">
          <Link href="/" className="text-gray-600 hover:text-gray-800">
            首页
          </Link>
        </nav>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: 更新根布局**

```tsx
// app/layout.tsx
import type { Metadata } from 'next'
import './globals.css'
import { Header } from '@/components/Header'

export const metadata: Metadata = {
  title: '成语绘本工坊',
  description: '和宝贝一起创造成语故事',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-background">
        <Header />
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 3: 最终构建测试**

```bash
npm run build
```

Expected: 构建成功，无错误

- [ ] **Step 4: 提交最终代码**

```bash
git add .
git commit -m "feat: 完成语绘本工坊 v1.0"
```

---

## 后续规划：TTS 语音朗读（v1.1）

**Files (待创建):**
- Create: `idiom-picture-book-web/lib/tts.ts`
- Create: `idiom-picture-book-web/components/TTSPlayer.tsx`

**实现步骤：**
1. 使用 Web Speech API 封装 TTS 功能
2. 创建朗读控制组件（播放/暂停/语速）
3. 集成到 BookViewer 组件
4. 实现翻页时自动切换朗读
5. 添加朗读高亮同步
