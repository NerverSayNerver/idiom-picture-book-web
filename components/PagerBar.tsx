'use client'

import { useState } from 'react'

/**
 * 阅读器翻页入口（拆出来避免 BookViewer 无限膨胀）。
 * - MobilePagerBar：< md 单页模式的固定底部拇指区（上一页 / 可拖动进度条 / 下一页）
 * - PagerArrow：≥ md 双页模式两侧 44px 圆钮
 * - DesktopPageDots：≥ md 页码点阵 + 计数
 *
 * 组件只负责展示与回调；翻页锁、冷却、动画全在 BookViewer.goToPage。
 */

export interface PagerControlsProps {
  /** 0 = 封面 */
  currentPage: number
  totalPages: number
  canPrev: boolean
  canNext: boolean
  onPrev: () => void
  onNext: () => void
  /** 拖条 / 点阵跳页（目标页 0 起算，调用方已 clamp） */
  onSeek: (page: number) => void
  /** 单页读屏文案（1 起算） */
  pageLabel: (page: number) => string
}

const FILL = '#B04A2E'
const TRACK = 'rgba(74,44,32,0.10)'

/** 44×44 圆钮热区 */
const ROUND =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-transform duration-fast ease-standard'

export function MobilePagerBar({
  currentPage,
  totalPages,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onSeek,
}: PagerControlsProps) {
  // 拖条期间用本地值驱动滑块，避免请求被冷却/动画丢弃时滑块"弹回去"
  const [scrub, setScrub] = useState<number | null>(null)

  const displayPage = scrub ?? currentPage + 1
  const pct = totalPages > 1 ? ((displayPage - 1) / (totalPages - 1)) * 100 : 0

  const handleSeek = (value: number) => {
    const target = Math.min(Math.max(value, 1), totalPages)
    setScrub(target)
    onSeek(target - 1)
  }

  const endScrub = () => setScrub(null)

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--hairline)] bg-white/[0.94] pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      // 底部条自身的手势不冒泡到舞台，避免"想拖进度条结果翻页"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mx-auto flex h-14 max-w-[520px] items-center justify-between gap-2 px-3">
        <button
          type="button"
          onClick={onPrev}
          disabled={!canPrev}
          aria-label="上一页"
          className={`${ROUND} border border-ink/[0.14] bg-white text-ink hover:bg-primary/20 active:scale-[0.94] disabled:cursor-not-allowed disabled:border-transparent disabled:bg-ink/5 disabled:text-ink/30`}
        >
          <span aria-hidden="true" className="text-[15px] leading-none">◀</span>
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {/* 视觉 6px，py-[19px] 把热区撑到 44px */}
          <div className="min-w-0 flex-1 py-[19px]">
            <input
              type="range"
              min={1}
              max={totalPages}
              step={1}
              value={displayPage}
              onChange={(e) => handleSeek(Number(e.target.value))}
              onPointerUp={endScrub}
              onPointerCancel={endScrub}
              onBlur={endScrub}
              aria-label="阅读进度"
              aria-valuetext={`第 ${displayPage} 页，共 ${totalPages} 页`}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#B04A2E] [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[#B04A2E] [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#B04A2E] [&::-webkit-slider-thumb]:shadow-card"
              style={{
                background: `linear-gradient(to right, ${FILL} 0%, ${FILL} ${pct}%, ${TRACK} ${pct}%, ${TRACK} 100%)`,
              }}
            />
          </div>
          <span className="shrink-0 text-[13px] font-medium tabular-nums text-ink" aria-hidden="true">
            {displayPage} / {totalPages}
          </span>
        </div>

        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          aria-label="下一页"
          className={`${ROUND} bg-primary text-ink ring-1 ring-ink/[0.16] shadow-card hover:bg-primary/90 active:scale-[0.94] disabled:cursor-not-allowed disabled:bg-ink/5 disabled:text-ink/30 disabled:shadow-none disabled:ring-0`}
        >
          <span aria-hidden="true" className="text-[15px] leading-none">▶</span>
        </button>
      </div>
    </div>
  )
}

export function PagerArrow({
  direction,
  disabled,
  onClick,
}: {
  direction: 'prev' | 'next'
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === 'prev' ? '上一页' : '下一页'}
      className={`${ROUND} hidden text-[var(--brand-strong)] hover:bg-[var(--brand-strong-soft)] active:scale-[0.94] disabled:cursor-not-allowed disabled:text-ink/25 disabled:hover:bg-transparent md:inline-flex`}
    >
      <span aria-hidden="true" className="text-2xl leading-none">
        {direction === 'prev' ? '◀' : '▶'}
      </span>
    </button>
  )
}

export function DesktopPageDots({
  currentPage,
  totalPages,
  onSeek,
  pageLabel,
}: Omit<PagerControlsProps, 'canPrev' | 'canNext' | 'onPrev' | 'onNext'>) {
  return (
    <div className="hidden flex-col items-center gap-2 md:flex">
      {/* 每个点本体 24×44（WCAG 2.5.8 ≥24×24），视觉点内部居中；
          不用 .hit-44 —— 10px 宽的点外扩 44 会横向撑出 17px，而原 pitch 只有 16px，相邻热区直接重叠 */}
      <div className="flex items-center" role="group" aria-label="页码导航">
        {Array.from({ length: totalPages }).map((_, i) => {
          const isCurrent = i === currentPage
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSeek(i)}
              aria-label={pageLabel(i)}
              aria-current={isCurrent ? 'page' : undefined}
              className="focus-ring flex min-h-11 min-w-6 items-center justify-center rounded-full"
            >
              <span
                aria-hidden="true"
                className={`block h-2.5 rounded-full transition-all duration-normal ease-standard ${
                  isCurrent ? 'w-6 bg-[#B04A2E]' : 'w-2.5 bg-ink/[0.18] hover:bg-ink/[0.32]'
                }`}
              />
            </button>
          )
        })}
      </div>
      <span className="text-[13px] font-medium tabular-nums text-[var(--text-muted)]" aria-hidden="true">
        {currentPage + 1} / {totalPages}
      </span>
    </div>
  )
}
