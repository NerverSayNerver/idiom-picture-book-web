#!/usr/bin/env node
/**
 * 派生图片档位生成器
 * =============================================================================
 * 输入：public/generated/<品类>/<书名>/<n>.png        （1024×1024，单张 0.94–2.15MB）
 * 输出：public/generated/<品类>/<书名>/<n>.w320.webp  （同目录平铺，不建子目录）
 *                                        <n>.w480.webp
 *                                        <n>.w768.webp
 *                                        <n>.w1024.webp
 *
 * 为什么平铺而不建子目录：
 *   1. URL 由 lib/image-tiers.ts 的 tierUrl() 唯一决定（`1.png` -> `1.w768.webp`），
 *      平铺是「字符串后缀替换」唯一能表达的形式；父子目录会让单一产地不成立。
 *   2. 静态导出的 `public/` 由 Next 直接映射，多一层目录只增加 404 面。
 *
 * 为什么原图必须保留：PDF 高保真导出、以及任一档位生成失败时的兜底都依赖它。
 *
 * ── 编码参数为什么这么选（2026-11-23 在真实插画上实测，非估算）────────────────
 *   quality = 76       来自 lib/image-tiers.ts 的 TIER_QUALITY，视觉规范统一口径。
 *   effort  = 6        libwebp method 上限。实测 768 档 q76：e4→e6 省 7.6% 字节
 *                      （39.9KB→37.6KB）、PSNR 几乎不变。仅多 ~35% 编码时间，
 *                      而这是**离线一次性**批处理，用户端零成本。
 *   smartSubsample = true
 *                      libwebp 的 smart chroma subsampling：按块在 4:2:0 / 4:2:2 之间
 *                      择优。童书插画有大量彩色描边（红掌、橙色喙），纯 4:2:0 会让
 *                      彩色边缘掉色。实测同图 q76：smart 9.3KB/PSNR 35.65
 *                      vs plain 9.0KB/PSNR 35.30 —— 多 3% 字节换 +0.35dB 且保描边色，
 *                      对"孩子盯着看很久"的绘本值。
 *   kernel  = lanczos3 降采样最锐的核。插画是大色块+线描，bilinear 会让线变软。
 *                      只在缩小方向使用（withoutEnlargement 保证不放大）。
 *   fit     = inside   配合 withoutEnlargement：原图小于档位时不出放大糊图，直接跳过。
 *   不加 .sharpen()    多一道卷积会引入振铃，且让结果不可复现（libvips 版本相关）。
 *   metadata 默认剥离   实测全库 PNG 均为 srgb、无 ICC profile，剥离无色彩偏移风险，
 *                      同时省掉 chunk 开销。
 *
 * ── 幂等 ────────────────────────────────────────────────────────────────────
 *   目标文件 mtime >= 源文件 mtime 且 size > 0  → 跳过。
 *   重新生成绘本会以同名覆盖 PNG（mtime 更新），下次跑 `npm run tiers` 自动重建对应档位。
 *
 * ── 用法 ────────────────────────────────────────────────────────────────────
 *   node scripts/build-image-tiers.mjs                  增量
 *   node scripts/build-image-tiers.mjs --force          全量重建
 *   node scripts/build-image-tiers.mjs --report         只统计，不生成
 *   node scripts/build-image-tiers.mjs --tier=768       只处理某一档
 *   node scripts/build-image-tiers.mjs --concurrency=4  限制并发
 */

import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const GEN_DIR = path.join(ROOT, 'public', 'generated')

// 档位表与 lib/image-tiers.ts 的 IMAGE_TIERS 必须一致。
// 这里故意硬编码而非 import：本脚本是 .mjs，且需要在 sharp 不可用时也能 --report，
// 跨语言导入 TS 常量代价大于收益。**漂移风险靠下面的 verifyAgainstTsSource() 兜住**：
// 启动时读 lib/image-tiers.ts 的源码正则比对，不一致立刻退出，避免「脚本按 76 出图、
// 运行时按别处算 URL/质量」这种最难查的错。
const IMAGE_TIERS = [320, 480, 768, 1024]
const TIER_QUALITY = 76
const WEBP_EFFORT = 6
const SMART_SUBSAMPLE = true
const RESIZE_KERNEL = 'lanczos3'

// ── CLI ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const FORCE = argv.includes('--force') || argv.includes('--all')
const REPORT_ONLY = argv.includes('--report')
const QUIET = argv.includes('--quiet')
const tierArg = argv.find((a) => a.startsWith('--tier='))
const TIERS = tierArg ? tierArg.split('=')[1].split(',').map(Number) : IMAGE_TIERS
const concArg = argv.find((a) => a.startsWith('--concurrency='))

for (const t of TIERS) {
  if (!IMAGE_TIERS.includes(t)) {
    console.error(`未知档位 ${t}，可用：${IMAGE_TIERS.join(' / ')}`)
    process.exit(2)
  }
}

/**
 * 与 lib/image-tiers.ts 的一致性自检。
 * 档位集合 / 质量值一旦两边不一致，症状是「URL 404」或「回填的质量与预期不同」，
 * 都属于事后极难定位的隐性错误，所以宁可在启动时硬失败。
 */
async function verifyAgainstTsSource() {
  const tsPath = path.join(ROOT, 'lib', 'image-tiers.ts')
  let src
  try {
    src = await fs.readFile(tsPath, 'utf-8')
  } catch {
    console.warn(`⚠ 读不到 ${path.relative(ROOT, tsPath)}，跳过一致性自检`)
    return
  }
  const tiersMatch = src.match(/IMAGE_TIERS\s*=\s*\[([^\]]+)\]/)
  const qMatch = src.match(/TIER_QUALITY\s*=\s*(\d+)/)
  const problems = []
  if (tiersMatch) {
    const tsTiers = tiersMatch[1].split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n))
    if (tsTiers.join(',') !== IMAGE_TIERS.join(',')) {
      problems.push(`档位不一致：lib/image-tiers.ts = [${tsTiers}]，本脚本 = [${IMAGE_TIERS}]`)
    }
  }
  if (qMatch && Number(qMatch[1]) !== TIER_QUALITY) {
    problems.push(`质量不一致：lib/image-tiers.ts TIER_QUALITY = ${qMatch[1]}，本脚本 = ${TIER_QUALITY}`)
  }
  if (problems.length) {
    console.error('❌ lib/image-tiers.ts 与本脚本参数不一致，拒绝生成（否则产物与运行时预期不符）：')
    problems.forEach((p) => console.error(`   - ${p}`))
    console.error('   改完记得 `npm run tiers:all` 重建全部档位。')
    process.exit(2)
  }
}

/**
 * 并发上限 8。理由：
 *  - libvips 内部有自己的线程池（默认 = CPU 核数），再叠加过多进程级并发只会互相抢核，
 *    吞吐不再上升，峰值内存却线性上涨。
 *  - 本机 18 核；单任务峰值内存约 25–40MB（1024² RGB 解码 3MB + lanczos 中间缓冲 + 编码工作区），
 *    8 并发 ≈ 300MB，安全；345×4=1380 个任务的队列长度也足够喂满。
 *  - 关键：**绝不 1380 个并发**。全量并行会把机器打到无响应，也会让 sharp 的内存分配抖动。
 */
const CPU = os.cpus()?.length || 4
const CONCURRENCY = Math.max(1, Number(concArg?.split('=')[1]) || Math.min(CPU, 8))

// ── 工具 ────────────────────────────────────────────────────────────────────
const TIER_SUFFIX = new RegExp(`\\.w(${IMAGE_TIERS.join('|')})\\.webp$`)
const isDerived = (name) => TIER_SUFFIX.test(name)

function kb(bytes) {
  return (bytes / 1024).toFixed(1)
}
function mb(bytes) {
  return (bytes / 1024 / 1024).toFixed(2)
}

/** 递归收集原图（跳过已是派生物的文件） */
async function collectSources(dir, out = []) {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) await collectSources(p, out)
    else if (e.isFile() && e.name.endsWith('.png') && !isDerived(e.name)) out.push(p)
  }
  return out
}

function tierPath(src, tier) {
  return src.replace(/\.png$/, `.w${tier}.webp`)
}

async function statSafe(p) {
  try {
    return await fs.stat(p)
  } catch {
    return null
  }
}

// ── 报告模式 ────────────────────────────────────────────────────────────────
async function runReport() {
  const sources = await collectSources(GEN_DIR)
  if (sources.length === 0) {
    console.error(`未找到原图：${GEN_DIR}/**/*.png`)
    process.exit(1)
  }

  const rows = [] // { src, size, tiers: { [tier]: size | null } }
  for (const src of sources) {
    const st = await statSafe(src)
    const row = { src, size: st?.size ?? 0, mtime: st?.mtimeMs ?? 0, tiers: {} }
    for (const t of IMAGE_TIERS) {
      const ts = await statSafe(tierPath(src, t))
      row.tiers[t] = ts?.size ?? null
      row[`stale${t}`] = ts ? ts.mtimeMs < row.mtime : false
    }
    rows.push(row)
  }

  const totalOrig = rows.reduce((s, r) => s + r.size, 0)
  const N = rows.length

  console.log(`\n原图：${N} 张，合计 ${mb(totalOrig)} MB，平均 ${kb(totalOrig / N)} KB`)
  console.log(`目录：${path.relative(ROOT, GEN_DIR)}/  （源 1024×1024 PNG，无 ICC）\n`)

  console.log('档位      文件数   平均KB    最大KB    合计MB   相对原图')
  console.log('─'.repeat(62))
  console.log(
    '原图'.padEnd(9) +
      String(N).padStart(5) +
      kb(totalOrig / N).padStart(9) +
      kb(Math.max(...rows.map((r) => r.size))).padStart(10) +
      mb(totalOrig).padStart(10) +
      '     100%'.padStart(11),
  )

  const tierStats = {}
  for (const t of IMAGE_TIERS) {
    const sizes = rows.map((r) => r.tiers[t]).filter((v) => v != null)
    const sum = sizes.reduce((a, b) => a + b, 0)
    tierStats[t] = { count: sizes.length, sum, avg: sizes.length ? sum / sizes.length : 0, max: sizes.length ? Math.max(...sizes) : 0 }
    const missing = N - sizes.length
    if (sizes.length === 0) {
      console.log(`w${t}`.padEnd(9) + '    0' + '        —' + '         —' + '         —' + `   缺失 ${missing}`)
      continue
    }
    const ratio = ((sum / sizes.length / (totalOrig / N)) * 100).toFixed(1)
    console.log(
      `w${t}`.padEnd(9) +
        String(sizes.length).padStart(5) +
        kb(sum / sizes.length).padStart(9) +
        kb(tierStats[t].max).padStart(10) +
        mb(sum).padStart(10) +
        `   ${ratio}%`.padStart(11) +
        (missing ? `   ⚠ 缺失 ${missing}` : ''),
    )
  }

  // 整本（按 6 页计）——验收口径
  const bookDirs = new Map()
  for (const r of rows) {
    const dir = path.dirname(r.src)
    const b = bookDirs.get(dir) || { orig: 0, pages: 0, tiers: {} }
    b.orig += r.size
    b.pages += 1
    for (const t of IMAGE_TIERS) b.tiers[t] = (b.tiers[t] || 0) + (r.tiers[t] || 0)
    bookDirs.set(dir, b)
  }
  const books = [...bookDirs.values()]
  const avgPages = books.reduce((s, b) => s + b.pages, 0) / books.length
  console.log(`\n整本字节（${books.length} 本，平均 ${avgPages.toFixed(1)} 页/本；同时给出「按 6 页折算」）`)
  console.log('─'.repeat(78))
  const perPageOrig = totalOrig / N
  for (const label of ['原图', ...IMAGE_TIERS.map((t) => `w${t}`)]) {
    const key = label === '原图' ? 'orig' : label.slice(1)
    const perBook = books.map((b) => (label === '原图' ? b.orig : b.tiers[key]))
    const avg = perBook.reduce((a, b) => a + b, 0) / perBook.length
    const six = label === '原图' ? perPageOrig * 6 : tierStats[key].avg * 6
    const ratio = label === '原图' ? '100%' : `${((six / (perPageOrig * 6)) * 100).toFixed(1)}%`
    console.log(`${label.padEnd(6)} 整本均值 ${mb(avg).padStart(7)} MB   6 页折算 ${(six / 1024).toFixed(0).padStart(7)} KB   压缩比 ${ratio.padStart(7)}`)
  }

  // 缺失 / 过期清单（只给计数与前几条，避免刷屏）
  const missingAll = []
  const staleAll = []
  for (const r of rows) {
    for (const t of IMAGE_TIERS) {
      if (r.tiers[t] == null) missingAll.push(`${path.relative(GEN_DIR, tierPath(r.src, t))}`)
      else if (r[`stale${t}`]) staleAll.push(`${path.relative(GEN_DIR, tierPath(r.src, t))}`)
    }
  }
  if (missingAll.length) {
    console.log(`\n⚠ 缺失档位 ${missingAll.length} 个（跑 npm run tiers 补齐）：`)
    missingAll.slice(0, 8).forEach((f) => console.log(`   - ${f}`))
    if (missingAll.length > 8) console.log(`   ... 另有 ${missingAll.length - 8} 个`)
  } else {
    console.log('\n✅ 所有档位齐全')
  }
  if (staleAll.length) {
    console.log(`\n⚠ 过期档位 ${staleAll.length} 个（源图比档位新，需重建）：`)
    staleAll.slice(0, 8).forEach((f) => console.log(`   - ${f}`))
    if (staleAll.length > 8) console.log(`   ... 另有 ${staleAll.length - 8} 个`)
  }
  console.log('')
}

// ── 生成模式 ────────────────────────────────────────────────────────────────
async function runBuild() {
  let sharp
  try {
    sharp = (await import('sharp')).default
  } catch {
    console.error('缺少依赖 sharp。请先 `npm i sharp`（它是 Next 的传递依赖，必须在 package.json 里显式声明）。')
    process.exit(1)
  }

  const sources = await collectSources(GEN_DIR)
  if (sources.length === 0) {
    console.error(`未找到原图：${GEN_DIR}/**/*.png`)
    process.exit(1)
  }

  // 先展开成 (源 × 档位) 的任务清单并预筛，这样进度百分比是真实的
  const jobs = []
  let skipped = 0
  let skippedBytes = 0
  for (const src of sources) {
    const sst = await statSafe(src)
    if (!sst) continue
    for (const tier of TIERS) {
      const target = tierPath(src, tier)
      if (!FORCE) {
        const tst = await statSafe(target)
        if (tst && tst.size > 0 && tst.mtimeMs >= sst.mtimeMs) {
          skipped++
          skippedBytes += tst.size
          continue
        }
      }
      jobs.push({ src, target, tier, srcBytes: sst.size })
    }
  }

  console.log(`\n源图 ${sources.length} 张 × ${TIERS.length} 档 = ${sources.length * TIERS.length} 个目标`)
  console.log(
    `模式：${FORCE ? '全量重建 (--force)' : '增量'}  ·  并发 ${CONCURRENCY}` +
      (skipped ? `  ·  跳过 ${skipped} 个已是最新（${mb(skippedBytes)} MB）` : '') +
      `\n待生成：${jobs.length} 个\n`,
  )
  if (jobs.length === 0) {
    console.log('✅ 无需生成，所有档位均为最新。')
    return
  }

  const t0 = Date.now()
  const failures = []
  const perTier = {} // tier -> { count, bytes, max, min }
  for (const t of TIERS) perTier[t] = { count: 0, bytes: 0, max: 0, min: Infinity }

  let done = 0
  let outBytes = 0
  let cursor = 0
  const PROGRESS_EVERY = 20

  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor++]
      try {
        await fs.mkdir(path.dirname(job.target), { recursive: true })
        const info = await sharp(job.src)
          .resize({ width: job.tier, height: job.tier, fit: 'inside', kernel: RESIZE_KERNEL, withoutEnlargement: true })
          .webp({ quality: TIER_QUALITY, effort: WEBP_EFFORT, smartSubsample: SMART_SUBSAMPLE })
          .toFile(job.target)

        const st = perTier[job.tier]
        st.count++
        st.bytes += info.size
        st.max = Math.max(st.max, info.size)
        st.min = Math.min(st.min, info.size)
        outBytes += info.size
        done++
        if (!QUIET && (done % PROGRESS_EVERY === 0 || done === jobs.length)) {
          const el = (Date.now() - t0) / 1000
          const rate = done / el
          const eta = rate > 0 ? (jobs.length - done) / rate : 0
          process.stdout.write(
            `  [${String(done).padStart(4)}/${jobs.length}] w${String(job.tier).padEnd(4)} ` +
              `累计输出 ${mb(outBytes).padStart(7)} MB  ${rate.toFixed(1)} 张/s  剩余 ~${eta.toFixed(0)}s` +
              (failures.length ? `  失败 ${failures.length}` : '') +
              `\n`,
          )
        }
      } catch (err) {
        // 单张失败绝不能中断整批：记录后继续，末尾统一以非零码退出
        failures.push({ file: path.relative(ROOT, job.src), tier: job.tier, error: err?.message || String(err) })
        done++
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker))

  const elapsed = (Date.now() - t0) / 1000

  // ── 汇总 ────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(72))
  console.log('生成汇总')
  console.log('═'.repeat(72))
  console.log('档位     生成数   平均KB    最大KB    最小KB    合计MB')
  console.log('─'.repeat(72))
  for (const t of TIERS) {
    const st = perTier[t]
    if (st.count === 0) {
      console.log(`w${t}`.padEnd(8) + '     0'.padStart(7) + '        —' + '         —' + '         —' + '         —')
      continue
    }
    console.log(
      `w${t}`.padEnd(8) +
        String(st.count).padStart(7) +
        kb(st.bytes / st.count).padStart(9) +
        kb(st.max).padStart(10) +
        kb(st.min).padStart(10) +
        mb(st.bytes).padStart(10),
    )
  }
  const grand = TIERS.reduce((s, t) => s + perTier[t].count, 0)
  console.log('─'.repeat(72))
  console.log(
    `合计 ${grand} 个文件，${outBytes ? mb(outBytes) : '0.00'} MB   耗时 ${elapsed.toFixed(1)}s   ` +
      `${(grand / Math.max(elapsed, 0.001)).toFixed(1)} 张/s   q=${TIER_QUALITY} effort=${WEBP_EFFORT} ${RESIZE_KERNEL}`,
  )

  if (failures.length) {
    console.log(`\n❌ 失败 ${failures.length} 个（其余已正常生成）：`)
    for (const f of failures.slice(0, 40)) console.log(`   - ${f.file}  w${f.tier}  ${f.error}`)
    if (failures.length > 40) console.log(`   ... 另有 ${failures.length - 40} 个`)
    console.log('')
    process.exitCode = 1
    return
  }
  console.log('\n✅ 全部成功。\n')
}

// ── main ────────────────────────────────────────────────────────────────────
await verifyAgainstTsSource()
if (REPORT_ONLY) await runReport()
else await runBuild()
