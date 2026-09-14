# 成语绘本工坊 · 项目分析报告

> 分析日期：2026-08-07 ｜ 分支：main（工作区干净）
> 技术栈：Next.js 16 (App Router + Turbopack) · React 18 · TypeScript · Tailwind · better-sqlite3 · SWR · Zustand · jsPDF · html2canvas

---

## 一、项目定位与现状

**定位**：亲子互动多品类绘本生成平台。用户在网页上选择或输入内容（成语 / 古诗 / 儿歌 / 谚语 / 童话五大品类），AI 自动完成分镜 → 生图 → 组装绘本，支持翻页阅读、TTS 朗读、PDF / 视频导出。

**当前规模**（已生成内容）：

| 品类 | 绘本数 | 说明 |
|---|---|---|
| 成语 idiom | 16 | 最早落地的品类 |
| 古诗 poetry | 7 | 含诗句对齐后处理 |
| 儿歌 nursery-rhyme | 11 | 含歌词重建 |
| 谚语 proverb | 9 | |
| 童话 fairy-tale | 7 | |
| **合计** | **50** | 345 张 PNG，public/generated 约 531MB |

**架构决策回顾**：多品类扩展已完成（content-types 策略注册表）；前端自研翻页组件替代 react-pageflip；middleware 已迁移至 Next.js 16 proxy 约定。

---

## 二、系统架构

```
浏览器前端 ──提交/轮询──▶ Next.js API + Server Actions ──落库──▶ SQLite 任务队列
   ▲                                                              │
   │                    独立进程 worker.ts 轮询认领                ▼
   │                 （分镜 → 生图 → 组装 串行流水线）◀──调用── Agnes AI
   │                                                              │
   └────────── 阅读 / PDF / 视频导出 ◀────── public/generated 绘本产物
```

**三端协作**：
1. **Next.js 服务**（API Routes + Server Actions）：接收请求、落库、返回状态；`/api/jobs` 系列提供任务 CRUD / 取消 / 暂停 / 恢复 / 重试 / 重排。
2. **独立 worker 进程**（`worker.ts`，`npm run worker`）：`UPDATE ... RETURNING` 原子认领队列任务，串行执行流水线，防止多 worker 重复执行；启动时 `recoverInterruptedTasks()` 把中断任务置为 failed。
3. **前端**（SWR 轮询）：活跃任务 2s / 空闲 15s 刷新，任务中心全功能管理。

**双存储**：
- 任务状态 → SQLite（`data/picture-book-tasks.db`，WAL 模式，`foreign_keys=ON`）
- 成品绘本 → 文件系统（`public/generated/{category}/{sourceText}/book.json + N.png` + `index.json`，写锁保护）

**AI 供应商抽象**：`lib/generation/` 定义 `ImageProvider` / `VideoProvider` 接口 + 注册表 + 环境变量配置，当前仅实现 Agnes 适配器（文生图 / 图生图 / 视频 submit+poll），可通过 `IMAGE_PROVIDER` / `VIDEO_PROVIDER` 切换。

---

## 三、核心工作流（worker 流水线）

`executeJob(jobId)` 三步：

1. **分镜 decompose**：创建子任务 → LLM（`decomposeSource`）拆解出含义 / 角色 / 画风 / 场景 JSON（含 JSON 清理与古诗诗句对齐后处理）→ 再创建 N 个生图子任务 + 1 个组装子任务。
2. **生图 generate**：`buildEnhancedPrompt`（7 段式模板注入主题/角色/画风/场景/构图）；**首场景文生图，后续场景图生图**（以已完成的首图做参考，保持风格与角色一致）；下载至本地；失败按 `maxRetries` 重试。
3. **组装 save**：从任务数据重建 `PictureBook`（场景引用本地路径）→ 写 `book.json` + 更新 `index.json`。

**任务状态机**：`pending → running → completed / failed / cancelled`，另有 `paused`；父任务状态由子任务推导（`deriveJobStatus`）。

---

## 四、前端功能

| 页面 / 组件 | 功能 |
|---|---|
| 首页 `app/page.tsx` | Hero + 品类 Tab + 内容选择器（多选 / 自定义 / LLM 换一批）+ 统计卡 + 书架（index.json，5s 超时兜底） |
| 任务中心 `/tasks` | 全功能队列：状态分组、批量暂停/继续/取消/重试/清理、子任务详情（图片 / LLM 结果 / Prompt 弹窗） |
| 阅读器 `BookViewer` | 自研翻页（封面→场景→含义页）、键盘导航、TTS 朗读（Web Speech API，高亮/变速）、PDF 导出、视频生成 |
| 生成中 `/generate` | 提交后展示队列，完成后跳转书架 |

---

## 五、安全设计（亮点）

- **API 鉴权**：proxy.ts 保护 `/api/*`，`INTERNAL_API_KEY` + `X-Internal-Key` + `timingSafeEqual` 常量时间比较
- **CSP 与安全头**：完整 CSP + nosniff / X-Frame-Options: DENY / Referrer-Policy / Permissions-Policy / HSTS
- **SSRF 防护**：图片下载域名白名单（`ALLOWED_IMAGE_DOMAINS`）+ `next.config.js` remotePatterns 仅放行 Agnes 域名
- **路径安全**：`sanitizeFilename` / 品类白名单 / `assertPathWithinBase` 防路径穿越
- **XSS**：LLM 输出消毒 `sanitizeLlmOutput`

---

## 六、已知问题与风险

### 🔴 高优先级

1. **视频导出链路缺口（功能不可用风险）** — ✅ 已修复（2026-08-07）
   - `app/actions/generate.ts` 代码注释自认：`remixed_from_video_id` 是视频 ID 而非可播放 URL，视频访问方式未确认。
   - 现状：前端把 `videoId` 直接当作 `videoUrl` 传给 `<video src>`，**视频预览大概率无法播放**。
   - 修复：经 Agnes Video V2.0 官方文档确认，`remixed_from_video_id` 在 `status=completed` 时**就是最终视频 URL**（storage.googleapis.com 的 mp4）。已在 `AgnesVideoProvider.poll()` 提取该字段为 `videoUrl`，`getVideoResult` 暴露 `video_url`，`generateBookVideo` 返回真实 URL，前端 `<video src>` 直接可用；同时补上 `in_progress → processing` 状态映射。

### 🟡 中优先级（工程卫生）

2. **6 个依赖零引用** — ✅ 已修复（2026-08-07）：`react-pageflip`（阅读器已自研）、`clsx`、`tailwind-merge`、`class-variance-authority`、`lucide-react`、`dexie-react-hooks` 已全部卸载。
3. **旧代码残留** — ✅ 已修复（2026-08-07）：`lib/db.ts` 3 个 `@deprecated` API 已删除；`components/SceneCard.tsx` 已删除。
4. **重复 DB 文件** — ✅ 已修复（2026-08-07）：根目录 `picture-book-tasks.db` 残留已删除，仅保留 `data/picture-book-tasks.db`。
5. **`index.json` 的 `generatedAt` 字段为空** — ✅ 已修复（2026-08-07）：`save-book.ts` 每次写入均刷新 `generatedAt`；存量数据已用各品类 items 最大 createdAt 回填。
6. **根目录大文件**：`regenerate-all.log` 65MB 已由 `*.log` 规则 ignore（无仓库风险），但可定期清理磁盘。

### 🟢 低优先级 / 观察项

- 队列为**单 worker 串行**，批量任务吞吐有限（有意设计，够用即可）。
- 生图失败重试依赖 LLM 输出质量，无人工介入通道（任务中心可手动重试兜底）。
- `eslint-config-next` 为 ^14 而 Next 为 16，版本代差 — 部分缓解：`next lint` 在 Next 16 已移除，lint 脚本已改为 `eslint .` 可直接运行；完整升级需 eslint 9 + flat config 迁移，留待后续。
- 远端残留 2 个 trae/agent 分支（`trae/agent-E9brpH`、`trae/agent-tagjiT`），可清理（删除远程分支需确认）。

---

## 七、优化建议（按优先级）

1. **修复视频导出**：确认 Agnes 视频结果里可播放 URL 的字段（或下载接口），打通 videoId → 播放 URL 链路；前端兜底错误提示。
2. **依赖与代码清理**：卸载 6 个未用依赖；删除 `SceneCard.tsx` 与 deprecated API；删除根目录旧 DB。
3. **补全 generatedAt**：`save-book.ts` 写入 `new Date().toISOString()`，书架可按时间排序。
4. **可观测性**：为 worker 增加日志文件输出（当前 worker 日志仅 stdout），失败可追溯。
5. **体验增强**：书架搜索/筛选、任务完成后浏览器通知、阅读器进度记忆。
6. **测试**：`e2e-test.js`（Playwright）覆盖较浅，可补关键路径（创建→生成→阅读→导出）。

---

## 八、技术债速查表

| 项 | 位置 | 状态 |
|---|---|---|
| 视频 ID/URL 未闭环 | `app/actions/generate.ts:58-62` | ✅ 已修复 |
| 未用依赖 ×6 | `package.json` | ✅ 已卸载 |
| 旧 DB 文件 | 根目录 `picture-book-tasks.db` | ✅ 已删除 |
| deprecated API ×3 | `lib/db.ts:52-60` | ✅ 已删除 |
| SceneCard 无人引用 | `components/SceneCard.tsx` | ✅ 已删除 |
| generatedAt 为空 | `public/generated/index.json` | ✅ 已修复 |
| lint 命令失效（Next 16 移除 next lint） | `package.json` | ✅ 已改为 `eslint .` |
| eslint-config 版本代差 | `package.json` | 🟢 观察（需 eslint9+flat config 迁移） |
| trae 分支残留 ×2 | git remote | 🟢 待确认后清理 |
