# 成语绘本 Web 项目设计文档

## 1. 项目概述

### 1.1 项目名称
成语绘本工坊 (Idiom Picture Book Workshop)

### 1.2 项目定位
一个面向亲子用户的互动式成语绘本生成平台。家长和孩子可以在浏览器中选择成语、实时生成漫画风格插图、在线翻页阅读绘本，并导出 PDF 打印成实体书。

### 1.3 核心价值
- **寓教于乐**：通过漫画风格的视觉呈现，让孩子更容易理解成语含义
- **亲子互动**：家长和孩子一起参与创作过程，增进亲子关系
- **专注体验**：每次专注一个成语，深度叙事，沉浸式阅读

## 2. 技术架构

### 2.1 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 框架 | Next.js 14+ (App Router) | React 全栈框架 |
| UI | Tailwind CSS + shadcn/ui | 样式系统和组件库 |
| 状态管理 | React Context + Zustand | 轻量级状态管理 |
| 本地存储 | IndexedDB (via Dexie.js) | 存储图像/视频 blob，容量大 |
| PDF 生成 | jsPDF + html2canvas | 客户端 PDF 导出 |
| 翻页效果 | react-pageflip | 真实翻页动画 |
| API 调用 | Next.js Server Actions | 保护 API Key |
| LLM 对话 | Agnes-2.0-Flash | 场景拆分与故事生成 |
| 视频生成 | Agnes Video V2.0 | 绘本视频生成（关键帧动画） |
| TTS 朗读 | Web Speech API（后续） | 旁白自动朗读 |

**说明：** 所有 Agnes API（LLM、图像、视频）共用同一个 API Key。

### 2.2 架构方案：Server Actions + IndexedDB + LLM

**选择理由：**
- Server Actions 是 Next.js 原生方案，API Key 安全存储在服务端
- IndexedDB 存储容量大（数百 MB），适合存储图像 blob
- 无需外部云存储服务，部署简单
- 客户端 PDF 生成，无需服务端资源
- LLM 动态生成场景，支持任意成语（包括自定义输入）

**数据流：**
```
用户选择/输入成语
    → Server Action 调用 LLM → 拆分为 6 个场景（标题、描述、旁白、提示词）
    → 逐个调用 Agnes Image API → 生成场景插图
    → 客户端下载图像 → 存入 IndexedDB → 更新 UI
    → [可选] 调用 Agnes Video API → 生成绘本视频
```

### 2.3 项目结构

```
idiom-picture-book-web/
├── app/
│   ├── layout.tsx              # 根布局
│   ├── page.tsx                # 首页 - 成语选择
│   ├── generate/
│   │   └── page.tsx            # 生成进度页
│   ├── read/
│   │   └── [id]/page.tsx       # 绘本阅读页
│   └── actions/
│       ├── decompose.ts        # LLM 场景拆分
│       └── generate.ts         # 图像生成
├── components/
│   ├── IdiomSelector.tsx       # 成语选择器
│   ├── ScenePreview.tsx        # 场景预览/编辑
│   ├── BookViewer.tsx          # 翻页阅读器
│   ├── ProgressBar.tsx         # 生成进度
│   └── SceneCard.tsx           # 场景卡片
├── lib/
│   ├── agnes-api.ts            # Agnes API 统一封装（LLM + 图像）
│   ├── db.ts                   # IndexedDB 操作
│   ├── idioms.ts               # 成语数据
│   └── pdf.ts                  # PDF 生成
└── package.json
```

## 3. 功能模块

### 3.1 模块一：成语选择与 LLM 场景拆分

**功能描述：**
用户选择一个成语，系统调用 LLM 将成语故事拆分为 6 个关键场景，然后调用 Agnes Image API 为每个场景生成漫画风格插图。

**交互流程：**
1. 从预设列表中选择一个成语，或手动输入自定义成语
2. 系统调用 LLM 将成语拆分为 6 个场景
3. 用户可预览/编辑场景描述（可选）
4. 逐个生成 6 个场景的插图
5. 全部完成后自动跳转到阅读页

**LLM 场景拆分 Prompt：**
```
你是一位专业的儿童绘本故事策划。请将成语「{idiom}」的故事拆分为 6 个关键场景。

要求：
1. 每个场景需要包含：标题、场景描述（用于生成图像的提示词）、旁白文本（适合朗读给孩子听）
2. 场景要按故事发展顺序排列，形成完整的叙事弧线
3. 场景描述要具体、生动，适合 AI 图像生成
4. 旁白文本要简洁、有韵律感，适合亲子朗读
5. 整体风格要适合 3-8 岁儿童

请以 JSON 格式返回：
{
  "meaning": "成语的含义解释",
  "scenes": [
    {
      "title": "场景标题",
      "description": "场景描述",
      "prompt": "用于 AI 图像生成的英文提示词，漫画风格",
      "narration": "旁白文本"
    }
  ]
}
```

**LLM 返回示例（叶公好龙）：**
```json
{
  "meaning": "比喻自称爱好某事物，其实并不是真爱好",
  "scenes": [
    {
      "title": "叶公爱龙",
      "description": "叶公在豪华的书房里，周围摆满了龙的装饰品",
      "prompt": "Ancient Chinese official's study room decorated with dragon ornaments, paintings, and sculptures, cartoon style, warm lighting",
      "narration": "从前，有位叫叶公的人，他非常喜欢龙。"
    },
    ...
  ]
}
```

### 3.2 模块二：翻页阅读

**功能描述：**
生成完成后，用户可以翻页阅读绘本，每页展示一个场景的插图和旁白文本。

**场景结构：**
- 场景编号和标题
- 场景插图
- 场景描述文本
- 旁白文本（适合朗读）

### 3.3 模块三：视频生成

**功能描述：**
将生成的绘本场景转化为动态视频，使用 Agnes Video API 的关键帧动画功能，在 6 个场景之间生成流畅过渡。

**视频生成模式：**
- **单场景动画** — 将单个场景插图动画化（图生视频）
- **完整绘本视频** — 将 6 个场景串联成完整故事视频（关键帧动画）

**技术实现：**
```
场景插图（6张）→ Agnes Video API（关键帧动画模式）→ 完整绘本视频
```

**API 调用：**
```typescript
// 使用关键帧动画模式
{
  model: "agnes-video-v2.0",
  prompt: "生成流畅的绘本故事动画，场景之间自然过渡",
  extra_body: {
    image: [scene1ImageUrl, scene2ImageUrl, ...scene6ImageUrl],
    mode: "keyframes"
  },
  num_frames: 241,  // 约 10 秒
  frame_rate: 24
}
```

**用户体验：**
1. 绘本生成完成后，显示「生成视频」按钮
2. 点击后开始异步生成视频（约 2-5 分钟）
3. 显示生成进度
4. 完成后可在线播放或下载视频

### 3.4 模块四：导出 PDF / 打印

**功能描述：**
将生成的绘本导出为 PDF 文件，方便打印成实体书。

**PDF 结构：**
- 封面页：绘本标题、生成日期
- 内容页：每页包含插图 + 文本
- 封底页：成语释义汇总

### 3.5 后续规划：TTS 语音朗读

**功能描述：**
集成 TTS（Text-to-Speech）技术，在绘本阅读时自动朗读旁白文本，提升亲子阅读体验。

**技术方案：**

| 方案 | 说明 | 优缺点 |
|------|------|--------|
| Web Speech API | 浏览器原生 TTS | ✅ 免费、无需后端 ❌ 音质一般、方言支持有限 |
| 第三方 TTS 服务 | 如 Azure Speech、Google Cloud TTS | ✅ 音质好、支持多语言 ❌ 需付费、需后端 |
| Agnes TTS | 如 Agnes 提供 TTS 能力 | ✅ 统一 API ❌ 需确认是否支持 |

**功能特性：**
- 自动朗读：翻页时自动播放当前页旁白
- 朗读控制：播放/暂停/重播按钮
- 语速调节：支持调整朗读速度
- 高亮同步：朗读时高亮当前文字
- 背景音乐：可选的轻柔背景音乐

**用户流程：**
```
打开绘本 → 点击「🔊 朗读」按钮 → 自动朗读旁白 → 翻页时自动切换
```

## 4. 页面设计

### 4.1 首页 (/)

**布局：**
- 顶部：品牌标题「成语绘本工坊」
- 成语选择器：内置成语网格 + 自定义输入框
- 操作按钮：「开始生成绘本」

**内置成语列表：**
画蛇添足、守株待兔、亡羊补牢、井底之蛙、狐假虎威、掩耳盗铃、刻舟求剑、愚公移山、拔苗助长、叶公好龙

### 4.2 生成页 (/generate)

**布局：**
- 顶部：生成状态标题（显示当前成语名称）
- 第一阶段：LLM 场景拆分（显示「AI 正在构思故事...」）
- 第二阶段：图像生成进度
  - 总体进度条
  - 场景卡片网格：每个卡片显示场景状态（等待/生成中/完成）
- 趣味知识卡片：展示成语相关的趣味知识

**状态流转：**
1. 初始化 → 调用 LLM 拆分场景
2. LLM 返回 → 显示场景预览（可选编辑）
3. 开始生成图像 → 实时更新进度
4. 全部完成 → 自动跳转到阅读页

### 4.3 阅读页 (/read/[id])

**布局：**
- 顶部工具栏：返回、标题、朗读按钮、生成视频按钮、导出 PDF 按钮
- 中间：翻页阅读器（左右两页布局）
- 底部：页码指示器、翻页按钮、朗读控制栏

**翻页交互：**
- 左右箭头按钮翻页
- 键盘左右键翻页
- 触摸/鼠标拖拽翻页（移动端）

**视频生成交互：**
- 点击「生成视频」按钮后，显示视频生成进度弹窗
- 生成完成后，显示视频播放器
- 支持在线播放和下载视频

**朗读交互（后续规划）：**
- 点击「🔊 朗读」按钮开启自动朗读模式
- 朗读时高亮当前正在朗读的文字
- 翻页时自动切换到下一页旁白
- 底部显示朗读控制栏：播放/暂停、语速调节、音量控制

## 5. 数据模型

### 5.1 绘本数据结构 (IndexedDB)

```typescript
interface PictureBook {
  id: string;                    // 唯一标识
  title: string;                 // 绘本标题（即成语）
  idiom: string;                 // 成语
  meaning: string;               // 成语含义（由 LLM 生成）
  createdAt: string;             // 创建时间
  scenes: Scene[];               // 场景列表（6个场景）
  videoBlob?: Blob;              // 绘本视频（可选，存储在 IndexedDB）
  videoUrl?: string;             // 视频临时 URL
}

interface Scene {
  id: number;                    // 场景编号
  title: string;                 // 场景标题（由 LLM 生成）
  description: string;           // 场景描述（由 LLM 生成）
  narration: string;             // 旁白文本（由 LLM 生成）
  prompt: string;                // 图像生成提示词（由 LLM 生成）
  imageBlob: Blob;               // 图像数据（存储在 IndexedDB）
  imageHash: string;             // 图像哈希（用于去重）
}
```

### 5.2 LLM 返回的场景模板

```typescript
interface SceneTemplate {
  title: string;                 // 场景标题
  description: string;           // 场景描述（中文）
  prompt: string;                // 图像生成提示词（英文）
  narration: string;             // 旁白文本
}

interface IdiomDecomposition {
  idiom: string;                 // 成语
  meaning: string;               // 成语含义
  scenes: SceneTemplate[];       // 6 个场景模板
}
```

### 5.2 成语模板数据

```typescript
interface IdiomTemplate {
  idiom: string;                 // 成语
  meaning: string;               // 含义
  simplePrompt: string;          // 简单模式提示词
  scenes: SceneTemplate[];       // 多场景模板
}

interface SceneTemplate {
  title: string;                 // 场景标题
  description: string;           // 场景描述
  prompt: string;                // 生成提示词
  narration: string;             // 旁白文本
}
```

## 6. API 设计

### 6.1 Agnes API 统一封装

Agnes API 同时提供 LLM 对话和图像生成能力，使用同一个 API Key。

```typescript
// lib/agnes-api.ts
const API_BASE = 'https://apihub.agnes-ai.com/v1'
const API_KEY = process.env.AGNES_API_KEY

// LLM 对话（场景拆分）
export async function chatCompletion(messages: ChatMessage[]) {
  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'agnes-2.0-flash',
      messages,
      temperature: 0.7,
      max_tokens: 2048
    })
  })
  return response.json()
}

// 图像生成
export async function generateImage(prompt: string, size = '1024x768') {
  const response = await fetch(`${API_BASE}/images/generations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'agnes-image-2.1-flash',
      prompt,
      size,
      extra_body: { response_format: 'url' }
    })
  })
  return response.json()
}
```

### 6.2 Server Action: decomposeIdiom

```typescript
// app/actions/decompose.ts
'use server'

export async function decomposeIdiom(idiom: string) {
  const prompt = `你是一位专业的儿童绘本故事策划。请将成语「${idiom}」的故事拆分为 6 个关键场景。

要求：
1. 每个场景需要包含：标题、场景描述（用于生成图像的提示词）、旁白文本（适合朗读给孩子听）
2. 场景要按故事发展顺序排列，形成完整的叙事弧线
3. 场景描述要具体、生动，适合 AI 图像生成
4. 旁白文本要简洁、有韵律感，适合亲子朗读
5. 整体风格要适合 3-8 岁儿童

请以 JSON 格式返回：
{
  "meaning": "成语的含义解释",
  "scenes": [
    {
      "title": "场景标题",
      "description": "场景描述",
      "prompt": "用于 AI 图像生成的英文提示词，漫画风格",
      "narration": "旁白文本"
    }
  ]
}`

  const result = await chatCompletion([
    { role: 'system', content: '你是一位专业的儿童绘本故事策划，擅长将成语故事拆分为适合儿童阅读的场景。' },
    { role: 'user', content: prompt }
  ])

  // 解析 JSON 响应
  const content = result.choices[0].message.content
  const data = JSON.parse(content)
  return { scenes: data.scenes, meaning: data.meaning }
}
```

### 6.3 Server Action: generateImage

```typescript
// app/actions/generate.ts
'use server'

export async function generateImage(prompt: string, size?: string) {
  const result = await agnesApi.generateImage(prompt, size)
  return { imageUrl: result.data[0].url }
}
```

### 6.4 视频生成 API

```typescript
// lib/agnes-api.ts 新增视频相关函数

// 创建视频任务（关键帧动画）
export async function createVideoTask(imageUrls: string[], prompt: string) {
  const response = await fetch(`${API_BASE}/v1/videos`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'agnes-video-v2.0',
      prompt: prompt || '生成流畅的绘本故事动画，场景之间自然过渡，卡通漫画风格',
      extra_body: {
        image: imageUrls,
        mode: 'keyframes'
      },
      num_frames: 241,  // 约 10 秒
      frame_rate: 24
    })
  })
  return response.json()
}

// 查询视频生成状态
export async function getVideoResult(videoId: string) {
  const response = await fetch(`${API_BASE}/agnesapi?video_id=${videoId}`, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`
    }
  })
  return response.json()
}
```

### 6.5 Server Action: generateVideo

```typescript
// app/actions/generate-video.ts
'use server'

export async function generateVideo(imageUrls: string[]) {
  // 1. 创建视频任务
  const task = await createVideoTask(imageUrls)
  const videoId = task.video_id

  // 2. 轮询等待完成（最多 5 分钟）
  let result
  for (let i = 0; i < 30; i++) {
    await new Promise(resolve => setTimeout(resolve, 10000))  // 等待 10 秒
    result = await getVideoResult(videoId)

    if (result.status === 'completed') {
      return { videoUrl: result.remixed_from_video_id }
    } else if (result.status === 'failed') {
      throw new Error('视频生成失败')
    }
  }

  throw new Error('视频生成超时')
}
```

### 6.6 完整生成流程

```typescript
// app/actions/generate-book.ts
'use server'

export async function generatePictureBook(idiom: string) {
  // 1. 调用 LLM 拆分场景
  const { scenes, meaning } = await decomposeIdiom(idiom)

  // 2. 逐个生成图像
  for (const scene of scenes) {
    const { imageUrl } = await generateImage(scene.prompt)
    scene.imageUrl = imageUrl
  }

  // 3. 返回完整绘本数据
  return { idiom, meaning, scenes }
}

// 生成绘本视频（可选）
export async function generateBookVideo(imageUrls: string[]) {
  return generateVideo(imageUrls)
}
```

## 7. 视觉设计规范

### 7.1 设计风格
童趣绘本风 — 圆润的卡片、柔和的渐变色、手绘风格元素、可爱的图标

### 7.2 配色方案

| 用途 | 颜色 | 色值 |
|------|------|------|
| 主色调 | 柔和橙色 | #fcb69f |
| 辅助色 | 暖粉色 | #ffecd2 |
| 强调色 | 活力紫 | #f093fb |
| 成功色 | 清新绿 | #4caf50 |
| 背景色 | 米白色 | #faf7f5 |

### 7.3 组件风格
- 卡片：圆角 16px，柔和阴影
- 按钮：圆角 25px（胶囊形），渐变背景
- 字体：思源黑体 / Noto Sans SC

## 8. 开发计划

### 8.1 阶段一：基础框架（1天）
- 项目初始化（Next.js + Tailwind + shadcn/ui）
- IndexedDB 封装（Dexie.js）
- Server Action 基础架构

### 8.2 阶段二：LLM 场景拆分（1天）
- Agnes-2.0-Flash API 封装
- 场景拆分 Prompt 设计
- 场景预览/编辑组件

### 8.3 阶段三：图像生成与阅读（2天）
- 成语选择器组件
- 图像生成流程
- 翻页阅读器组件

### 8.4 阶段四：视频生成与导出（1天）
- Agnes Video API 封装
- 视频生成流程（关键帧动画）
- 视频播放器组件
- PDF 导出功能
- 移动端适配

### 8.5 后续规划：TTS 语音朗读（1天）
- TTS API 集成（Web Speech API / 第三方 TTS 服务）
- 旁白文本自动朗读
- 朗读与翻页同步
- 朗读控制（播放/暂停/语速）
- 多语言/多方言支持（可选）

## 9. 环境变量

```env
AGNES_API_KEY=your_agnes_api_key_here
```

**说明：** Agnes API Key 同时用于 LLM 对话（场景拆分）和图像生成，无需额外配置。

## 10. 依赖清单

```json
{
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
    "tailwindcss": "^3.3.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0"
  }
}
```
