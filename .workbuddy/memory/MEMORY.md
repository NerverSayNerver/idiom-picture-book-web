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

## 文档位置
- 设计文档在 docs/superpowers/{plans,specs}/ 下（非 docs/plans）
