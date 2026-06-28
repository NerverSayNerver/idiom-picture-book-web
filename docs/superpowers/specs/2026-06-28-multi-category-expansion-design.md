# 多品类扩展设计 — 绘本工坊

## 概述

将「成语绘本工坊」从一个单一品类（成语）的儿童绘本生成应用，扩展为支持多个平行品类的通用绘本平台。品类规划如下：

| 优先级 | 品类 | label | 说明 |
|--------|------|-------|------|
| P0 | 成语 | idiom | 现有品类，保持完整 |
| P1 | 古诗词 | poetry | 首批扩展，意境类 |
| P1 | 儿歌 | nursery-rhyme | 首批扩展，韵律类 |
| P2 | 谚语/俗语 | proverb | 第二批，智慧哲理类 |
| P2 | 童话故事 | fairy-tale | 第二批，叙事类 |

每个品类都有**专属的 decompose prompt 模板**和**差异化的场景结构**，确保绘本画面和叙事完整传达原文含义。

## 核心架构

### 1. 泛化数据模型

`PictureBook` 从成语专属升级为泛化模型：

```typescript
export type ContentCategory = 'idiom' | 'poetry' | 'proverb' | 'nursery-rhyme' | 'fairy-tale'

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

**泛化内容条目**（替换 IdiomInfo）：

```typescript
export interface ContentInfo {
  sourceText: string       // 成语/诗句/谚语/歌词 的原文
  meaning: string          // 含义解释
  category: ContentCategory
  author?: string          // 古诗需要作者
  dynasty?: string         // 古诗需要朝代
}
```

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

| 品类 | label | icon | decompose 行为 | 场景数 | 推荐来源 |
|------|-------|------|----------------|--------|----------|
| idiom | 成语 | 🎭 | 按故事发展拆为叙事场景 | 5-10 | LLM 推荐 |
| poetry | 古诗 | 📜 | 按诗句逐句拆为意境场景 | 4-8 | LLM 推荐 |
| nursery-rhyme | 儿歌 | 🎵 | 按歌词逐段拆为童趣场景 + 副歌重复 | 5-8 | LLM 推荐 |
| proverb | 谚语 | 💬 | 按寓意拆为生活场景（不直接说道理） | 4-6 | LLM 推荐 |
| fairy-tale | 童话 | 🏰 | 按故事弧线拆为完整叙事场景 | 8-12 | LLM 推荐 |

### 3. UI 改造 — 标签页切换

首页从单一品类入口变为标签页（Tab）导航：

```
┌──────────────────────────────────────────────────────┐
│  🎨 绘本工坊                       📚 绘本库 | ✏️ 创建 │
├──────────┬──────────┬──────────┬─────────────────────┤
│  🎭 成语  │  📜 古诗  │  🎵 儿歌  │  💬 谚语  │  🏰 童话  │
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

### 6. 存储架构 — 文件系统为主，IndexedDB 为辅助

**核心原则**：
- ✅ 所有**已完成的绘本** → 存储在 `public/generated/` 文件系统
- ✅ 页面直接通过 HTTP 引用（`fetch` JSON、`<img>` 引用 PNG）
- ✅ 每本绘本文件夹包含全部过程数据，可供后续分析
- ❌ 已完成的绘本不额外存入 IndexedDB
- 🔄 IndexedDB 仅用于**运行时状态**：任务队列、推荐缓存、当前会话

#### 统一目录结构

```
public/generated/
├── index.json                          # 全局索引（含 category、数量统计）
│
├── idiom/
│   └── 守株待兔/                       # 每本绘本一个文件夹
│       ├── book.json                    # 完整绘本数据（供页面渲染）
│       ├── decompose-prompt.txt         # 镜头拆分 prompt（发给 LLM 的原文）
│       ├── decompose-result.json        # 镜头拆分结果（LLM 原始返回）
│       ├── prompts.json                 # 各场景的图片 prompt（供分析对比）
│       ├── meta.json                    # 生成元数据（版本、LLM参数、耗时等）
│       ├── 1.png                        # 场景1 图片
│       ├── 2.png                        # 场景2 图片
│       └── ...                          # 场景N 图片
│
├── poetry/
│   └── 静夜思/
│       ├── book.json
│       ├── decompose-prompt.txt
│       ├── decompose-result.json
│       ├── prompts.json
│       ├── meta.json
│       ├── 1.png
│       └── ...
│
├── nursery-rhyme/
│   └── 小兔子乖乖/
│       └── ...
│
├── proverb/
│   └── ...
│
└── fairy-tale/
    └── ...
```

#### 各文件说明

| 文件 | 用途 | 来源 | 页面引用方式 |
|------|------|------|------------|
| `book.json` | 完整 `PictureBook` 数据（含 scenes、imageUrl） | 生成流水线组装 | `fetch(/generated/idiom/守株待兔/book.json)` |
| `decompose-prompt.txt` | 发给 LLM 的完整 prompt（品类专属模板 + 原文） | 从策略类导出 | 分析用，页面不引用 |
| `decompose-result.json` | LLM 原始返回（含 meaning、scenes 等） | LLM API 响应 | 分析用，页面不引用 |
| `prompts.json` | 各场景最终使用的 image prompt（含角色/风格/构图拼接后） | 生成流水线记录 | 分析用，页面不引用 |
| `meta.json` | 生成时间、LLM 模型、耗时、版本号 | 生成流水线记录 | 分析用，页面不引用 |
| `{n}.png` | 场景图片，按序号命名 | 图像 API → 下载 | `<img src="/generated/idiom/守株待兔/1.png">` |

#### IndexedDB 缩减

```
Dexie v5 schema（只保留运行时数据）:
- tasks: 'id, parentId, type, status, category'
- recommendedItems: '++id, category, sourceText'  // 推荐缓存
```

原有的 `pictureBooks` 和 `scenes` 表**不再需要**——已完成绘本走文件系统。

#### 数据加载流程

```
页面加载绘本列表：
  1. fetch('/generated/index.json') → 获取所有品类索引
  2. 按品类/筛选渲染列表

页面加载单个绘本：
  1. fetch('/generated/{category}/{bookId}/book.json') → 获取完整绘本数据
  2. book.json 中的 scene.imageUrl = '/generated/{category}/{bookId}/{n}.png'
  3. 直接渲染，无需 IndexedDB

用户生成新绘本（运行中）：
  1. 运行时状态在 Zustand store 内存中
  2. 任务队列持久化到 IndexedDB（防刷新丢失）
  3. 生成完成后通过 **Server Action** 写入文件系统：
     a. 前端任务执行完毕 → 调用保存 API（server action）
     b. Server action 写入 `public/generated/{category}/{bookId}/` 目录
     c. 更新 `public/generated/index.json`
  4. 若文件系统写入失败（如 serverless 环境），降级到 IndexedDB 存储 book.json

> 注意：Next.js 的 `public/` 目录在运行时可通过 Server Action 写入（使用 `fs.writeFile`），适用于自部署环境。Serverless 部署需改用外部存储（如 S3），此方案为 v1 设计，v2 可扩展存储后端。
```

### 7. 内容生成流水线 — 统一目录输出

所有内容（批量生成 + 用户生成）均走同一流水线，输出到 `public/generated/` 统一目录结构。

#### 生成流水线

```
输入：品类 + 原文（如 idiom + "守株待兔"）
  │
  ├─ 步骤1：构建 decompose prompt（从策略类获取品类专属模板 + 填充原文）
  │     ↓
  │   decompose-prompt.txt  ← 保存 prompt 原文（用于分析）
  │     ↓
  ├─ 步骤2：调用 LLM → 得到 decompose-result.json
  │     ↓
  │   decompose-result.json  ← 保存 LLM 原始返回（用于分析）
  │     ↓
  ├─ 步骤3：从 result 构建 prompts.json（每个场景的最终 image prompt）
  │     ↓  
  │   prompts.json  ← 保存拼接后的 image prompt（含角色/风格/构图）
  │     ↓
  ├─ 步骤4：对每个场景，调用图像 API → 下载 → 保存为 {n}.png
  │     ↓
  │   1.png, 2.png, 3.png, ...  ← 场景图片
  │     ↓
  ├─ 步骤5：组装 book.json（PictureBook 完整数据，imageUrl 指向同级 PNG）
  │     ↓
  │   book.json  ← 页面渲染用
  │     ↓
  └─ 步骤6：记录 meta.json（生成时间、LLM 模型、API 耗时等）
        ↓
      meta.json  ← 过程分析用
```

**验证规则**：
- 场景数 ≥ 品类最低要求（成语 5、古诗 4、儿歌 5、谚语 4、童话 8）
- book.json 中所有字段非空
- 每张图片文件存在且非空
- 有 `characterDescription` 和 `styleDescription`

#### index.json 格式

```json
{
  "version": 2,
  "generatedAt": "2026-06-28T12:00:00.000Z",
  "categories": {
    "idiom": {
      "label": "成语",
      "icon": "🎭",
      "count": 20,
      "items": [
        { "id": "守株待兔", "title": "守株待兔", "meaning": "…", "sceneCount": 7 }
      ]
    },
    "poetry": {
      "label": "古诗",
      "icon": "📜",
      "count": 10,
      "items": [
        { "id": "静夜思", "title": "静夜思", "meaning": "…", "author": "李白", "dynasty": "唐", "sceneCount": 6 }
      ]
    }
  }
}
```

#### 批量生成脚本

`scripts/batch-generate.js` 负责执行整个流水线：

```
功能：
  1. 读取品类策略 → 获取品类专属 decompose prompt 模板
  2. 对每条内容执行步骤 1-6（完整流水线）
  3. 输出到 public/generated/{category}/{bookId}/
  4. 自动维护 index.json

用法：
  node scripts/batch-generate.js --category=idiom                # 生成所有推荐成语
  node scripts/batch-generate.js --category=all                  # 生成所有品类
  node scripts/batch-generate.js --category=poetry --items=静夜思,春晓  # 指定条目
  node scripts/batch-generate.js --category=idiom --regenerate    # 重新生成
	```

### 8. 绘本列表页改造 — 分类筛选与展示

绘本列表页（书架）需要体现多品类结构，方便用户按分类浏览。

**筛选 Tab 栏**（位于书架标题下方）：

```
📚 我的绘本书架       总数: 28

[ 全部(28) | 🎭 成语(10) | 📜 古诗(6) | 🎵 儿歌(5) | 💬 谚语(3) | 🏰 童话(4) ]
  ↑ 选中态高亮         ↑ 每项显示该分类的绘本数量
─────────────────────────────────────────────────────
┌────────────┐ ┌────────────┐ ┌────────────┐
│ 🎭 守株待兔 │ │ 📜 静夜思   │ │ 🎵 小兔子乖乖│
│ 成语        │ │ 古诗        │ │ 儿歌        │
│ 2026-06-28  │ │ 2026-06-28  │ │ 2026-06-28  │
│ 08:30:15    │ │ 09:15:42    │ │ 10:00:03    │
└────────────┘ └────────────┘ └────────────┘
```

**设计要点**：

1. **筛选 Tab** — 和行为类似但独立于顶部品类Tab，作用域仅限于书架
   - 第一项「全部」显示所有绘本总数
   - 后续每项：品类 Emoji + 品类名 + (数量)
   - 点击筛选时书架网格重新渲染

2. **单个绘本卡片改造**（`BookCard` 组件）：
   - 左上角显示品类徽标（Emoji + 品类名小标签），例如 `🎭 成语`、`📜 古诗`
   - 创建时间从「日期」精确到「时分秒」，格式：`2026-06-28 08:30:15`
   - 排序规则仍按 createdAt 降序（最新在前）

3. **交互行为**：
   - 默认选中「全部」，展示所有品类绘本
   - 切换筛选 Tab → 仅展示对应品类绘本
   - 品类徽标点击也可作为快捷筛选入口

4. **空状态适配**：
   - 当前筛选条件下无绘本时显示：「暂无 [品类名] 绘本」
   - 全部筛选下无绘本时显示现有空状态

**涉及组件修改**：
- `BookCard.tsx` — 增加品类徽标 + 时间格式升级
- `app/page.tsx` — 书架区域增加筛选 Tab 状态和过滤逻辑

### 9. 「换一批」推荐机制泛化

当前成语的「换一批」（刷新）功能需要推广到所有品类。整体流程不变，但数据按品类隔离。

**通用刷新流程**：

```
用户点击「换一批」
  → 获取当前品类已显示的条目列表作为排除
  → 调用 recommend API: fetchRecommendations(category, exclude)
  → LLM 根据品类专属 prompt 推荐 10 个新条目
  → DB 持久化: saveRecommendedItems(items, category)
  → 从 DB 按品类随机取 N 条: getRandomItems(category, N)
  → 更新 UI 显示
```

**IndexedDB API 改造**：

```typescript
// 原有成语专属 → 泛化版本
saveRecommendedItems(items: ContentInfo[], category: ContentCategory): Promise<void>
getAllRecommendedItems(category: ContentCategory): Promise<ContentInfo[]>
getRandomItems(category: ContentCategory, n: number): Promise<ContentInfo[]>
```

**品类隔离**：
- 每条推荐数据存储时携带 `category` 字段
- 读取时按 category 过滤，不同品类的推荐互不干扰
- 内置推荐列表（当前 `IDIOM_LIST`）也需要按品类组织

**各品类推荐 prompt 方向**：

| 品类 | 推荐 prompt 特色 |
|------|-----------------|
| 成语 | 推荐适合 3-8 岁儿童的经典成语故事，涵盖寓言/历史/励志 |
| 古诗 | 推荐适合儿童背诵的经典古诗，五言/七言，描写自然/亲情/四季 |
| 儿歌 | 推荐经典童谣和现代儿歌，旋律简单，适合 0-6 岁 |
| 谚语 | 推荐生活智慧类谚语，通俗易懂，有教育意义 |
| 童话 | 推荐经典童话和寓言故事，情节完整，寓意正面 |

## 品类详细设计

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

### 古诗 Decompose Prompt 模板

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

### 谚语 Decompose Prompt 模板

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

### 儿歌品类详细设计

#### 产品逻辑

儿歌绘本的特点是**韵律感**和**重复性**——很多儿歌有副歌（重复段落），场景需要体现这种节奏。

1. 用户在「儿歌」Tab 下浏览推荐儿歌（经典童谣、现代儿歌）
2. 选择一首儿歌 → LLM 分解为 5-8 个场景
3. 每段歌词一个场景，副歌歌词可重复出现但画面变化
4. 图像风格偏向明亮卡通、色彩丰富、童趣盎然
5. 旁白就是歌词本身，用朗读方式呈现韵律感
6. 最后一个场景是合唱/欢聚画面

#### 儿歌示例 — 《小兔子乖乖》分解

```
场景 1: "小兔子乖乖，把门儿开开" — 小兔子在家，听到敲门声
场景 2: "不开不开我不开，妈妈没回来" — 小兔子警觉地摇头
场景 3: "小兔子乖乖，把门儿开开" — 大灰狼假装妈妈再次敲门
场景 4: "不开不开我不开，妈妈没回来" — 小兔子坚决不开
场景 5: "兔妈妈回来了" — 妈妈回来，小兔子开心开门
场景 6: 大家安全在一起，总结安全知识
```

#### 儿歌 Decompose Prompt 模板

```
你是一位儿童绘本策划师，擅长将儿歌/童谣转化为适合 0-6 岁婴幼儿的绘本画面。

请将儿歌「${nurseryRhyme}」拆分为 5-8 个童趣场景。要求：
1. 每段歌词（或每 1-2 句）作为一个场景，歌词有副歌时可重复展现但画面不同
2. 每个场景的 narration（旁白）必须是原歌词，保留韵律和重复感
3. 场景描述要表现出歌词中角色的表情和动作
4. 图像 prompt 风格统一为「明亮卡通风格，色彩鲜艳，圆润可爱，适合婴幼儿」
5. 角色需保持一致外貌特征
6. 最后一个场景建议是温馨团圆或大合唱画面

请严格按照以下 JSON 格式返回：
{
  "meaning": "儿歌的教育意义或主题说明（适合家长了解）",
  "characterDescription": "主要角色的统一外貌描述（英文）",
  "styleDescription": "统一的画风和色调描述（英文，建议明亮卡通风格）",
  "scenes": [
    {
      "title": "场景标题（可用歌词首句）",
      "description": "场景描述（中文，描述画面内容）",
      "prompt": "English prompt for AI image generation, bright cartoon style...",
      "compositionHint": "English composition instruction",
      "narration": "原歌词（保留重复和韵律）"
    }
  ]
}
```

### 童话故事品类详细设计

#### 产品逻辑

童话故事是最复杂的内容类型——它有完整的叙事弧线（引入→上升→高潮→回落→寓意），场景数量也最多。

1. 用户在「童话」Tab 下浏览推荐童话故事（经典童话、原创短篇）
2. 选择一个故事 → LLM 分解为 8-12 个场景
3. 按经典故事弧线拆分：背景引入 → 主角登场 → 冲突出现 → 困难升级 → 转折/高潮 → 解决 → 寓意总结
4. 图像风格偏向经典故事绘本插画风，根据故事氛围调整色调
5. 旁白为完整的叙事文本，适合亲子朗读
6. 角色数量较多，prompt 需精确描述每个角色的外貌

#### 童话故事示例 — 《三只小猪》分解

```
场景 1: 三只小猪离开妈妈，去盖自己的房子（背景引入）
场景 2: 老大懒惰，用稻草盖房（角色性格展示）
场景 3: 老二贪玩，用木头盖房（角色性格展示）
场景 4: 老三勤劳，用砖头盖房（角色性格展示）
场景 5: 大灰狼来到老大的稻草房前吹气（冲突出现）
场景 6: 稻草房倒了，老大逃到老二家（困难升级）
场景 7: 大灰狼吹倒木头房（困难升级）
场景 8: 两只小猪逃到老三的砖房（转折）
场景 9: 大灰狼吹不动砖房，从烟囱爬下（高潮）
场景 10: 大灰狼掉进开水锅，逃跑（解决）
场景 11: 三只小猪安全生活在一起（寓意总结）
```

#### 童话故事 Decompose Prompt 模板

```
你是一位专业的儿童绘本故事策划师，擅长将童话故事改编为适合 3-8 岁儿童的绘本场景。

请将童话故事「${fairyTale}」拆分为 8-12 个绘本场景。要求：
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
  "characterDescription": "所有主要角色的统一外貌描述（英文，逐个角色描述）",
  "styleDescription": "统一的画风和色调描述（英文，建议经典故事绘本插画风）",
  "scenes": [
    {
      "title": "场景标题",
      "description": "场景描述（中文，包含角色动作、环境细节）",
      "prompt": "English prompt for AI image generation, classic storybook illustration style, include character appearances...",
      "compositionHint": "English composition instruction",
      "narration": "旁白叙事文本"
    }
  ]
}
```

## 品类场景结构对比

不同品类的场景结构有本质差异，这影响到 decompose 策略、LLM prompt、以及阅读体验。

| 维度 | 成语 | 古诗 | 儿歌 | 谚语 | 童话 |
|------|------|------|------|------|------|
| **内容本质** | 四字典故故事 | 诗句意境 | 歌词韵律 | 生活道理 | 完整叙事 |
| **场景数量** | 5-10 | 4-8 | 5-8 | 4-6 | 8-12 |
| **场景结构** | 起承转合叙事 | 逐句展开意境 | 逐段歌词画面化 | 生活片段举例 | 故事弧线 |
| **开头场景** | 起因 | 首句意境 | 第一段歌词 | 日常引入 | 背景/角色 |
| **中间场景** | 经过/转折 | 中间诗句 | 主歌/副歌交替 | 多个事例 | 冲突/升级 |
| **结尾场景** | 结局/寓意 | 末句+总结 | 合唱/团圆 | 道理点题 | 解决+寓意 |
| **角色** | 统一角色 | 诗人/拟人元素 | 故事角色 | 小朋友/动物 | 多角色区分 |
| **旁白风格** | 故事旁白 | 原诗+白话解释 | 原歌词 | 生活引导语 | 叙事朗读 |
| **图像风格** | 统一卡通 | 中国古典水墨 | 明亮卡通 | 温暖绘本 | 经典插画 |
| **保留原意** | 故事完整性 | 原诗逐句呈现 | 歌词完整性 | 道理不直说 | 故事完整性 |

**核心原则**：每个品类的场景结构都是为该品类「完整保留原文含义」服务的——
- 古诗：逐句呈现，不遗漏任何一句诗
- 儿歌：逐段呈现，保留歌词完整性和韵律感
- 童话：完整叙事弧线，不省略关键情节
- 谚语：不直接说道理，而是用生活场景让孩子自然领悟

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

### 阶段三：品类策略落地（逐品类扩展）

每个品类独立按以下顺序落地：
1. 实现策略类（`PoetryStrategy` / `NurseryRhymeStrategy` / `ProverbStrategy` / `FairyTaleStrategy`）
2. 品类专属 decompose prompt 调优
3. 品类专属 recommend prompt 调优
4. 预生成内容 — **走真实流水线**（见第 7 节）
5. 端到端验证

**品类落地优先级**：
1. 古诗 — decompose prompt 已定型，按诗→意境场景
2. 儿歌 — 歌词→画面，副歌重复逻辑需调优
3. 谚语 — 抽象→具象生活场景，不需原文逐字对应
4. 童话 — 最长场景数（8-12），故事弧线拆分需精细控制

成语重制见阶段四。


### 阶段四：现有预生成成语重制

成语是 P0 品类，必须保证质量：

1. 使用 `IdiomStrategy.getDecomposePrompt()` 重新分解现有 6 个成语
2. 按实际流水线生成所有场景的图像
3. 验证：场景数 ≥ 5、有 `characterDescription`、有 `compositionHint`
4. 扩充成语库至 15-20 个常见成语
5. 删除旧版预生成 JSON（`public/generated/` 下的旧格式文件）

## 涉及文件清单

### 新增文件
- `lib/content-types/index.ts` — 策略注册表
- `lib/content-types/types.ts` — 策略接口定义
- `lib/content-types/idiom-strategy.ts` — 成语策略实现
- `lib/content-types/poetry-strategy.ts` — 古诗策略实现
- `lib/content-types/nursery-rhyme-strategy.ts` — 儿歌策略实现
- `lib/content-types/proverb-strategy.ts` — 谚语策略实现
- `lib/content-types/fairy-tale-strategy.ts` — 童话故事策略实现
- `components/CategoryTabs.tsx` — 标签页组件

### 修改文件
- `lib/types.ts` — 泛化 PictureBook + 新增 ContentCategory
- `lib/idioms.ts` → `lib/content-info.ts` — 泛化 ContentInfo
- `lib/db.ts` — 缩减为仅保留 tasks / recommendedItems / settings 表，移除 pictureBooks + scenes
- `lib/store.ts` — 支持 category 状态，移除 pictureBooks（改走文件系统）
- `lib/task-store.ts` — Task 添加 category
- `lib/task-executor.ts` — 按 category 分发 decompose，保存逻辑改为输出文件系统格式
- `app/page.tsx` — 首页 Tab 改造 + 书架加载改为 fetch index.json
- `app/read/[id]/page.tsx` — 读取改为 fetch book.json
- `app/actions/decompose.ts` → `app/actions/decompose.ts` 策略化
- `app/actions/recommend.ts` → `app/actions/recommend.ts` 策略化
- `components/IdiomSelector.tsx` → 通用 ContentSelector
- `components/Header.tsx` — 标题更新
- `components/BookCard.tsx` — 品类徽标 + 时间格式 `YYYY-MM-DD HH:mm:ss`
- `components/BookViewer.tsx` — 图片加载路径适配新目录
- `scripts/batch-generate.js` — 完整流水线改写
- `app/layout.tsx` — SEO metadata 更新
