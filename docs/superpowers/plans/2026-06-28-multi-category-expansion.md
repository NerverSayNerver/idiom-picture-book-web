# 多品类扩展实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将成语绘本工坊从单一品类扩展为支持成语、古诗、谚语、儿歌、童话等多个品类的通用绘本平台

**Architecture:** 泛化数据模型 + ContentType 策略模式 + 文件系统存储（public/generated/）+ IndexedDB 仅保留运行时状态

**Tech Stack:** Next.js 14, Zustand, Dexie, Tailwind CSS, Agnes API (LLM/Image)

---

## 文件结构

### 新增文件

| 文件 | 职责 |
|------|------|
| `lib/content-types/types.ts` | 策略接口 `ContentTypeStrategy`、品类枚举 `ContentCategory` 定义 |
| `lib/content-types/index.ts` | 策略注册表 `registry`、`registerStrategy()`、`getStrategy()` |
| `lib/content-types/idiom-strategy.ts` | 成语策略实现（从现有 decompose/recommend 代码提取） |
| `lib/content-types/poetry-strategy.ts` | 古诗策略实现 |
| `lib/content-types/proverb-strategy.ts` | 谚语策略实现 |
| `lib/content-types/nursery-rhyme-strategy.ts` | 儿歌策略实现 |
| `lib/content-types/fairy-tale-strategy.ts` | 童话策略实现 |
| `components/CategoryTabs.tsx` | 顶部品类 Tab 导航组件 |
| `components/ContentSelector.tsx` | 通用内容选择器（取代 IdiomSelector） |

### 修改文件

| 文件 | 改动要点 |
|------|----------|
| `lib/types.ts` | 泛化 `PictureBook`（+category, sourceText）、新增 `ContentCategory`、`ContentInfo` |
| `lib/idioms.ts` | 重命名为 `lib/content-info.ts`，泛化为多品类内容列表 |
| `lib/db.ts` | 移除 pictureBooks/scenes 表，精简为 tasks + recommendedItems |
| `lib/store.ts` | 移除 pictureBooks 管理，添加 category 状态 |
| `lib/task-store.ts` | Task 类型添加 category、sourceText 字段 |
| `lib/task-executor.ts` | decompose 按 category 分发 |
| `app/actions/decompose.ts` | 改为策略化 `decomposeSource(text, category)` |
| `app/actions/recommend.ts` | 改为策略化 `fetchRecommendations(category, exclude)` |
| `app/layout.tsx` | SEO metadata 标题更新 |
| `app/page.tsx` | Tab 导航集成 + 书架分类筛选 |
| `app/read/[id]/page.tsx` | 从文件系统加载 book.json |
| `components/Header.tsx` | 标题「成语绘本工坊」→「绘本工坊」 |
| `components/BookCard.tsx` | 品类徽标 + 时间格式 yyyy-MM-dd HH:mm:ss |
| `components/BookViewer.tsx` | 图片路径适配新目录 |
| `scripts/batch-generate.js` | 完整流水线重构 |

### 删除文件

| 文件 | 原因 |
|------|------|
| `components/IdiomSelector.tsx` | 被 `ContentSelector.tsx` 取代 |
| `public/pre-generated/images/*.png` | 移至 `public/generated/{category}/{book}/` |
| `public/pre-generated/*.json` | 移至 `public/generated/{category}/{book}/book.json` |

---

## 第一阶段：核心架构改造

> 不改 UI，功能不变。运行后成语原有功能无感知。

### Task 1: 泛化数据模型（types.ts）

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: 更新 types.ts**

```typescript
// 品类枚举
export type ContentCategory = 'idiom' | 'poetry' | 'proverb' | 'nursery-rhyme' | 'fairy-tale'

// 泛化内容条目（取代 IdiomInfo）
export interface ContentInfo {
  sourceText: string
  meaning: string
  category: ContentCategory
  author?: string
  dynasty?: string
}

// 泛化绘本（原有字段保留，加 category + sourceText）
export interface PictureBook {
  id: string
  category: ContentCategory
  sourceText: string          // ← 取代 idiom
  title: string
  meaning: string
  author?: string
  dynasty?: string
  createdAt: string
  scenes: Scene[]
  videoBlob?: Blob
  videoUrl?: string
}
```

保留 `Scene`, `SceneTemplate`, `IdiomDecomposition` 等现有类型不变。

- [ ] **Step 2: 验证编译通过**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "refactor: 泛化 PictureBook 数据模型，新增 ContentCategory 和 ContentInfo 类型"
```

### Task 2: 提取策略接口（content-types/types.ts + index.ts）

**Files:**
- Create: `lib/content-types/types.ts`
- Create: `lib/content-types/index.ts`

- [ ] **Step 1: 创建策略接口文件**

`lib/content-types/types.ts`:

```typescript
import type { ContentCategory } from '@/lib/types'

export interface ContentTypeStrategy {
  category: ContentCategory
  label: string
  icon: string

  /** 构建 decompose 的 LLM prompt */
  getDecomposePrompt(text: string): string

  /** 构建 recommend 的 LLM prompt */
  getRecommendPrompt(exclude: string[]): string

  /** 校验原文是否合法（如古诗至少 4 句） */
  validate(text: string): boolean
}
```

- [ ] **Step 2: 创建策略注册表**

`lib/content-types/index.ts`:

```typescript
import type { ContentCategory } from '@/lib/types'
import type { ContentTypeStrategy } from './types'

const registry = new Map<ContentCategory, ContentTypeStrategy>()

export function registerStrategy(strategy: ContentTypeStrategy): void {
  registry.set(strategy.category, strategy)
}

export function getStrategy(category: ContentCategory): ContentTypeStrategy {
  const strategy = registry.get(category)
  if (!strategy) throw new Error(`Unknown content category: ${category}`)
  return strategy
}

export function getAllStrategies(): ContentTypeStrategy[] {
  return Array.from(registry.values())
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/content-types/
git commit -m "feat: 新增 ContentType 策略接口和注册表"
```

### Task 3: 从现有代码提取成语策略

**Files:**
- Create: `lib/content-types/idiom-strategy.ts`
- Modify: `lib/content-types/index.ts`

- [ ] **Step 1: 创建成语策略（从现有 decompose.ts + recommend.ts 抽取 prompt 逻辑）**

`lib/content-types/idiom-strategy.ts`:

```typescript
import type { ContentTypeStrategy } from './types'

const DECOMPOSE_SYSTEM_PROMPT =
  '你是一位专业的儿童绘本故事策划，擅长将成语故事拆分为适合儿童阅读的场景。请始终以 JSON 格式返回结果。'

const DECOMPOSE_USER_TEMPLATE = (idiom: string) =>
  `请将成语「${idiom}」的故事拆分为 5-10 个关键场景。简单的故事拆分为 5-6 个场景，复杂的故事拆分为 7-10 个场景。

要求：
1. 每个场景需要包含：标题、场景描述（用于生成图像的提示词）、旁白文本（适合朗读给孩子听）
2. 场景要按故事发展顺序排列，形成完整的叙事弧线
3. 场景描述要具体、生动，适合 AI 图像生成
4. 旁白文本要简洁、有韵律感，适合亲子朗读
5. 整体风格要适合 3-8 岁儿童
6. prompt 字段必须是英文，用于 AI 图像生成
7. 所有场景必须保持统一的画风和色调，确保视觉一致性
8. 所有场景中的主要角色必须保持一致的外貌特征，确保角色识别度

请严格以以下 JSON 格式返回，不要包含任何其他内容：
{
  "meaning": "成语的含义解释",
  "characterDescription": "主要角色的统一外貌描述（英文）",
  "styleDescription": "统一的画风和色调描述（英文）",
  "scenes": [
    {
      "title": "场景标题",
      "description": "场景描述",
      "prompt": "English prompt for AI image generation, must include characterDescription and styleDescription",
      "compositionHint": "English composition instruction",
      "narration": "旁白文本"
    }
  ]
}`

const RECOMMEND_USER_TEMPLATE = (exclude: string[]) => `请推荐 10 个适合 3-8 岁儿童学习的成语故事。${exclude.length > 0 ? `\n请不要推荐以下已出现过的成语：${exclude.join('、')}` : ''}

要求：
1. 成语要常见、经典，适合儿童理解
2. 每个成语要有趣味性，能吸引孩子
3. 涵盖不同类别（寓言、历史、励志、智慧等）
4. 含义解释要简单易懂，用小朋友能理解的语言

请严格以以下 JSON 数组格式返回，不要包含任何其他内容：
[
  { "idiom": "成语", "meaning": "含义解释", "category": "类别" }
]`

const VALID_IDIOM_RE = /^[\u4e00-\u9fff]{4}$/

export const idiomStrategy: ContentTypeStrategy = {
  category: 'idiom',
  label: '成语',
  icon: '🎭',
  getDecomposePrompt: (text) => `${DECOMPOSE_SYSTEM_PROMPT}\n\n${DECOMPOSE_USER_TEMPLATE(text)}`,
  getRecommendPrompt: (exclude) => RECOMMEND_USER_TEMPLATE(exclude),
  validate: (text) => VALID_IDIOM_RE.test(text),
}
```

- [ ] **Step 2: 在 index.ts 中注册成语策略**

`lib/content-types/index.ts` — 在文件末尾添加：

```typescript
import { idiomStrategy } from './idiom-strategy'
registerStrategy(idiomStrategy)
```

- [ ] **Step 3: Commit**

```bash
git add lib/content-types/
git commit -m "feat: 从现有代码提取成语策略实现"
```

### Task 4: 泛化内容列表（content-info.ts）

**Files:**
- Create: `lib/content-info.ts` (取代 lib/idioms.ts)
- Remove: `lib/idioms.ts` (内容保留，文件改名)

- [ ] **Step 1: 创建泛化内容列表**

`lib/content-info.ts`:

```typescript
import type { ContentInfo } from './types'

// 各品类内置推荐列表
export const IDIOM_LIST: ContentInfo[] = [
  { sourceText: '画蛇添足', meaning: '比喻做多余的事，反而不恰当', category: 'idiom' },
  { sourceText: '守株待兔', meaning: '比喻不主动努力，希望得到意外收获', category: 'idiom' },
  { sourceText: '亡羊补牢', meaning: '比喻出了问题以后想办法补救', category: 'idiom' },
  { sourceText: '井底之蛙', meaning: '比喻见识狭隘、目光短浅的人', category: 'idiom' },
  { sourceText: '狐假虎威', meaning: '比喻仰仗别人的权势来欺压人', category: 'idiom' },
  { sourceText: '掩耳盗铃', meaning: '比喻自己欺骗自己', category: 'idiom' },
  { sourceText: '刻舟求剑', meaning: '比喻拘泥于成法，不知变通', category: 'idiom' },
  { sourceText: '愚公移山', meaning: '比喻坚持不懈地改造自然', category: 'idiom' },
  { sourceText: '拔苗助长', meaning: '比喻违反客观规律，急于求成', category: 'idiom' },
  { sourceText: '叶公好龙', meaning: '比喻自称爱好某事物，其实并不是真爱好', category: 'idiom' },
]

// 按品类获取内置列表
export function getContentListByCategory(category: string): ContentInfo[] {
  switch (category) {
    case 'idiom': return IDIOM_LIST
    default: return []
  }
}

// 获取单品信息
export function getContentInfo(sourceText: string): ContentInfo | undefined {
  return IDIOM_LIST.find((item) => item.sourceText === sourceText)
}
```

- [ ] **Step 2: 更新所有引用 idioms.ts 的 import**

搜索 `from '@/lib/idioms'`，替换为 `from '@/lib/content-info'`。

涉及文件：
- `components/IdiomSelector.tsx` → `ContentSelector.tsx`（后续任务处理）
- `lib/db.ts`

- [ ] **Step 3: 删除 idioms.ts**

```bash
git rm lib/idioms.ts
```

- [ ] **Step 4: Commit**

```bash
git add lib/content-info.ts lib/db.ts
git rm lib/idioms.ts
git commit -m "refactor: idioms.ts → content-info.ts 泛化内容列表"
```

### Task 5: 精简 IndexedDB（db.ts）

**Files:**
- Modify: `lib/db.ts`

- [ ] **Step 1: 重写 db.ts**

```typescript
import Dexie, { type Table } from 'dexie'
import type { Task } from './task-store'
import type { ContentInfo } from './types'

export class PictureBookDB extends Dexie {
  tasks!: Table<Task>
  recommendedItems!: Table<ContentInfo & { id?: number }>

  constructor() {
    super('picture-book-db')
    this.version(5).stores({
      tasks: 'id, parentId, type, status, category',
      recommendedItems: '++id, category, sourceText',
    })
  }
}

export const db = new PictureBookDB()

// ── 任务持久化 ──

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

// ── 推荐缓存 ──

export async function saveRecommendedItems(
  items: ContentInfo[], 
  category: string
): Promise<void> {
  await db.transaction('rw', db.recommendedItems, async () => {
    // 先删除该品类旧数据
    await db.recommendedItems.where('category').equals(category).delete()
    // 插入新数据
    const tagged = items.map(i => ({ ...i, category }))
    if (tagged.length > 0) {
      await db.recommendedItems.bulkAdd(tagged as any)
    }
  })
}

export async function getAllRecommendedItems(category: string): Promise<ContentInfo[]> {
  return db.recommendedItems.where('category').equals(category).toArray()
}

export async function getRandomItems(category: string, n: number): Promise<ContentInfo[]> {
  const all = await getAllRecommendedItems(category)
  if (all.length <= n) return all
  const shuffled = [...all]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, n)
}
```

- [ ] **Step 2: 更新 import 引用**

`app/page.tsx` 中 `import { getAllPictureBooks, deletePictureBook } from '@/lib/db'` 需要改为文件系统加载方式（后续 Task 处理），先保留但标记待处理。

- [ ] **Step 3: Commit**

```bash
git add lib/db.ts
git commit -m "refactor: 精简 IndexedDB，移除 pictureBooks/scenes 表，新增推荐缓存 API"
```

### Task 6: Store 层品类状态（store.ts）

**Files:**
- Modify: `lib/store.ts`

- [ ] **Step 1: 重写 store.ts**

核心改动：
1. 移除 `pictureBooks` 数组及相关 action（loadBooks, deleteBook）
2. 添加 `currentCategory` 状态
3. 保留原有 currentIdiom 等生成状态（向后兼容）

```typescript
import { create } from 'zustand'
import type { PictureBook, Scene, SceneTemplate, ContentCategory } from './types'

interface AppState {
  // 品类选择
  currentCategory: ContentCategory
  setCurrentCategory: (category: ContentCategory) => void

  // 当前生成中的绘本
  currentIdiom: string | null        // 保留向后兼容
  currentMeaning: string | null
  currentScenes: Scene[]
  characterDescription: string | null
  styleDescription: string | null
  isDecomposing: boolean
  isGenerating: boolean
  generatingSceneId: number | null
  error: string | null

  // Actions
  setCurrentIdiom: (idiom: string) => void
  setDecomposition: (meaning: string, scenes: SceneTemplate[], characterDescription?: string, styleDescription?: string) => void
  setSceneImage: (sceneId: number, imageUrl: string, imageBlob: Blob) => void
  setGeneratingScene: (sceneId: number | null) => void
  setDecomposing: (isDecomposing: boolean) => void
  setGenerating: (isGenerating: boolean) => void
  setError: (error: string | null) => void
  saveCurrentBook: (existingId?: string) => PictureBook
  reset: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  currentCategory: 'idiom',
  setCurrentCategory: (category) => set({ currentCategory: category }),

  currentIdiom: null,
  currentMeaning: null,
  currentScenes: [],
  characterDescription: null,
  styleDescription: null,
  isDecomposing: false,
  isGenerating: false,
  generatingSceneId: null,
  error: null,

  setCurrentIdiom: (idiom) => set({ currentIdiom: idiom, error: null }),

  setDecomposition: (meaning, scenes, characterDescription, styleDescription) =>
    set({
      currentMeaning: meaning,
      currentScenes: scenes.map((s, i) => ({ ...s, id: i + 1 })),
      characterDescription: characterDescription ?? null,
      styleDescription: styleDescription ?? null,
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

  saveCurrentBook: (existingId?: string) => {
    const state = get()
    if (!state.currentIdiom || !state.currentMeaning) {
      throw new Error('无法保存：内容或含义缺失')
    }
    const book: PictureBook = {
      id: existingId ?? crypto.randomUUID?.() ?? `${Date.now()}`,
      category: state.currentCategory,
      sourceText: state.currentIdiom,
      title: state.currentIdiom,
      meaning: state.currentMeaning,
      createdAt: new Date().toISOString(),
      scenes: state.currentScenes,
    }
    // 不再写入 IndexedDB，返回 book 数据供调用方写入文件系统
    return book
  },

  reset: () =>
    set({
      currentIdiom: null,
      currentMeaning: null,
      currentScenes: [],
      characterDescription: null,
      styleDescription: null,
      isDecomposing: false,
      isGenerating: false,
      generatingSceneId: null,
      error: null,
    }),
}))
```

> 注意：`setCurrentCategory` 定义了两遍（第 1 遍在属性声明，第 2 遍在实现）。实际编写时只保留实现的版本。

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add lib/store.ts
git commit -m "refactor: store 移除 pictureBooks 管理，添加 currentCategory 状态"
```

### 第一阶段验证

- [ ] **验证：** 运行 `npm run dev`，首页能够正常加载，功能不变
- [ ] **验证：** IndexedDB 中不再有 pictureBooks 和 scenes 表
- [ ] **验证：** 类型检查通过 `npx tsc --noEmit`

---

## 第二阶段：Action 策略化 + 任务队列

### Task 7: Decompose Action 策略化

**Files:**
- Modify: `app/actions/decompose.ts`

- [ ] **Step 1: 重写 decompose action**

```typescript
'use server'

import { chatCompletion } from '@/lib/agnes-api'
import { getStrategy } from '@/lib/content-types'
import type { IdiomDecomposition, DecompositionRaw, SceneTemplateRaw, ContentCategory } from '@/lib/types'

export async function decomposeSource(
  sourceText: string,
  category: ContentCategory = 'idiom'
): Promise<IdiomDecomposition> {
  const strategy = getStrategy(category)

  // 使用策略构建 prompt
  const prompt = strategy.getDecomposePrompt(sourceText)

  const result = await chatCompletion([
    { role: 'system', content: '你是一位专业的儿童绘本策划师。请始终以 JSON 格式返回结果。' },
    { role: 'user', content: prompt },
  ])

  const content = result.choices[0]?.message?.content
  if (!content) throw new Error('LLM 返回内容为空')

  // 解析 JSON（兼容 markdown 代码块）
  let jsonStr = content
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) jsonStr = jsonMatch[1].trim()
  const jsonStart = jsonStr.indexOf('{')
  const jsonEnd = jsonStr.lastIndexOf('}')
  if (jsonStart !== -1 && jsonEnd !== -1) jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1)

  let data: DecompositionRaw
  try {
    data = JSON.parse(jsonStr)
  } catch (parseError) {
    throw new Error(
      `LLM 返回的 JSON 解析失败：${parseError instanceof Error ? parseError.message : String(parseError)}\n原始内容：${jsonStr.substring(0, 500)}`
    )
  }

  if (!data.meaning || !Array.isArray(data.scenes) || data.scenes.length === 0) {
    throw new Error('LLM 返回格式不正确')
  }

  const characterDescription = data.characterDescription || ''
  const styleDescription = data.styleDescription || ''

  return {
    idiom: sourceText,  // 保留字段名但内容是 sourceText
    meaning: data.meaning,
    characterDescription,
    styleDescription,
    scenes: data.scenes.map((s: SceneTemplateRaw, i: number) => {
      let prompt = s.prompt || `A scene for ${sourceText}`
      if (characterDescription) prompt = `${characterDescription}, ${prompt}`
      if (s.compositionHint) prompt = `${prompt}, ${s.compositionHint}`
      if (styleDescription) prompt = `${prompt}, ${styleDescription}`
      return {
        id: i + 1,
        title: s.title || `场景 ${i + 1}`,
        description: s.description || '',
        prompt,
        narration: s.narration || '',
        compositionHint: s.compositionHint || '',
      }
    }),
  }
}

// 保留向后兼容
export const decomposeIdiom = (idiom: string) => decomposeSource(idiom, 'idiom')
```

- [ ] **Step 2: Commit**

```bash
git add app/actions/decompose.ts
git commit -m "refactor: decompose 策略化，支持按品类选择 prompt"
```

### Task 8: Recommend Action 策略化

**Files:**
- Modify: `app/actions/recommend.ts`

- [ ] **Step 1: 重写 recommend action**

```typescript
'use server'

import { chatCompletion } from '@/lib/agnes-api'
import { getStrategy } from '@/lib/content-types'
import type { ContentInfo, ContentCategory } from '@/lib/types'

export async function fetchRecommendations(
  category: ContentCategory,
  exclude: string[] = []
): Promise<ContentInfo[]> {
  const strategy = getStrategy(category)

  if (exclude.length > 50) exclude = exclude.slice(0, 50)
  const prompt = strategy.getRecommendPrompt(exclude)

  const result = await chatCompletion([
    { role: 'system', content: '你是一位儿童教育专家。请始终以 JSON 格式返回结果。' },
    { role: 'user', content: prompt },
  ])

  const content = result.choices[0]?.message?.content
  if (!content) throw new Error('LLM 返回内容为空')

  let jsonStr = content
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) jsonStr = jsonMatch[1].trim()
  const jsonStart = jsonStr.indexOf('[')
  const jsonEnd = jsonStr.lastIndexOf(']')
  if (jsonStart !== -1 && jsonEnd !== -1) jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1)

  const data = JSON.parse(jsonStr)
  if (!Array.isArray(data) || data.length === 0) throw new Error('LLM 返回格式不正确')

  return data
    .filter((item: any) => item.idiom || item.sourceText)
    .map((item: any) => ({
      sourceText: item.idiom || item.sourceText,
      meaning: item.meaning || '',
      category,
      author: item.author,
      dynasty: item.dynasty,
    }))
}

// 保留向后兼容
export const fetchRecommendedIdioms = (exclude: string[]) =>
  fetchRecommendations('idiom', exclude)
```

- [ ] **Step 2: Commit**

```bash
git add app/actions/recommend.ts
git commit -m "refactor: recommend 策略化，支持按品类推荐"
```

### Task 9: 任务队列品类支持

**Files:**
- Modify: `lib/task-store.ts`

- [ ] **Step 1: 为 Task 类型添加 category / sourceText 字段**

```typescript
export interface Task {
  // 现有字段...
  category?: string     // ← 新增：品类标识
  sourceText?: string   // ← 新增：取代 idiom
  idiom?: string        // ← 保留向后兼容
  // ... 其余字段不变
}
```

只需找到 `Task` 接口定义，添加这两个可选字段。

- [ ] **Step 2: Commit**

```bash
git add lib/task-store.ts
git commit -m "feat: Task 类型添加 category/sourceText 字段"
```

### Task 10: TaskExecutor 品类感知

**Files:**
- Modify: `lib/task-executor.ts`

- [ ] **Step 1: 修改 executeDecompose 接收 category**

关键改动：`executeDecompose` 从 job 中读取 `category`，传递给 `decomposeSource`。

```typescript
private async executeDecompose(
  taskId: string,
  jobId: string,
  idiom: string,
  signal: AbortSignal,
): Promise<void> {
  const store = useTaskStore.getState()
  const task = store.getTaskById(taskId)
  const parentJob = task?.parentId ? store.getTaskById(task.parentId) : null
  const category = parentJob?.category || 'idiom'

  useTaskStore.getState().updateTask(taskId, { status: 'running' })
  // ...
  const result = await decomposeSource(idiom, category as any)
  // ... 其余逻辑不变
}
```

找到 `executeDecompose` 方法，在顶部添加 category 读取逻辑，并将 `decomposeIdiom(idiom)` 改为 `decomposeSource(idiom, category)`。

- [ ] **Step 2: 修改 saveCurrentBook 调用后的保存逻辑**

`executeSave` 中，保存绘本后不再调用 `savePictureBook`（因 db.ts 已移除该函数），改为：
1. 组装 `book.json` 数据
2. 通过 Server Action 保存到文件系统（后续阶段实现）

临时方案：先通过 `fetch('/api/save-book', { method: 'POST', body: JSON.stringify(book) })` 调用 API 路由保存。API 路由在后续 Task 实现。

- [ ] **Step 2: Commit**

```bash
git add lib/task-executor.ts
git commit -m "refactor: TaskExecutor 按 category 分发 decompose 调用"
```

### 第二阶段验证

- [ ] **验证：** `npm run build` 通过
- [ ] **验证：** 选择成语 → 点击生成 → decompose 正常执行（仍然使用成语策略）

---

## 第三阶段：文件系统存储 + API 路由

### Task 11: 创建保存绘本的 API 路由

**Files:**
- Create: `app/api/save-book/route.ts`

- [ ] **Step 1: 创建 API 路由**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import type { PictureBook } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const book: PictureBook = await request.json()
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

    return NextResponse.json({ success: true, path: `/generated/${book.category}/${book.sourceText}` })
  } catch (error) {
    console.error('保存绘本失败:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}

async function updateIndex(baseDir: string, book: PictureBook) {
  const indexPath = path.join(baseDir, 'index.json')
  let index: any = { version: 2, generatedAt: new Date().toISOString(), categories: {} }

  try {
    const existing = await fs.readFile(indexPath, 'utf-8')
    index = JSON.parse(existing)
  } catch {
    // 文件不存在，使用默认
  }

  if (!index.categories[book.category]) {
    const { getStrategy } = await import('@/lib/content-types')
    const strategy = getStrategy(book.category as any)
    index.categories[book.category] = {
      label: strategy.label,
      icon: strategy.icon,
      count: 0,
      items: [],
    }
  }

  const cat = index.categories[book.category]
  // 去重
  const existingIdx = cat.items.findIndex((i: any) => i.id === book.sourceText)
  const entry = {
    id: book.sourceText,
    title: book.title,
    meaning: book.meaning,
    sceneCount: book.scenes.length,
    author: book.author,
    dynasty: book.dynasty,
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

- [ ] **Step 3: Commit**

```bash
git add app/api/save-book/route.ts
git commit -m "feat: 新增保存绘本 API 路由，写入 public/generated/ 文件系统"
```

### Task 12: 更新 read/[id] 页面 — 从文件系统加载

**Files:**
- Modify: `app/read/[id]/page.tsx`

- [ ] **Step 1: 重写 read page**

核心逻辑改为：根据 `params.id` 格式 `{category}/{sourceText}`，从 `public/generated/` 加载 `book.json`。

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { BookViewer } from '@/components/BookViewer'
import type { PictureBook } from '@/lib/types'

export default function ReadPage() {
  const params = useParams()
  const [book, setBook] = useState<PictureBook | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const id = params.id as string
    // 兼容旧格式：直接是 idiom 名称 → 走 idiom 品类
    // 新格式：category/sourceText
    const parts = id.split('/')
    const category = parts.length > 1 ? parts[0] : 'idiom'
    const sourceText = parts.length > 1 ? parts[1] : parts[0]

    fetch(`/generated/${category}/${sourceText}/book.json`)
      .then(res => {
        if (!res.ok) throw new Error('Not found')
        return res.json()
      })
      .then(data => {
        setBook(data)
        setLoading(false)
      })
      .catch(() => {
        setBook(null)
        setLoading(false)
      })
  }, [params.id])

  // ... 渲染逻辑不变
}
```

- [ ] **Step 2: Commit**

```bash
git add app/read/[id]/page.tsx
git commit -m "refactor: read page 从文件系统加载 book.json"
```

### 第三阶段验证

- [ ] **验证：** 启动 `npm run dev`
- [ ] **验证：** 手动访问 `/generated/index.json` 返回正确数据
- [ ] **验证：** 通过保存 API 创建一本测试绘本，确认文件系统写入成功

---

## 第四阶段：UI 改造

### Task 13: 品类标签页组件（CategoryTabs）

**Files:**
- Create: `components/CategoryTabs.tsx`

- [ ] **Step 1: 创建 CategoryTabs 组件**

```typescript
'use client'

import type { ContentCategory } from '@/lib/types'
import { getAllStrategies } from '@/lib/content-types'

interface CategoryTabsProps {
  activeCategory: ContentCategory
  onCategoryChange: (category: ContentCategory) => void
}

export function CategoryTabs({ activeCategory, onCategoryChange }: CategoryTabsProps) {
  const strategies = getAllStrategies()

  return (
    <div className="flex gap-1 border-b border-gray-200">
      {strategies.map((s) => (
        <button
          key={s.category}
          onClick={() => onCategoryChange(s.category)}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            activeCategory === s.category
              ? 'bg-white text-primary border border-b-white border-gray-200 -mb-px'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          {s.icon} {s.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/CategoryTabs.tsx
git commit -m "feat: 品类标签页导航组件"
```

### Task 14: 通用内容选择器（ContentSelector）

**Files:**
- Create: `components/ContentSelector.tsx`
- Remove: `components/IdiomSelector.tsx`

- [ ] **Step 1: 复制 IdiomSelector.tsx 的完整逻辑，泛化为 ContentSelector**

核心改动：
1. 接收 `category` prop
2. 显示推荐列表改为按品类调用
3. API 调用改为 `fetchRecommendations(category, exclude)`
4. DB 操作改为 `getAllRecommendedItems(category)` / `getRandomItems(category, N)`
5. 校验使用 `getStrategy(category).validate()`
6. 批量生成跳转携带 category 参数

`components/ContentSelector.tsx`:

```typescript
'use client'

import { useState, useEffect } from 'react'
import { getContentListByCategory } from '@/lib/content-info'
import { useAppStore } from '@/lib/store'
import { useRouter } from 'next/navigation'
import { getRandomItems, getAllRecommendedItems, saveRecommendedItems } from '@/lib/db'
import { fetchRecommendations } from '@/app/actions/recommend'
import { getStrategy } from '@/lib/content-types'
import type { ContentCategory, ContentInfo } from '@/lib/types'

interface ContentSelectorProps {
  category: ContentCategory
  onBatchGenerate?: (items: string[]) => void
  compact?: boolean
}

export function ContentSelector({ category, onBatchGenerate, compact }: ContentSelectorProps) {
  const [customInput, setCustomInput] = useState('')
  const [selectedItem, setSelectedItem] = useState<string | null>(null)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [displayItems, setDisplayItems] = useState<ContentInfo[]>(
    getContentListByCategory(category)
  )
  const [refreshing, setRefreshing] = useState(false)
  const setCurrentIdiom = useAppStore((s) => s.setCurrentIdiom)
  const setCurrentCategory = useAppStore((s) => s.setCurrentCategory)
  const router = useRouter()
  const strategy = getStrategy(category)

  const DISPLAY_COUNT = 40

  // 初始化加载推荐
  useEffect(() => {
    loadRecommended()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category])

  const loadRecommended = async () => {
    try {
      const random = await getRandomItems(category, DISPLAY_COUNT)
      if (random.length > 0) {
        setDisplayItems(random)
      } else {
        setDisplayItems(getContentListByCategory(category))
      }
    } catch {
      setDisplayItems(getContentListByCategory(category))
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const currentItems = displayItems.map(i => i.sourceText)
      const newItems = await fetchRecommendations(category, currentItems)
      await saveRecommendedItems(newItems, category)
      const random = await getRandomItems(category, DISPLAY_COUNT)
      if (random.length > 0) setDisplayItems(random)
      setSelectedItem(null)
      setSelectedItems(new Set())
    } catch (error) {
      console.error(`获取推荐${strategy.label}失败:`, error)
    } finally {
      setRefreshing(false)
    }
  }

  const handleSelect = (text: string) => {
    // TODO: 检查是否已在书架中 → 跳转阅读页
    setSelectedItem(text)
    setCustomInput('')
  }

  const handleStart = () => {
    const text = selectedItem || customInput.trim()
    if (!text) return
    if (!strategy.validate(text)) {
      alert(`请输入有效的${strategy.label}`)
      return
    }
    setCurrentCategory(category)
    setCurrentIdiom(text)
    router.push('/generate')
  }

  // 渲染逻辑参考 IdiomSelector，将 idiom 替换为 strategy.label
  // 数据项使用 item.sourceText 替代 item.idiom
  // ... (JSX 从 IdiomSelector.tsx 复制，关键修改点如下)

注：将 IdiomSelector.tsx 复制后，对以下引用做全局替换：
| 原引用 | 替换为 |
|--------|--------|
| `IDIOM_LIST` | `getContentListByCategory(category)` |
| `item.idiom` | `item.sourceText` |
| `idiom`（变量名） | `text` 或 `sourceText` |
| `fetchRecommendedIdioms` | `fetchRecommendations`（添加 category 参数） |
| `saveRecommendedIdioms` | `saveRecommendedItems(items, category)` |
| `getRandomIdioms` | `getRandomItems(category, N)` |
| `existingIdioms.has()` | 移除（文件系统去重后续实现） |
| `handleSelect` 中的 router 跳转 | `router.push(\`/read/${category}/\${encodeURIComponent(text)}\`)` |
| `handleStart` 中校验 | 添加 `getStrategy(category).validate(text)` 校验 |
| 组件 props `onBatchGenerate` | 传递 `category` 到 generate 页面 |

  return (
    // ... JSX 同 IdiomSelector 但使用 strategy.label / strategy.icon / item.sourceText
    <div>ContentSelector 实现 — 参考 IdiomSelector 泛化</div>
  )
}
```

> 实际实现时，将 IdiomSelector.tsx 的 JSX 整体复制过来，把 `idiom` 相关变量替换为 `strategy.*` 和 `sourceText`。

- [ ] **Step 2: 删除 IdiomSelector.tsx**

```bash
git rm components/IdiomSelector.tsx
```

- [ ] **Step 3: Commit**

```bash
git add components/ContentSelector.tsx
git rm components/IdiomSelector.tsx
git commit -m "feat: ContentSelector 泛化内容选择器，取代 IdiomSelector"
```

### Task 15: Header 品牌更新

**Files:**
- Modify: `components/Header.tsx`

- [ ] **Step 1: 更新标题**

```typescript
<Link href="/" className="text-xl font-bold text-primary">
  🎨 绘本工坊    {/* 从「成语绘本工坊」改为「绘本工坊」 */}
</Link>
```

- [ ] **Step 2: Commit**

```bash
git add components/Header.tsx
git commit -m "refactor: Header 标题更新为「绘本工坊」"
```

### Task 16: BookCard 品类徽标 + 时间格式

**Files:**
- Modify: `components/BookCard.tsx`

- [ ] **Step 1: 从当前 BookCard.tsx 读取现有代码，添加品类徽标和时分秒**

关键改动：
1. 左上角添加品类标签：`getStrategy(book.category).icon + getStrategy(book.category).label`
2. 时间格式从 `createdAt` 的日期部分改为完整 `yyyy-MM-dd HH:mm:ss`

```typescript
// 在卡片顶部区域添加
{book.category && (
  <span className="absolute top-2 left-2 bg-white/90 rounded-full px-2 py-0.5 text-xs font-medium shadow-sm">
    {getStrategy(book.category).icon} {getStrategy(book.category).label}
  </span>
)}

// 时间格式化辅助函数
function formatTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
```

- [ ] **Step 2: Commit**

```bash
git add components/BookCard.tsx
git commit -m "feat: BookCard 品类徽标 + 时间精确到时分秒"
```

### Task 17: BookViewer 图片路径适配

**Files:**
- Modify: `components/BookViewer.tsx`

- [ ] **Step 1: 更新图片 URL 构造逻辑**

`book.scenes` 中 `imageUrl` 字段原本可能是 `/pre-generated/images/xxx.png`。
在新的目录结构下，imageUrl 应为 `/generated/{category}/{sourceText}/{sceneId}.png`。

在 BookViewer 中，当 `scene.imageUrl` 为空时，按新路径构造：

```typescript
const getImageUrl = (scene: Scene) => {
  if (scene.imageUrl) return scene.imageUrl
  return `/generated/${book.category}/${book.sourceText}/${scene.id}.png`
}
```

在渲染处用 `getImageUrl(scene)` 替代直接引用 `scene.imageUrl`。

- [ ] **Step 2: Commit**

```bash
git add components/BookViewer.tsx
git commit -m "refactor: BookViewer 图片路径适配生成目录结构"
```

### Task 18: 首页集成 Tab + 书架筛选

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: 重写首页**

主要改动：
1. 添加 CategoryTabs 在顶部
2. ContentSelector 传入当前 category
3. 书架区域添加分类筛选 Tab
4. 书架加载改为 fetch `/generated/index.json`
5. 书名路由改为 `/read/{category}/{sourceText}`

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { CategoryTabs } from '@/components/CategoryTabs'
import { ContentSelector } from '@/components/ContentSelector'
import { BookCard } from '@/components/BookCard'
import { useAppStore } from '@/lib/store'
import type { ContentCategory } from '@/lib/types'

interface IndexBook {
  id: string
  title: string
  meaning: string
  sceneCount: number
  author?: string
}

interface IndexData {
  version: number
  categories: Record<string, {
    label: string
    icon: string
    count: number
    items: IndexBook[]
  }>
}

export default function Home() {
  const currentCategory = useAppStore((s) => s.currentCategory)
  const setCurrentCategory = useAppStore((s) => s.setCurrentCategory)
  
  // index.json 数据
  const [indexData, setIndexData] = useState<IndexData | null>(null)
  // 书架筛选
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [loading, setLoading] = useState(true)

  // 加载 index.json
  useEffect(() => {
    const loadIndex = async () => {
      try {
        const res = await fetch('/generated/index.json')
        if (res.ok) {
          const data = await res.json()
          setIndexData(data)
        }
      } catch { /* ignore */ }
      setLoading(false)
    }
    loadIndex()
  }, [])

  // 计算总数
  const totalBooks = indexData
    ? Object.values(indexData.categories).reduce((sum, cat) => sum + cat.count, 0)
    : 0

  // 获取筛选后的列表
  const getFilteredBooks = () => {
    if (!indexData) return []
    if (filterCategory === 'all') {
      return Object.entries(indexData.categories).flatMap(([cat, data]) =>
        data.items.map(item => ({ ...item, category: cat }))
      )
    }
    return (indexData.categories[filterCategory]?.items || []).map(item => ({
      ...item,
      category: filterCategory,
    }))
  }

  const filteredBooks = getFilteredBooks()

  return (
    <main className="min-h-screen bg-gradient-to-b from-secondary/30 to-background">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Tab 导航 */}
        <CategoryTabs
          activeCategory={currentCategory}
          onCategoryChange={setCurrentCategory}
        />

        {/* 内容选择区 */}
        <div className="mt-4 mb-8">
          <ContentSelector category={currentCategory} compact />
        </div>

        {/* 书架 */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-800">📚 我的绘本书架</h2>
            <span className="text-gray-500">{totalBooks} 本</span>
          </div>

          {/* 筛选 Tab */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <button
              onClick={() => setFilterCategory('all')}
              className={`px-3 py-1 rounded-full text-sm ${
                filterCategory === 'all'
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              全部 ({totalBooks})
            </button>
            {indexData && Object.entries(indexData.categories).map(([cat, data]) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-3 py-1 rounded-full text-sm ${
                  filterCategory === cat
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {data.icon} {data.label} ({data.count})
              </button>
            ))}
          </div>

          {/* 绘本网格 */}
          {loading ? (
            <div className="text-center py-16 text-gray-500 animate-pulse">加载中...</div>
          ) : filteredBooks.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-card shadow-md">
              <div className="text-6xl mb-4">📖</div>
              <h3 className="text-xl font-semibold text-gray-700 mb-2">
                {filterCategory === 'all' ? '还没有绘本' : `暂无${indexData?.categories[filterCategory]?.label || ''}绘本`}
              </h3>
              <p className="text-gray-500">
                {filterCategory === 'all' ? '选择一个内容开始创作吧！' : '切换到其他分类看看吧！'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredBooks.map((book) => (
                <BookCard
                  key={`${book.category}-${book.id}`}
                  book={book as any}
                  onDelete={() => {}} // 文件系统删除后续实现
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/page.tsx
git commit -m "feat: 首页集成 Tab 导航 + 书架分类筛选"
```

### 第四阶段验证

- [ ] **验证：** 首页显示 Tab 导航
- [ ] **验证：** 切换 Tab 刷新推荐内容
- [ ] **验证：** 书架筛选 Tab 正确过滤
- [ ] **验证：** BookCard 显示品类徽标和时分秒
- [ ] **验证：** 点击成语跳转到阅读页

---

## 第五阶段：品类策略实现（逐品类扩展）

### Task 19: 古诗策略

**Files:**
- Create: `lib/content-types/poetry-strategy.ts`
- Modify: `lib/content-types/index.ts`

- [ ] **Step 1: 实现古诗策略**

```typescript
import type { ContentTypeStrategy } from './types'

const RECOMMEND_PROMPT = (exclude: string[]) => `请推荐 10 首适合 3-8 岁儿童学习的经典古诗。${exclude.length > 0 ? `\n请不要推荐以下已出现过的古诗：${exclude.join('、')}` : ''}

要求：
1. 选择五言或七言绝句，篇幅短小
2. 描写内容适合儿童理解（自然、亲情、四季等）
3. 含义解释要简单易懂

请严格以 JSON 数组格式返回：
[
  { "idiom": "诗名", "meaning": "含义解释", "author": "作者", "dynasty": "朝代" }
]`

export const poetryStrategy: ContentTypeStrategy = {
  category: 'poetry',
  label: '古诗',
  icon: '📜',
  getDecomposePrompt: (poem) => `你是一位儿童古诗绘本策划师，擅长将古诗转化为适合 3-8 岁儿童的意境绘本画面。

请将古诗「${poem}」拆分为 4-8 个意境场景。要求：
1. 每句诗作为一个主要场景，可额外补充开头意境/背景介绍场景
2. 每个场景的 narration（旁白）必须包含：原诗句 + 浅显的白话解释
3. 场景描述要注重中国传统美学意境（山水、月光、花鸟等）
4. 图像 prompt 风格统一为「中国古典水墨/工笔画风，柔和色彩，童趣感」
5. 如果需要角色，保持角色外貌一致

请严格以 JSON 格式返回：
{
  "meaning": "全诗含义解释（适合儿童理解）",
  "author": "作者名",
  "dynasty": "朝代",
  "styleDescription": "统一的画风和色调描述（英文）",
  "scenes": [
    {
      "title": "场景标题（如：床前明月光）",
      "description": "场景描述（中文）",
      "prompt": "English prompt for AI image generation, classical Chinese ink brush style...",
      "compositionHint": "English composition instruction",
      "narration": "原诗句。白话解释..."
    }
  ]
}`,
  getRecommendPrompt: RECOMMEND_PROMPT,
  validate: (text) => text.length >= 2 && text.length <= 20,
}
```

- [ ] **Step 2: 注册到 index.ts**

```typescript
import { poetryStrategy } from './poetry-strategy'
registerStrategy(poetryStrategy)
```

- [ ] **Step 3: 端到端验证**

1. 首页点击「古诗」Tab
2. 输入一首诗名（如「静夜思」）
3. 点击生成 → 走 decompose → 生成图像 → 保存
4. 确认书架显示古诗绘本

- [ ] **Step 4: Commit**

```bash
git add lib/content-types/poetry-strategy.ts lib/content-types/index.ts
git commit -m "feat: 古诗策略实现 + 端到端验证"
```

### Task 20: 儿歌策略

**Files:**
- Create: `lib/content-types/nursery-rhyme-strategy.ts`
- Modify: `lib/content-types/index.ts`

- [ ] **Step 1: 实现儿歌策略**

```typescript
import type { ContentTypeStrategy } from './types'

export const nurseryRhymeStrategy: ContentTypeStrategy = {
  category: 'nursery-rhyme',
  label: '儿歌',
  icon: '🎵',
  getDecomposePrompt: (rhyme) => `你是一位儿童绘本策划师，擅长将儿歌/童谣转化为适合 0-6 岁婴幼儿的绘本画面。

请将儿歌「${rhyme}」拆分为 5-8 个童趣场景。要求：
1. 每段歌词（或每 1-2 句）作为一个场景，歌词有副歌时可重复展现但画面不同
2. 每个场景的 narration（旁白）必须是原歌词，保留韵律和重复感
3. 场景描述要表现出歌词中角色的表情和动作
4. 图像 prompt 风格统一为「明亮卡通风格，色彩鲜艳，圆润可爱，适合婴幼儿」
5. 角色需保持一致外貌特征
6. 最后一个场景建议是温馨团圆或大合唱画面

请严格按照以下 JSON 格式返回：
{
  "meaning": "儿歌的教育意义或主题说明",
  "characterDescription": "主要角色的统一外貌描述（英文）",
  "styleDescription": "统一的画风和色调描述（英文，建议明亮卡通风格）",
  "scenes": [
    {
      "title": "场景标题（可用歌词首句）",
      "description": "场景描述（中文）",
      "prompt": "English prompt for AI image generation, bright cartoon style...",
      "compositionHint": "English composition instruction",
      "narration": "原歌词（保留重复和韵律）"
    }
  ]
}`,
  getRecommendPrompt: (exclude) => `请推荐 10 首适合 0-6 岁婴幼儿的经典儿歌/童谣。${exclude.length > 0 ? `\n请不要推荐以下已出现过的儿歌：${exclude.join('、')}` : ''}

要求：
1. 旋律简单，歌词朗朗上口
2. 内容积极向上，有教育意义
3. 涵盖不同主题（动物、自然、生活习惯等）

请严格以 JSON 数组格式返回：
[
  { "idiom": "儿歌名称", "meaning": "内容说明", "category": "儿歌" }
]`,
  validate: (text) => text.length >= 2,
}
```

- [ ] **Step 2: 注册到 index.ts**

```typescript
import { nurseryRhymeStrategy } from './nursery-rhyme-strategy'
registerStrategy(nurseryRhymeStrategy)
```

- [ ] **Step 3: Commit**

```bash
git add lib/content-types/nursery-rhyme-strategy.ts lib/content-types/index.ts
git commit -m "feat: 儿歌策略实现"
```

### Task 21: 谚语策略

**Files:**
- Create: `lib/content-types/proverb-strategy.ts`
- Modify: `lib/content-types/index.ts`

- [ ] **Step 1: 实现谚语策略**

```typescript
import type { ContentTypeStrategy } from './types'

export const proverbStrategy: ContentTypeStrategy = {
  category: 'proverb',
  label: '谚语',
  icon: '💬',
  getDecomposePrompt: (proverb) => `你是一位儿童绘本策划师，擅长将谚语/俗语转化为适合 3-8 岁儿童理解的生活场景绘本。

请将谚语「${proverb}」拆分为 4-6 个生活场景，帮助儿童理解这条谚语的含义。要求：
1. 每个场景展示谚语寓意的一个侧面，用小动物或小朋友的生活故事来呈现
2. 场景要贴近 3-8 岁儿童的日常生活体验（幼儿园、家庭、公园等）
3. 旁白（narration）要简洁、有韵律感，适合亲子朗读
4. 不要在场景中直接说出谚语原文，而是用故事让孩子自然领悟道理
5. 最后一个场景是回顾总结页，用简单的话说明「这个谚语告诉我们...」
6. 所有场景需保持统一的画风和角色外观

请严格按照以下 JSON 格式返回：
{
  "meaning": "谚语的含义解释（适合儿童理解）",
  "characterDescription": "主要角色的统一外貌描述（英文）",
  "styleDescription": "统一的画风和色调描述（英文，建议温暖明快的绘本风格）",
  "scenes": [
    {
      "title": "场景标题",
      "description": "场景描述（中文）",
      "prompt": "English prompt for AI image generation, warm picture book style...",
      "compositionHint": "English composition instruction",
      "narration": "旁白文本"
    }
  ]
}`,
  getRecommendPrompt: (exclude) => `请推荐 10 条适合 3-8 岁儿童的生活智慧谚语/俗语。${exclude.length > 0 ? `\n请不要推荐以下已出现过的谚语：${exclude.join('、')}` : ''}

要求：
1. 通俗易懂，有教育意义
2. 涵盖勤奋、诚实、友爱、智慧等主题

请严格以 JSON 数组格式返回：
[
  { "idiom": "谚语", "meaning": "含义解释", "category": "谚语" }
]`,
  validate: (text) => text.length >= 4,
}
```

- [ ] **Step 2: 注册 + 提交**

### Task 22: 童话策略

**Files:**
- Create: `lib/content-types/fairy-tale-strategy.ts`
- Modify: `lib/content-types/index.ts`

```typescript
import type { ContentTypeStrategy } from './types'

export const fairyTaleStrategy: ContentTypeStrategy = {
  category: 'fairy-tale',
  label: '童话',
  icon: '🏰',
  getDecomposePrompt: (tale) => `你是一位专业的儿童绘本故事策划师，擅长将童话故事改编为适合 3-8 岁儿童的绘本场景。

请将童话故事「${tale}」拆分为 8-12 个绘本场景。要求：
1. 按经典故事弧线拆分：背景/角色介绍 → 冲突出现 → 困难升级 → 转折/高潮 → 解决 → 寓意
2. 每个场景需推动剧情发展，没有冗余
3. 场景描述要生动、细腻，适合 AI 图像生成
4. 旁白（narration）需连贯叙事，适合亲子朗读
5. 如果故事中有多个角色，prompt 中必须明确区分每个角色的外貌特征
6. 所有场景保持统一的插画风格和色调
7. 最后一个场景必须是寓意总结页，点出故事的教育意义

请严格按照以下 JSON 格式返回：
{
  "meaning": "故事寓意（适合儿童理解的总结）",
  "characterDescription": "所有主要角色的外貌描述（英文，逐个角色描述）",
  "styleDescription": "统一的画风和色调描述（英文，建议经典故事绘本插画风）",
  "scenes": [
    {
      "title": "场景标题",
      "description": "场景描述（中文，包含角色动作、环境细节）",
      "prompt": "English prompt for AI image generation, classic storybook illustration style...",
      "compositionHint": "English composition instruction",
      "narration": "旁白叙事文本"
    }
  ]
}`,
  getRecommendPrompt: (exclude) => `请推荐 10 个适合 3-8 岁儿童的经典童话故事/寓言故事。${exclude.length > 0 ? `\n请不要推荐以下已出现过的童话：${exclude.join('、')}` : ''}

要求：
1. 故事情节完整，有教育寓意
2. 角色鲜明，适合儿童理解

请严格以 JSON 数组格式返回：
[
  { "idiom": "故事名称", "meaning": "故事寓意", "category": "童话" }
]`,
  validate: (text) => text.length >= 2,
}
```

- [ ] **Step 2: 注册 + 提交**

---

## 第六阶段：成语重制 + 批量生成脚本

### Task 23: 重写批量生成脚本

**Files:**
- Modify: `scripts/batch-generate.js`

- [ ] **Step 1: 实现完整流水线脚本**

```javascript
// scripts/batch-generate.js
// 用法: node scripts/batch-generate.js --category=idiom
//       node scripts/batch-generate.js --category=all

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const BASE_DIR = path.join(__dirname, '..', 'public', 'generated')

async function generateBook(category, sourceText) {
  const bookDir = path.join(BASE_DIR, category, sourceText)
  fs.mkdirSync(bookDir, { recursive: true })

  // Step 1: 调用 decompose
  console.log(`[${category}] 分解: ${sourceText}...`)
  // 这里需要调用 Next.js server action，暂用 API 方式
  const decomposeResult = await fetch('http://localhost:3000/api/decompose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceText, category }),
  }).then(r => r.json())

  // 保存过程数据
  fs.writeFileSync(path.join(bookDir, 'decompose-result.json'), JSON.stringify(decomposeResult, null, 2))
  fs.writeFileSync(path.join(bookDir, 'decompose-prompt.txt'), decomposeResult.prompt)

  // Step 2: 逐场景生成图像
  const imagePrompts = []
  for (let i = 0; i < decomposeResult.scenes.length; i++) {
    const scene = decomposeResult.scenes[i]
    console.log(`[${category}] 生成场景 ${i + 1}/${decomposeResult.scenes.length}: ${scene.title}`)

    const imageResult = await fetch('http://localhost:3000/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: scene.prompt }),
    }).then(r => r.json())

    imagePrompts.push({ sceneId: i + 1, prompt: scene.prompt })

    // 下载图片
    if (imageResult.url) {
      const imgRes = await fetch(imageResult.url)
      const buffer = Buffer.from(await imgRes.arrayBuffer())
      fs.writeFileSync(path.join(bookDir, `${i + 1}.png`), buffer)
    }
  }

  // 保存 prompts.json
  fs.writeFileSync(path.join(bookDir, 'prompts.json'), JSON.stringify(imagePrompts, null, 2))

  // Step 3: 组装 book.json
  const book = {
    id: sourceText,
    category,
    sourceText,
    title: sourceText,
    meaning: decomposeResult.meaning,
    author: decomposeResult.author,
    dynasty: decomposeResult.dynasty,
    createdAt: new Date().toISOString(),
    scenes: decomposeResult.scenes.map((s, i) => ({
      id: i + 1,
      title: s.title,
      description: s.description,
      prompt: imagePrompts[i]?.prompt || s.prompt,
      compositionHint: s.compositionHint,
      narration: s.narration,
      imageUrl: `/generated/${category}/${sourceText}/${i + 1}.png`,
    })),
  }

  fs.writeFileSync(path.join(bookDir, 'book.json'), JSON.stringify(book, null, 2))

  // Step 4: 更新 index.json
  updateIndex(category, sourceText, book)

  console.log(`[${category}] 完成: ${sourceText}`)
}

function updateIndex(category, id, book) {
  const indexPath = path.join(BASE_DIR, 'index.json')
  let index = { version: 2, generatedAt: new Date().toISOString(), categories: {} }
  if (fs.existsSync(indexPath)) {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
  }
  if (!index.categories[category]) {
    index.categories[category] = { label: category, icon: '', count: 0, items: [] }
  }
  const cat = index.categories[category]
  const existing = cat.items.findIndex(i => i.id === id)
  const entry = { id, title: book.title, meaning: book.meaning, sceneCount: book.scenes.length }
  if (existing >= 0) cat.items[existing] = entry
  else cat.items.push(entry)
  cat.count = cat.items.length
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2))
}

// 主函数
async function main() {
  const args = process.argv.slice(2)
  const categoryArg = args.find(a => a.startsWith('--category='))
  const category = categoryArg ? categoryArg.split('=')[1] : 'all'

  // 各品类要生成的内容列表
  const contentMap = {
    idiom: ['守株待兔', '叶公好龙', '愚公移山', '狐假虎威', '拔苗助长', '画蛇添足',
            '亡羊补牢', '井底之蛙', '掩耳盗铃', '刻舟求剑', '对牛弹琴', '杯弓蛇影',
            '鹤立鸡群', '画龙点睛', '坐井观天', '一举两得', '三心二意', '半途而废',
            '目不转睛', '津津有味'],
    poetry: ['静夜思', '春晓', '咏鹅', '悯农', '登鹳雀楼', '江雪', '望庐山瀑布', '绝句'],
    'nursery-rhyme': ['小兔子乖乖', '两只老虎', '小燕子', '数鸭子', '拔萝卜', '小星星'],
    proverb: ['三个臭皮匠，顶个诸葛亮', '路遥知马力，日久见人心', '近朱者赤，近墨者黑',
              '千里送鹅毛，礼轻情意重', '世上无难事，只怕有心人'],
    'fairy-tale': ['三只小猪', '小红帽', '龟兔赛跑', '乌鸦喝水', '狼来了', '丑小鸭'],
  }

  const categories = category === 'all' ? Object.keys(contentMap) : [category]

  for (const cat of categories) {
    const items = contentMap[cat] || []
    for (const item of items) {
      try {
        await generateBook(cat, item)
      } catch (err) {
        console.error(`[${cat}] 失败: ${item}`, err.message)
      }
    }
  }

  console.log('批量生成完成!')
}

main().catch(console.error)
```

- [ ] **Step 2: 创建 decompose 和 generate 的 API 路由（供脚本调用）**

`app/api/decompose/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { decomposeSource } from '@/app/actions/decompose'

export async function POST(request: NextRequest) {
  const { sourceText, category } = await request.json()
  const result = await decomposeSource(sourceText, category)
  return NextResponse.json(result)
}
```

`app/api/generate-image/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { generateSceneImage } from '@/app/actions/generate'

export async function POST(request: NextRequest) {
  const { prompt } = await request.json()
  const url = await generateSceneImage(prompt)
  return NextResponse.json({ url })
}
```

- [ ] **Step 3: Commit**

```bash
git add scripts/batch-generate.js app/api/decompose/ app/api/generate-image/
git commit -m "feat: 批量生成脚本 + 辅助 API 路由"
```

### Task 24: 成语重制 + 清理旧数据

- [ ] **Step 1: 停止 dev server，运行批量生成**

```bash
# 先启动 dev server（API 路由需要）
npm run dev &
# 运行重制脚本
node scripts/batch-generate.js --category=idiom

# 完成后停止 dev server
kill %1
```

- [ ] **Step 2: 清理旧数据**

```bash
# 删除旧目录
rm -rf public/pre-generated/images
rm -f public/pre-generated/*.json
# 旧目录保留但不维护
```

- [ ] **Step 3: 验证**

1. 启动 dev server
2. 首页书架显示 20 个成语绘本
3. 每个成语有 5+ 场景
4. 点击阅读能正常显示图片

- [ ] **Step 4: Commit**

```bash
git add public/generated/
git rm public/pre-generated/images/*.png
git rm public/pre-generated/*.json
git commit -m "feat: 成语重制完成，清理旧数据"
```

### 最终验证

- [ ] **端到端验证：** 所有 Tab 切换正常
- [ ] **端到端验证：** 每个品类选择一个内容 → 点击生成 → 走完流水线
- [ ] **端到端验证：** 书架筛选按品类过滤正确
- [ ] **端到端验证：** 阅读页从文件系统加载 book.json
- [ ] **端到端验证：** BookCard 品类徽标 + 时分秒时间
- [ ] **端到端验证：** `npm run build` 无错误

---

## 设计文档对照检查

| 设计文档章节 | 实现任务 | 状态 |
|-------------|---------|------|
| 1. 泛化数据模型 | Task 1 | ✅ |
| 2. ContentType 策略模式 | Task 2, 3 | ✅ |
| 3. UI 改造 — Tab 切换 | Task 13, 14, 18 | ✅ |
| 4. Action 层改造 | Task 7, 8 | ✅ |
| 5. 任务队列改造 | Task 9, 10 | ✅ |
| 6. 存储架构 — 文件系统 | Task 11, 12 | ✅ |
| 7. 内容生成流水线 | Task 23 | ✅ |
| 8. 绘本列表页改造 | Task 16, 18 | ✅ |
| 9. 推荐机制泛化 | Task 8, 14 | ✅ |
| 古诗 Prompt 模板 | Task 19 | ✅ |
| 谚语 Prompt 模板 | Task 21 | ✅ |
| 儿歌 Prompt 模板 | Task 20 | ✅ |
| 童话 Prompt 模板 | Task 22 | ✅ |
| 品类场景结构对比 | 文档说明，无需实现 | ✅ |
| 阶段四：成语重制 | Task 24 | ✅ |
