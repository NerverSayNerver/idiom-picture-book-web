/**
 * 服务端专用：为新落盘的绘本补齐派生图片档位
 * =============================================================================
 * **不要在客户端组件里 import 本文件。** 它依赖 node:fs 与 sharp（原生模块），
 * 一旦被 `'use client'` 的组件树引用，构建期就会把 sharp 拉进 client bundle 直接失败。
 * 文件顶部的 assertServer() 会给出明确的报错，而不是让 webpack 抛一堆看不懂的原生模块错误。
 *
 * 设计原则：**档位是优化，不是正确性依赖。**
 * 因此 ensureImageTiers() 永不抛异常 —— sharp 崩了、磁盘满了、文件锁了，都只 console.warn，
 * 让绘本保存本身照常成功。缺档位时运行时的兜底路径（<img> 的 onError → 原图）会接住。
 *
 * 编码参数必须与 scripts/build-image-tiers.mjs 完全一致，否则「新书自动出档」与
 * 「批量回填」产出不同质量的同名文件 —— 这种不一致在灰度流量里根本看不出来。
 * 档位集合与质量值都从 lib/image-tiers.ts 取（单一产地）；effort/kernel 等编码细节
 * 两边各写一份，由 scripts/build-image-tiers.mjs 的参数自检与本节注释兜住。
 */

import { promises as fs } from 'fs'
import path from 'path'
import { IMAGE_TIERS, TIER_QUALITY, type ImageTier } from './image-tiers'
import { assertPathWithinBase } from './path-security'

// ── 与 scripts/build-image-tiers.mjs 保持一致 ────────────────────────────────
const WEBP_EFFORT = 6
const SMART_SUBSAMPLE = true
const RESIZE_KERNEL = 'lanczos3' as const

/**
 * 单本书最多同时压几张。一本 6 页 × 4 档 = 24 个任务，
 * 并发 3 时约 0.4–0.9s 完成；并发再高只会和 worker 的其它任务抢核，
 * 而这里的调用发生在绘本保存路径上，不该长时间占用 CPU。
 */
const BOOK_CONCURRENCY = 3

/**
 * 硬性等待上限。超时后不再派发新任务，已完成的档位照常落盘（幂等，下次跑会补齐）。
 * 目的：避免「磁盘抖动 / 超大图」把 saveBook 拖成几十秒，让用户以为生成卡住了。
 */
const MAX_WAIT_MS = 8000

/** 未加 'server-only' 依赖，改用运行时断言把"客户端误引"变成一眼能懂的报错 */
function assertServer(where: string): void {
  if (typeof window !== 'undefined') {
    throw new Error(`${where} 只能在服务端调用：它依赖 node:fs 与 sharp`)
  }
}

const TIER_SUFFIX = new RegExp(`\\.w(${IMAGE_TIERS.join('|')})\\.webp$`)

/** 懒加载 sharp：不在模块加载期付原生模块的初始化成本，也让本文件在无 sharp 环境可被 import */
let sharpModule: typeof import('sharp') | null | undefined
async function getSharp(): Promise<typeof import('sharp') | null> {
  if (sharpModule !== undefined) return sharpModule
  try {
    sharpModule = (await import('sharp')).default as unknown as typeof import('sharp')
  } catch (err) {
    console.warn('[image-tiers] 未能加载 sharp，跳过档位生成：', (err as Error)?.message ?? err)
    sharpModule = null
  }
  return sharpModule
}

export interface EnsureImageTiersResult {
  /** 新生成（或重建）的档位文件数 */
  generated: number
  /** 已是最新而跳过的档位文件数 */
  skipped: number
  /** 失败数（不抛异常，调用方可只记日志） */
  failed: number
  /** 是否因超时提前收工（剩余档位留给下次 `npm run tiers`） */
  timedOut: boolean
}

const EMPTY_RESULT: EnsureImageTiersResult = { generated: 0, skipped: 0, failed: 0, timedOut: false }

function tierPathFor(pngPath: string, tier: ImageTier): string {
  return pngPath.replace(/\.png$/, `.w${tier}.webp`)
}

async function statSafe(p: string) {
  try {
    return await fs.stat(p)
  } catch {
    return null
  }
}

/**
 * 为 `bookDir`（绝对路径，形如 `<cwd>/public/generated/idiom/井底之蛙`）下的每张 PNG
 * 生成 4 个 WebP 档位。幂等：目标比源新就跳过。**永不抛异常**。
 *
 * @param bookDir 绝对路径。相对路径会以 process.cwd() 解析；越界路径直接返回失败结果。
 */
export async function ensureImageTiers(bookDir: string): Promise<EnsureImageTiersResult> {
  try {
    assertServer('ensureImageTiers')

    const generatedRoot = path.join(process.cwd(), 'public', 'generated')
    const absDir = path.resolve(process.cwd(), bookDir)

    // 复用既有路径校验，不另写一套：越界（../ 穿越到 public 之外）直接拒绝
    try {
      assertPathWithinBase(absDir, generatedRoot)
    } catch {
      console.warn('[image-tiers] 拒绝越界目录：', bookDir)
      return { ...EMPTY_RESULT, failed: 1 }
    }

    const entries = await fs.readdir(absDir).catch(() => null)
    if (!entries) return EMPTY_RESULT // 目录还没建（worker 尚未落图）→ 静默跳过，不是错误

    const pngs = entries.filter((name) => name.endsWith('.png') && !TIER_SUFFIX.test(name))
    if (pngs.length === 0) return EMPTY_RESULT

    // ── 先展开任务清单并预筛，才能算出 skipped ─────────────────────────────
    const jobs: Array<{ src: string; target: string; tier: ImageTier }> = []
    let skipped = 0
    for (const name of pngs) {
      const src = path.join(absDir, name)
      const srcStat = await statSafe(src)
      if (!srcStat) continue
      for (const tier of IMAGE_TIERS) {
        const target = tierPathFor(src, tier)
        const tStat = await statSafe(target)
        if (tStat && tStat.size > 0 && tStat.mtimeMs >= srcStat.mtimeMs) {
          skipped++
          continue
        }
        jobs.push({ src, target, tier })
      }
    }
    if (jobs.length === 0) return { ...EMPTY_RESULT, skipped }

    const sharp = await getSharp()
    if (!sharp) return { ...EMPTY_RESULT, skipped, failed: jobs.length }

    // ── 受限并发 + 截止时间 ─────────────────────────────────────────────────
    let cursor = 0
    let generated = 0
    let failed = 0
    let timedOut = false
    const deadline = Date.now() + MAX_WAIT_MS

    async function worker() {
      while (cursor < jobs.length) {
        if (Date.now() > deadline) {
          timedOut = true
          return
        }
        const job = jobs[cursor++]
        try {
          await sharp!(job.src)
            .resize({ width: job.tier, height: job.tier, fit: 'inside', kernel: RESIZE_KERNEL, withoutEnlargement: true })
            .webp({ quality: TIER_QUALITY, effort: WEBP_EFFORT, smartSubsample: SMART_SUBSAMPLE })
            .toFile(job.target)
          generated++
        } catch (err) {
          failed++
          console.warn(
            `[image-tiers] 生成失败 ${path.basename(job.src)} w${job.tier}：`,
            (err as Error)?.message ?? err,
          )
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(BOOK_CONCURRENCY, jobs.length) }, worker))

    if (timedOut) {
      console.warn(`[image-tiers] ${absDir} 超时 ${MAX_WAIT_MS}ms，剩余档位留给 npm run tiers 补齐`)
    }
    return { generated, skipped, failed, timedOut }
  } catch (err) {
    // 兜底：任何未预期的异常都不允许冒泡到 saveBook
    console.warn('[image-tiers] 未预期错误，已忽略：', (err as Error)?.message ?? err)
    return { ...EMPTY_RESULT, failed: 1 }
  }
}
