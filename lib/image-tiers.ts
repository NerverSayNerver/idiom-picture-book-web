/**
 * 图片档位：全站图片 URL 的**单一产地**
 *
 * 为什么必须集中在一处：
 * 预取（`hooks/use-prefetch.ts`）与渲染（`BookViewer` / `BookCard`）必须算出**完全相同**的 URL。
 * 一旦两边各拼一次，预取下的是 A 档、渲染要的是 B 档，浏览器只能再下一个，
 * 结果是「预取白跑 + 双倍字节 + 停下时清晰度跳变」，而且很难在测试里发现。
 * 因此：**任何组件都不得手拼 `/generated/...` 路径或 `.w{n}.webp` 后缀，一律走本模块。**
 *
 * // sizes 变更需与 components/BookCard.tsx、BookViewer.tsx 的实际展示宽度同步
 *
 * 档位落盘规则（由 scripts/build-image-tiers.mjs 生成）：
 *   原图  /generated/<cat>/<book>/<n>.png
 *   派生  /generated/<cat>/<book>/<n>.w320.webp   <- 缩略图墙、书架小卡
 *                              <n>.w480.webp     <- 书架卡（2x）
 *                              <n>.w768.webp     <- 阅读页 / PDF 导出
 *                              <n>.w1024.webp    <- 阅读页高清档（与现状同像素，仅换编码）
 *
 * 原图永远保留：PDF 高保真导出、以及任何档位生成失败时的兜底都依赖它。
 */

export const IMAGE_TIERS = [320, 480, 768, 1024] as const
export type ImageTier = (typeof IMAGE_TIERS)[number]

/**
 * WebP 质量参数。童书插画是大色块 + 柔和渐变，q 值过低会在天空/渐变背景上出色带。
 * 具体取值以视觉规范 `docs/superpowers/specs/2026-11-23-image-quality-spec.md` 的实测结论为准，
 * 改动此常量后必须重跑 `npm run tiers:all -- --force` 并复测字节预算。
 */
export const TIER_QUALITY = 76

/** 只有 `/generated/**` 下的本地 PNG 才有派生档位；远程 URL、blob:、data: 原样返回 */
const TIERABLE = /^\/generated\/.+\.png$/

export function isTierable(src: string): boolean {
  return TIERABLE.test(src)
}

/** `/generated/a/b/1.png` + 768 -> `/generated/a/b/1.w768.webp` */
export function tierUrl(src: string, tier: ImageTier): string {
  if (!isTierable(src)) return src
  return src.replace(/\.png$/, `.w${tier}.webp`)
}

/** 反查原图：`/generated/a/b/1.w768.webp` -> `/generated/a/b/1.png` */
export function originalUrl(src: string): string {
  return src.replace(/\.w(320|480|768|1024)\.webp$/, '.png')
}

/**
 * 按展示宽度选档：取「不小于 显示宽度 × 设备像素比」的最小档位。
 *
 * dpr 上限取 2（不是 3）：图片是柔和水彩插画，3x 相对 2x 的增益肉眼不可见，
 * 但字节要多 78%。这是本项目明确接受的画质取舍，不要改成 3。
 */
export function pickImageTier(cssWidth: number, dpr = 2, maxTier: ImageTier = 1024): ImageTier {
  const effective = Math.max(1, Math.min(dpr, 2))
  const needed = cssWidth * effective
  const tier = IMAGE_TIERS.find((t) => t >= needed) ?? maxTier
  return (tier > maxTier ? maxTier : tier) as ImageTier
}

/** 拼 srcSet；`sizes` 由调用方按展示位给出，浏览器据此只下一档 */
export function imageSrcSet(src: string, tiers: readonly ImageTier[]): string {
  if (!isTierable(src)) return ''
  return tiers.map((t) => `${tierUrl(src, t)} ${t}w`).join(', ')
}

/** 各展示位的默认档位组合与 sizes —— 组件直接引用，避免各写一份 */
export const TIER_SETS = {
  /** 书架卡封面：显示宽 ~294–358px */
  shelf: { tiers: [320, 480, 768] as const, sizes: '(min-width: 1280px) 300px, (min-width: 768px) 33vw, 90vw' },
  /** 阅读页内的缩略图墙：显示宽 ~157px（2 列）/ ~110px（3 列） */
  // 缩略图墙：移动端 2 列 ~157px，≥sm 3 列 168–253px。tiers 只到 480 —— 墙有 6 张，
  // 任何升档都乘 6；「按 DPR 统一取档」会把本轮最大的收益无声抹掉，且无功能回归可测。
  // 不用 srcSet/sizes（DPR3 会把 157px 的格子升到 480w，6 张 180KB 顶满预算），
  // BookViewer 用 <picture media="(min-width:640px)"> 按视口断点硬选 tiers[0]/[1]。
  thumb: { tiers: [320, 480] as const, sizes: '' },
  /** 阅读页正文插图：移动单页 ~272–358px，桌面跨页半页 ~600px（DPR2 -> 1200，封顶 1024） */
  page: { tiers: [768, 1024] as const, sizes: '(min-width: 768px) 600px, 100vw' },
  /** PDF 导出：固定 768（导出画布上限 480px，2x 余量足够） */
  pdf: { tiers: [768] as const, sizes: '' },
} as const
