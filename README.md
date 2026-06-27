# 🎨 成语绘本工坊

> 一个面向亲子用户的互动式成语绘本生成平台。选择成语，AI 自动生成漫画风格插图，在线翻页阅读，导出 PDF 打印成实体书。

## ✨ 功能特性

- 🎭 **成语选择** — 内置 10 个经典成语 + 自定义输入，支持多选批量生成
- 🤖 **AI 场景拆分** — LLM 将成语故事拆分为 6 个关键场景
- 🎨 **实时图像生成** — 为每个场景生成漫画风格插图，支持构图指令优化
- 📖 **翻页阅读** — 真实翻页动画，沉浸式阅读体验
- 🎬 **视频生成** — 将绘本场景转化为动态视频（关键帧动画）
- 📄 **PDF 导出** — 一键导出可打印的 PDF 绘本
- 📋 **任务队列** — 主/子任务模型，手风琴展开，串行执行
- 💾 **本地持久化** — IndexedDB 存储图像和任务，刷新不丢失

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

# 启动开发服务器
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
│   ├── page.tsx                  # 首页 - 成语选择 + 任务队列
│   ├── generate/page.tsx         # 生成进度页
│   ├── read/[id]/page.tsx        # 绘本阅读页
│   └── actions/
│       ├── decompose.ts          # LLM 场景拆分 (Server Action)
│       └── generate.ts           # 图像/视频生成 (Server Action)
├── components/
│   ├── IdiomSelector.tsx         # 成语选择器（支持多选）
│   ├── TaskQueue.tsx             # 任务队列面板
│   ├── TaskCard.tsx              # 任务卡片（主/子任务）
│   ├── TaskManager.tsx           # 任务管理器
│   ├── BookViewer.tsx            # 翻页阅读器
│   ├── SceneCard.tsx             # 场景卡片
│   ├── VideoGenerator.tsx        # 视频生成器
│   ├── Header.tsx                # 页头导航
│   └── DuplicateCheckDialog.tsx  # 重复检查对话框
├── lib/
│   ├── agnes-api.ts              # Agnes API 统一封装
│   ├── db.ts                     # IndexedDB (Dexie.js)
│   ├── task-store.ts             # Zustand 任务状态管理
│   ├── task-executor.ts          # 任务执行器
│   ├── store.ts                  # Zustand 应用状态
│   ├── types.ts                  # TypeScript 类型定义
│   ├── idioms.ts                 # 成语数据
│   └── pdf.ts                    # PDF 生成
├── docs/                         # 设计文档与实施计划
└── public/                       # 静态资源
```

## 🛠 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 框架 | Next.js 14 (App Router) | React 全栈框架 |
| UI | Tailwind CSS | 原子化 CSS 框架 |
| 状态管理 | Zustand | 轻量级状态管理 |
| 本地存储 | IndexedDB (Dexie.js) | 存储图像 blob 和任务数据 |
| API 调用 | Next.js Server Actions | 保护 API Key 安全 |
| LLM 对话 | Agnes-2.0-Flash | 场景拆分与故事生成 |
| 图像生成 | Agnes Image 2.1 Flash | 漫画风格插图生成 |
| 视频生成 | Agnes Video V2.0 | 关键帧动画视频 |
| PDF 生成 | jsPDF | 客户端 PDF 导出 |
| 翻页效果 | react-pageflip | 真实翻页动画 |

## 📖 使用说明

### 基本流程

1. **选择成语** — 从内置列表中选择成语，或输入自定义成语
2. **批量生成** — 支持多选成语，点击「批量生成」开始
3. **等待生成** — AI 自动拆分场景并逐个生成插图，可在任务队列查看进度
4. **阅读绘本** — 生成完成后，点击「查看绘本」进入翻页阅读
5. **导出分享** — 导出 PDF 打印成实体书，或生成视频分享

### 内置成语

画蛇添足、守株待兔、亡羊补牢、井底之蛙、狐假虎威、掩耳盗铃、刻舟求剑、愚公移山、拔苗助长、叶公好龙

### 任务队列

- 支持多成语批量排队
- 主/子任务手风琴展开
- 串行执行，自动重试（最多 3 次）
- 暂停/继续/取消控制
- IndexedDB 持久化，刷新页面可恢复

## 🔧 开发指南

### 开发命令

```bash
# 启动开发服务器（热更新）
npm run dev

# 构建生产版本
npm run build

# 启动生产服务器
npm run start

# 代码检查
npm run lint

# TypeScript 类型检查
npx tsc --noEmit
```

### 环境变量

```env
AGNES_API_KEY=your_agnes_api_key_here
```

> Agnes API Key 同时用于 LLM 对话（场景拆分）、图像生成和视频生成，无需额外配置。

### 数据流

```
用户选择成语
  → Server Action 调用 LLM → 拆分为 6 个场景
  → 逐个调用 Agnes Image API → 生成场景插图
  → 客户端下载图像 → 存入 IndexedDB → 更新 UI
  → [可选] 调用 Agnes Video API → 生成绘本视频
```

### 状态管理

- **Zustand Store (store.ts)** — 应用状态：当前绘本、场景数据
- **Task Store (task-store.ts)** — 任务队列：主/子任务、执行状态
- **IndexedDB (db.ts)** — 持久化：绘本数据、图像 blob、任务记录

## 📚 相关文档

- [项目设计文档](docs/superpowers/specs/2026-06-27-idiom-picture-book-web-design.md)
- [任务队列设计](docs/superpowers/specs/2026-06-27-task-queue-redesign.md)
- [实施计划](docs/superpowers/plans/2026-06-27-idiom-picture-book-web.md)
- [任务队列实施计划](docs/superpowers/plans/2026-06-27-task-queue-redesign.md)

## 📄 许可证

MIT
