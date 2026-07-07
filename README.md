# 🎨 绘本工坊

> 面向亲子用户的互动式多品类绘本生成平台。选择内容（成语、诗歌、儿歌、谚语、童话），AI 自动生成分镜与漫画风格插图，在线翻页阅读，导出 PDF 打印成实体书。

## ✨ 功能特性

- 📂 **多品类内容** — 支持成语、诗歌、儿歌、谚语、童话五大品类，每品类内置精选内容
- 🤖 **AI 分镜生成** — LLM 将内容拆分为多个关键场景
- 🎨 **实时图像生成** — 为每个场景生成漫画风格插图
- 📖 **翻页阅读** — 真实翻页动画，沉浸式阅读体验
- 🎬 **视频生成** — 将绘本场景转化为动态视频（关键帧动画）
- 📄 **PDF 导出** — 一键导出可打印的 PDF 绘本
- ⚡ **后端任务引擎** — 独立 Worker 进程串行执行生成任务，支持暂停/继续/取消/重试
- 🗄️ **SQLite 持久化** — 任务状态和绘本数据持久化存储
- 💾 **本地图像存储** — 所有图像持久化到本地文件系统

## 🚀 快速开始

### 环境要求

- Node.js 18+
- npm 或 yarn

### 安装与运行

```bash
# 克隆项目
git clone <repo-url>
cd idiom-picture-book-web

# 安装依赖
npm install

# 配置环境变量
# 创建 .env.local 文件，填入 Agnes API Key
echo "AGNES_API_KEY=your_api_key_here" > .env.local

# 启动开发服务器 + Worker（推荐）
npm run dev:all

# 或仅启动前端
npm run dev
```

访问 http://localhost:3000

### 构建部署

```bash
# 构建生产版本
npm run build

# 启动生产服务器
npm run start
```

## 📁 项目结构

```
idiom-picture-book-web/
├── app/
│   ├── layout.tsx                # 根布局
│   ├── page.tsx                  # 首页 — 品类选择 + 内容选择 + 任务队列
│   ├── generate/page.tsx         # 生成进度页
│   ├── read/[id]/page.tsx        # 绘本阅读页
│   ├── actions/
│   │   ├── decompose.ts          # LLM 分镜拆分 (Server Action)
│   │   ├── generate.ts           # 图像/视频生成 (Server Action)
│   │   └── recommend.ts          # AI 内容推荐 (Server Action)
│   └── api/
│       ├── books/[id]/route.ts   # 绘本详情 API
│       ├── books/route.ts        # 绘本列表 API
│       ├── decompose/route.ts    # 分镜拆分 API
│       ├── generate-image/route.ts # 图像生成 API
│       ├── jobs/route.ts         # 任务列表 API
│       ├── jobs/[id]/route.ts    # 任务详情 API
│       ├── jobs/[id]/pause/route.ts   # 暂停任务
│       ├── jobs/[id]/resume/route.ts  # 恢复任务
│       ├── jobs/[id]/cancel/route.ts  # 取消任务
│       ├── jobs/[id]/retry/route.ts   # 重试任务
│       └── save-book/route.ts    # 保存绘本 API
├── components/
│   ├── CategoryTabs.tsx          # 品类标签切换
│   ├── ContentSelector.tsx       # 内容选择器（按品类展示推荐列表）
│   ├── BookCard.tsx              # 绘本卡片
│   ├── BookViewer.tsx            # 翻页阅读器
│   ├── TaskQueue.tsx             # 任务队列面板
│   ├── TaskCard.tsx              # 任务卡片（主/子任务）
│   ├── VideoGenerator.tsx        # 视频生成器
│   ├── Header.tsx                # 页头导航
│   └── SceneCard.tsx             # 场景卡片
├── lib/
│   ├── agnes-api.ts              # 生成 API 统一封装（向后兼容）
│   ├── content-info.ts           # 各品类内置内容列表
│   ├── content-types/            # 各品类分镜策略
│   ├── generation/               # 🔌 通用多模型 Provider 抽象层
│   │   ├── types.ts              #   ImageProvider / VideoProvider 接口
│   │   ├── config.ts             #   环境变量配置读取
│   │   ├── registry.ts           #   Provider 注册表 + 工厂
│   │   ├── index.ts              #   统一导出
│   │   └── adapters/
│   │       └── agnes.ts          #   Agnes 适配器实现
│   ├── task-db.ts                # SQLite 任务数据库
│   ├── task-types.ts             # 任务类型定义
│   ├── path-security.ts          # 路径安全校验
│   ├── pdf.ts                    # PDF 生成
│   ├── save-book.ts              # 绘本保存逻辑
│   ├── store.ts                  # 应用状态管理
│   ├── types.ts                  # TypeScript 类型定义
│   ├── use-jobs.ts               # 任务状态 Hook（SWR 轮询）
│   └── book-display.ts           # 绘本展示逻辑
├── middleware.ts                 # Next.js 中间件（路径安全）
├── worker.ts                     # 任务执行 Worker 进程
├── docs/                         # 设计文档与实施计划
└── public/                       # 静态资源
    └── generated/                # 已生成的绘本
        ├── index.json            # 绘本索引
        ├── idiom/                # 成语绘本
        ├── poetry/               # 诗歌绘本
        ├── nursery-rhyme/        # 儿歌绘本
        ├── proverb/              # 谚语绘本
        └── fairy-tale/           # 童话绘本
```

## 🛠 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 框架 | Next.js 14 (App Router) | React 全栈框架 |
| UI | Tailwind CSS | 原子化 CSS 框架 |
| 状态管理 | Zustand | 轻量级状态管理 |
| 本地存储 | SQLite (better-sqlite3) | 任务状态持久化 |
| 图像存储 | 本地文件系统 | 绘本图像持久化 |
| API 调用 | Next.js Server Actions / API Routes | 保护 API Key 安全 |
| LLM 对话 | Agnes-2.0-Flash（可切换） | 分镜拆分与故事生成，支持任何 OpenAI 兼容端点 |
| 图像生成 | Agnes Image 2.1 Flash（可切换） | 漫画风格插图生成，Provider 抽象层支持多模型 |
| 视频生成 | Agnes Video V2.0（可切换） | 关键帧动画视频，Provider 抽象层支持多模型 |
| PDF 生成 | jsPDF | 客户端 PDF 导出 |
| 翻页效果 | react-pageflip | 真实翻页动画 |
| 任务轮询 | SWR | 前端实时获取任务状态 |
| Worker | tsx | 独立任务执行进程 |

## 📖 使用说明

### 基本流程

1. **选择品类** — 切换品类标签（成语 / 诗歌 / 儿歌 / 谚语 / 童话）
2. **选择内容** — 从内置推荐列表中选择，或输入自定义内容
3. **开始生成** — AI 自动拆分分镜并逐个生成插图，可在任务队列查看进度
4. **阅读绘本** — 生成完成后，进入翻页阅读
5. **导出分享** — 导出 PDF 打印成实体书，或生成视频分享

### 内置内容

**成语** — 画蛇添足、守株待兔、亡羊补牢、井底之蛙、狐假虎威、掩耳盗铃、刻舟求剑、愚公移山、拔苗助长、叶公好龙

**诗歌** — 静夜思、春晓、咏鹅、悯农、登鹳雀楼、江雪、望庐山瀑布、绝句

**儿歌** — 小兔子乖乖、两只老虎、小燕子、数鸭子、拔萝卜、小星星

**谚语** — 三个臭皮匠顶个诸葛亮、路遥知马力日久见人心、近朱者赤近墨者黑 等

**童话** — 小红帽、龟兔赛跑 等

### 任务管理

- 多内容批量排队生成
- 主/子任务手风琴展开
- 串行执行，自动重试失败任务
- 支持暂停/继续/取消控制
- SQLite 持久化，Worker 进程异步执行

## 🔧 开发指南

### 开发命令

```bash
# 启动前端 + Worker（推荐）
npm run dev:all

# 仅启动前端
npm run dev

# 仅启动 Worker
npm run worker

# 构建生产版本
npm run build

# 启动生产服务器
npm run start

# 代码检查
npm run lint
```

### 环境变量

#### 基础配置（向后兼容）

```env
# LLM 对话（支持任何 OpenAI 兼容端点）
LLM_API_KEY=your_llm_api_key_here
LLM_API_BASE=https://apihub.agnes-ai.com/v1
LLM_MODEL=agnes-2.0-flash

# Agnes 密钥（图像/视频默认复用此 Key）
AGNES_API_KEY=your_agnes_api_key_here
```

#### Provider 配置（多模型切换）

```env
# ── 生图 Provider（默认 agnes，后续可切换其他模型） ─────────
IMAGE_PROVIDER=agnes              # Provider 名称：agnes | openai-dalle | flux | ...
IMAGE_API_KEY=                    # 留空则复用 AGNES_API_KEY
IMAGE_API_BASE=                   # 留空则使用 Provider 默认端点
IMAGE_MODEL=                      # 留空则使用 Provider 默认模型

# ── 视频 Provider（默认 agnes，后续可切换其他模型） ─────────
VIDEO_PROVIDER=agnes              # Provider 名称：agnes | runway | kling | ...
VIDEO_API_KEY=                    # 留空则复用 AGNES_API_KEY
VIDEO_API_BASE=                   # 留空则使用 Provider 默认端点
VIDEO_MODEL=                      # 留空则使用 Provider 默认模型
VIDEO_FRAMES=241                  # 默认总帧数
VIDEO_FPS=24                      # 默认帧率

# ── 图片/视频下载域名白名单 ─────────────────────────────────
# Worker 下载生成的图片/视频时会校验 URL 域名，防止 SSRF
# 逗号分隔，需包含 API 网关域名 + Provider 返回的 CDN 域名
ALLOWED_IMAGE_DOMAINS=apihub.agnes-ai.com,platform-outputs.agnes-ai.space
```

### 架构说明

```
用户选择内容
  → Next.js API Route 创建 Job → SQLite 持久化
  → Worker 进程轮询 Job → 执行分镜拆分 → 逐个生成图像
  → 前端 SWR 轮询任务状态 → 实时更新 UI
  → 生成完成 → 翻页阅读 / PDF 导出 / 视频生成
```

#### 多模型 Provider 抽象层 (`lib/generation/`)

生图 / 生视频逻辑通过统一的 Provider 接口抽象，支持通过环境变量无缝切换底层模型：

```
lib/agnes-api.ts（向后兼容层）
  ↓ 委托
lib/generation/registry.ts（Provider 注册表 + 工厂）
  ↓ 按名称加载
lib/generation/adapters/agnes.ts（Agnes 适配器）
  ↓ 实现
lib/generation/types.ts（ImageProvider / VideoProvider 接口）
```

**对接新模型只需三步**：

1. 创建适配器实现 `ImageProvider` 或 `VideoProvider` 接口
2. 调用 `registerImage('name', factory)` 或 `registerVideo('name', factory)` 注册
3. 设置环境变量 `IMAGE_PROVIDER=name` / `VIDEO_PROVIDER=name`

业务代码（worker、actions、UI）无需任何改动。

#### 数据存储

- **任务状态** — SQLite (`picture-book-tasks.db`)
- **绘本图像** — 本地文件系统 (`public/generated/{category}/{title}/`)
- **绘本索引** — `public/generated/index.json`

## 📚 相关文档

- [后端任务执行架构设计](docs/plans/2026-06-28-backend-task-execution.md)
- [后端任务执行设计文档](docs/plans/2026-06-28-backend-task-execution-design.md)

## 📄 许可证

MIT
