# 多品类扩展设计 — 绘本工坊

## 概述

将「成语绘本工坊」从一个单一品类（成语）的儿童绘本生成应用，扩展为支持多个平行品类的通用绘本平台。首批新增品类为「古诗词」，第二批为「谚语/俗语」，后续可扩展歇后语、寓言、国学名句等。

## 核心架构

### 1. 泛化数据模型

`PictureBook` 从成语专属升级为泛化模型：

```typescript
export type ContentCategory = 'idiom' | 'poetry' | 'proverb'

export interface PictureBook {
  id: string
  category: ContentCategory   // ← 新增：区分品类
  sourceText: string          // ← 取代 idiom，存放成语/诗句/谚语原文
  title: string
  meaning: string
  author?: string             // 古诗需要作者
  dynasty?: string            // 古诗需要朝代
  createdAt: string
  scenes: Scene[]
  videoBlob?: Blob
  videoUrl?: string
}
```

**向后兼容**：所有已有成语绘本的 `category` 自动标记为 `'idiom'`，`sourceText = idiom`。

### 2. ContentType 策略模式

封装各品类的差异行为，新增品类只需注册一个策略类。

```typescript
interface ContentTypeStrategy {
  category: ContentCategory
  label: string              // 展示名
  icon: string               // Emoji

  // LLM 提示词生成
  getDecomposePrompt(text: string): string
  getRecommendPrompt(exclude: string[]): string

  // 校验
  validate(text: string): boolean
}

// 注册表
const registry = new Map<ContentCategory, ContentTypeStrategy>()
function registerStrategy(strategy: ContentTypeStrategy): void
function getStrategy(category: ContentCategory): ContentTypeStrategy
```

**各品类策略概要**：

| 品类 | label | icon | decompose 行为 | 推荐来源 |
|------|-------|------|----------------|----------|
| idiom | 成语 | 🎭 | 按故事发展拆 5-10 个场景 | LLM 推荐 |
| poetry | 古诗 | 📜 | 按诗句逐句意境拆 4-8 个场景 | LLM 推荐 |
| proverb | 谚语 | 💬 | 按寓意拆分为生活场景 | LLM 推荐 |

### 3. UI 改造 — 标签页切换

首页从单一品类入口变为标签页（Tab）导航：

```
┌──────────────────────────────────────────────────────┐
│  🎨 绘本工坊                       📚 绘本库 | ✏️ 创建 │
├──────────┬──────────┬──────────┬─────────────────────┤
│  🎭 成语  │  📜 古诗  │  💬 谚语  │  ...后续品类       │
├──────────┴──────────┴──────────┴─────────────────────┤
│  当前品类推荐列表 / 输入框 / 批量生成                 │
│  当前品类绘本书架（按品类过滤）                       │
└──────────────────────────────────────────────────────┘
```

- Tab 切换时刷新推荐列表、切换书架过滤
- Header 从「成语绘本工坊」→「绘本工坊」
- 阅读页（BookViewer）几乎不变，已支持 title/meaning/scenes 通用展示

### 4. Action 层改造

| Action | 改造前 | 改造后 |
|--------|--------|--------|
| decompose | `decomposeIdiom(idiom)` | `decomposeSource(sourceText, category)` 按品类选策略 |
| recommend | `fetchRecommendedIdioms(exclude)` | `fetchRecommendations(category, exclude)` 按品类选策略 |
| generateSceneImage | 不变 | 不变 |
| generateBookVideo | 不变 | 不变 |

### 5. 任务队列改造

`Task` 类型增加 `category` 字段：

```typescript
export interface Task {
  // ... 现有字段
  category?: ContentCategory  // ← 新增
  sourceText?: string         // ← 新增，取代 idiom
  idiom?: string              // ← 保留向后兼容
}
```

### 6. IndexedDB 迁移

Dexie schema 从 v4 升级到 v5：

```
version 5:
- pictureBooks: 'id, category, sourceText, createdAt'  // +category, +sourceText 索引
- scenes: '++id, bookId, sceneId, imageHash, [bookId+sceneId]'
- tasks: 'id, parentId, type, status, category'
- recommendedItems: '++id, category, sourceText'  // 取代 recommendedIdioms
```

**迁移逻辑**：
1. v4→v5 `upgrade()` 时遍历所有 pictureBooks，补 `category: 'idiom'`, `sourceText: idiom`
2. 将 `recommendedIdioms` 表数据复制到 `recommendedItems` 表，补 `category: 'idiom'`
3. 删除 `recommendedIdioms` 表

### 7. 预生成内容结构

```
public/pre-generated/
├── index.json                // 统一索引（含 category 字段）
├── idiom/
│   ├── 守株待兔.json
│   ├── 叶公好龙.json
│   └── ...
└── poetry/
    ├── 静夜思.json
    ├── 春晓.json
    └── ...
```

## 古诗品类详细设计

### 首个扩展品类：古诗

**产品逻辑**：
1. 用户在「古诗」Tab 下浏览推荐古诗（LLM 推荐适合儿童的名诗）
2. 选择一首诗 → LLM 分解为 4-8 个场景
3. 每句诗一个场景 + 可能的开头意境/背景场景
4. 图像 prompt 强调中国古典水墨/工笔画意境风格
5. 旁白包含诗句原文和淺白解釋
6. 阅读页支持切换「原文朗读」和「白话旁白朗读」

**古诗示例 — 《静夜思》分解**：
```
场景 1: "静夜思" — 夜晚的庭院全景
场景 2: "床前明月光" — 月光洒在床前
场景 3: "疑是地上霜" — 诗人低头看，月光如霜
场景 4: "舉頭望明月" — 诗人抬头看月亮
场景 5: "低頭思故鄉" — 诗人低头沉思，思念故乡
场景 6: 含义回顾 — 全诗含义总结
```

**古诗 decompose prompt 特点**：
- 每个场景的 narration 必须包含原诗句 + 解释
- 图像风格描述偏向中国古典水墨/工笔画
- 角色可以是诗人形象或拟人化的诗意角色

## 古诗 Decompose Prompt 模板

古诗品类的核心差异在于 decompose prompt。以下为 《静夜思》 风格的 prompt 模板：

```
你是一位儿童古诗绘本策划师，擅长将古诗转化为适合 3-8 岁儿童的意境绘本画面。

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
}
```

## 谚语 Decompose Prompt 模板

谚语的分解逻辑和古诗/成语都不同——它没有故事线，而是用一个抽象的道理指导生活。分解时需要将道理转化为多个具象的生活场景，每个场景展示谚语的一个侧面。

```
你是一位儿童绘本策划师，擅长将谚语/俗语转化为适合 3-8 岁儿童理解的生活场景绘本。

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
}
```

**示例 — 谚语「三个臭皮匠，顶个诸葛亮」**：
```
场景 1: 三个小伙伴在一起搭积木但搭不好
场景 2: 各自尝试不同的搭法都失败
场景 3: 三个人坐下来一起讨论合作
场景 4: 分工合作后终于搭成了漂亮的城堡
场景 5（总结页）: 大家一起开心的画面，旁白点题
```

## 分阶段实现

整个工作按依赖关系分为三个可独立交付的阶段：

### 阶段一：核心架构改造（不改 UI，功能不变）

1. 泛化数据模型 — `types.ts` 升级
2. Dexie schema v5 + 自动迁移（向后兼容）
3. ContentType 策略接口 + 成语策略从现有代码提取
4. `lib/idioms.ts` → `lib/content-info.ts` 泛化
5. Store 层品类支持

**验证**：运行后成语原有功能无感知，IndexedDB 升级成功

### 阶段二：UI + Action 策略化（功能不变，但可切换品类）

1. 标签页导航组件 `CategoryTabs`
2. 首页 Tab 改造 + Header 品牌更新
3. `IdiomSelector` → `ContentSelector` 通用化
4. decompose / recommend Action 策略化
5. 任务队列品类支持（Task + TaskExecutor）

**验证**：成语 Tab 功能正常，古诗 Tab 显示（但古诗推荐/生成尚未接入）

### 阶段三：古诗品类落地（真正的扩展功能）

1. 古诗策略 `PoetryStrategy` 完整实现
2. 古诗 decompose prompt 调优
3. 古诗推荐 prompt 调优
4. 预生成目录结构调整 + 古诗预生成内容（可选）
5. 端到端验证：选择古诗 → 分解 → 生成图像 → 阅读

**验证**：能用完整流程生成一首古诗绘本

## 涉及文件清单

### 新增文件
- `lib/content-types/index.ts` — 策略注册表
- `lib/content-types/types.ts` — 策略接口定义
- `lib/content-types/idiom-strategy.ts` — 成语策略实现
- `lib/content-types/poetry-strategy.ts` — 古诗策略实现
- `components/CategoryTabs.tsx` — 标签页组件

### 修改文件
- `lib/types.ts` — 泛化 PictureBook + 新增 ContentCategory
- `lib/idioms.ts` → `lib/content-info.ts` — 泛化 ContentInfo
- `lib/db.ts` — v5 schema + 迁移逻辑
- `lib/store.ts` — 支持 category 状态
- `lib/task-store.ts` — Task 添加 category
- `lib/task-executor.ts` — 按 category 分发 decompose
- `app/page.tsx` — 首页 Tab 改造
- `app/actions/decompose.ts` → `app/actions/decompose.ts` 策略化
- `app/actions/recommend.ts` → `app/actions/recommend.ts` 策略化
- `components/IdiomSelector.tsx` → 通用 ContentSelector
- `components/Header.tsx` — 标题更新
- `app/layout.tsx` — SEO metadata 更新
