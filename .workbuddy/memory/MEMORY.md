# 成语绘本工坊 - 项目长期记忆

## 项目概况
- 路径：/Users/mk/work/child/idiom-picture-book-web
- 技术栈：Next.js 16 (App Router, Turbopack) + Tailwind + Zustand + better-sqlite3 + SWR + react-pageflip + jsPDF
- 定位：亲子互动多品类绘本生成平台（成语/诗歌/儿歌/谚语/童话），AI 分镜+生图+翻页阅读+PDF/视频导出
- 架构：Next.js API Route 创建 Job → SQLite 持久化 → 独立 worker.ts 进程串行执行 → 前端 SWR 轮询

## 工作流约定（用户决策）
- **main 直推工作流**：直接提交到 main 并推送，功能分支用完即删（不长期保留 feature 分支）
- **public/generated 已 gitignore**：只提交源码，不提交生成图片（约531MB PNG + index.json 可重新生成）
- feature/multi-category-expansion 分支已删除，本地有 archive tag `archive/feature-multi-category-expansion`（未推送）可恢复

## UI 动效体系（2026-11-16 建立）
- **无动画库**：纯 CSS + Tailwind 实现，所有 token 在 tailwind.config.ts（13 keyframes / 14 animation / duration-* / ease-*），状态色/缓动/时长 CSS 变量在 globals.css :root
- **单一主角原则**：阅读器 3D 翻页是唯一仪式感动效（前进 560/后退 480/收尾 600ms），其余反馈 ≤240ms；弹性过冲 ≤4%、最多一次回弹
- **翻页实现**：BookViewer 用 isFlipping/flipFrom/flipDir + ref 状态机，连点丢弃+300ms 冷却+animationend 幂等+700ms 兜底，leaf 用旧页快照；TTS 逐字高亮为逐字持久 span + active 类名（非 slice 重建）
- **减少动效三态**：Header 开关 + localStorage['pb-motion-reduced']，优先级 用户选择 > 系统偏好；off→html.motion-full 覆盖系统 @media，on→html.motion-reduced，auto→跟随系统
- **状态色通道**：6 组 var(--status-*)，必须"颜色 + 图标 + 文字"三通道，静态字面量映射（忌动态拼接，Tailwind JIT 扫不到）
- 改动 20 文件约 +1650 行，**未提交**（留在工作区待用户确认）；详见 .workbuddy/memory/2026-11-16.md

## 待办/已知项
- **middleware.ts → proxy.ts 迁移**：✅ 已完成（2026-07-17）。git mv 重命名 + 函数名改为 proxy，鉴权逻辑不变，build 警告消失。
- /library 页面为重定向占位（router.replace('/')），首页已集成书架
- Header 导航仅"任务中心"一个入口
- **2026-08-07 分析报告遗留优化项**：✅ 已完成（2026-10-31）——worker 日志落盘（lib/worker-logger.ts + logs/，30 天保留）、系统通知（lib/notifications.ts + NotificationToggle，仅后台标签页弹）、书架搜索/排序、阅读器进度记忆（pb-reading-progress）、65MB regenerate-all.log 已删除
- 仍遗留：eslint-config-next ^14→16（需 eslint9 flat config）；远端 trae/agent 分支 ×2 待用户确认；e2e 关键路径测试覆盖浅

## 环境配置
- .env.example 提供完整模板；.env.local 为本地实际配置（已 gitignore）
- 关键变量：LLM_API_KEY/LLM_API_BASE/LLM_MODEL、AGNES_API_KEY、IMAGE_PROVIDER/VIDEO_PROVIDER、ALLOWED_IMAGE_DOMAINS（SSRF白名单）、INTERNAL_API_KEY+NEXT_PUBLIC_INTERNAL_API_KEY（API鉴权，部署公网必设）、DEBUG_LLM
- next.config.js 含完整 CSP/安全头 + turbopack.root 配置

## 图片与字体约定（2026-11-23 第三轮建立）
- **图片 URL 单一产地**：`lib/image-tiers.ts`。任何组件不得手拼 `/generated/...` 或 `.w{n}.webp`；预取与渲染必须算出同一 URL（否则双倍下载 + 清晰度跳变）。档位 320/480/768/1024 WebP q76
- 派生档位不进 git（public/generated 整体 gitignore），由 `npm run tiers[:all|:report]` 生成；新书经 `lib/save-book.ts` → `ensureImageTiers()` 自动出档，失败只警告不阻断
- **缩略图墙按视口选档**：用 `<picture media="(min-width:640px)">`，不要用 `srcSet/sizes` —— 浏览器会按 DPR3 把 157px 格子升档，抹掉最大收益且无可测回归
- 阅读页档位：桌面 1024 / 移动 768 / 弱网 768；PDF 显式 768 + onerror 回退原图
- **字体走系统中文栈**（tailwind.config.ts 的 fontFamily.sans），禁止回退 next/font/google 全量 Noto Sans SC：实测 36 个 woff2 / 1880KB。要统一字形只能自托管按本站文案子集化的字体
- 本地插画统一在 `components/Illustration.tsx`，禁止再引 `trae-api-cn` 外链（已 404 且返回英文占位图）

## 构建环境注意
- `next build` 会被 WorkBuddy 的安全删除护栏拦在 `.next/trace`（50 项阈值）。解决：构建前 `mv .next /tmp/pb-next-bak/next-$(date +%s)`，不要强删

## 文档位置
- 设计文档在 docs/superpowers/{plans,specs}/ 下（非 docs/plans）
- `docs/superpowers/specs/2026-11-23-loading-ux-spec.md`：21 条机械可核对加载指标 M-01–M-21
