'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { ContentCategory } from '@/lib/types'
import { getAllStrategies } from '@/lib/content-types'

interface CategoryTabsProps {
  activeCategory: ContentCategory
  onCategoryChange: (category: ContentCategory) => void
}

export function CategoryTabs({ activeCategory, onCategoryChange }: CategoryTabsProps) {
  const strategies = useMemo(() => getAllStrategies(), [])
  const activeIndex = Math.max(0, strategies.findIndex(s => s.category === activeCategory))
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null)

  // 用真实 DOM 位置计算指示器，避免文案宽度不同导致百分比错位
  const measure = useCallback(() => {
    const el = tabRefs.current[activeIndex]
    if (!el) return
    const left = el.offsetLeft
    const width = el.offsetWidth
    setIndicator(prev => (prev && prev.left === left && prev.width === width ? prev : { left, width }))
  }, [activeIndex])

  useEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  // 字体加载/布局变化时重新测量（指示器为绝对定位，不会反过来影响按钮尺寸）
  useEffect(() => {
    const el = tabRefs.current[activeIndex]
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [activeIndex, measure])

  // 激活 Tab 滚进可视区（直接赋值 scrollLeft，会尊重 scroll-behavior 与 reduced-motion 降级）
  useEffect(() => {
    const el = tabRefs.current[activeIndex]
    const scroller = scrollerRef.current
    if (!el || !scroller) return
    const tabLeft = el.offsetLeft
    const tabRight = tabLeft + el.offsetWidth
    const viewLeft = scroller.scrollLeft
    const viewRight = viewLeft + scroller.clientWidth
    if (tabLeft < viewLeft) {
      scroller.scrollLeft = Math.max(0, tabLeft - 12)
    } else if (tabRight > viewRight) {
      scroller.scrollLeft = tabRight - scroller.clientWidth + 24
    }
  }, [activeIndex])

  // WAI-ARIA tabs 键盘模型：←/→ 循环，Home/End 跳首尾，切换同时移动焦点
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = strategies.length - 1
    let next: number | null = null
    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1
    else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = last
    if (next === null) return
    event.preventDefault()
    onCategoryChange(strategies[next].category)
    tabRefs.current[next]?.focus()
  }

  const count = strategies.length || 1

  return (
    <div className="border-b border-[var(--hairline)]">
      {/*
        横向滚动 + 右缘 24px 渐隐：5 个 Tab 在 375px 下必然溢出，
        用 overflow-x-auto 收在容器内，避免撑出整页横向滚动条。
      */}
      <div
        ref={scrollerRef}
        role="tablist"
        aria-label="内容品类"
        aria-orientation="horizontal"
        className="relative -mx-3 px-3 h-12 flex items-center gap-1 overflow-x-auto scroll-smooth snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,#000_calc(100%-24px),transparent)] [-webkit-mask-image:linear-gradient(to_right,#000_calc(100%-24px),transparent)]"
      >
        {strategies.map((s, index) => (
          <button
            key={s.category}
            ref={(el) => { tabRefs.current[index] = el }}
            type="button"
            role="tab"
            id={`tab-${s.category}`}
            aria-selected={index === activeIndex}
            aria-controls={`selector-panel-${s.category}`}
            tabIndex={index === activeIndex ? 0 : -1}
            onClick={() => onCategoryChange(s.category)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`shrink-0 snap-start h-11 px-3.5 text-[14px] font-medium rounded-t-[12px] transition-colors duration-fast focus-ring ${
              index === activeIndex
                ? 'text-[var(--brand-strong)]'
                : 'text-[var(--text-muted)] hover:bg-ink/[.04] hover:text-[var(--text-body)]'
            }`}
          >
            {s.icon} {s.label}
          </button>
        ))}

        {/* 滑动指示条：底色即 --brand-strong（白底 5.43:1） */}
        <span
          aria-hidden="true"
          className="absolute bottom-0 h-[3px] rounded-full bg-[var(--brand-strong)] transition-all duration-normal ease-standard"
          style={{
            // 测量完成前用等分百分比兜底，避免首帧闪烁
            left: indicator ? `${indicator.left}px` : `${activeIndex * (100 / count)}%`,
            width: indicator ? `${indicator.width}px` : `${100 / count}%`,
          }}
        />
      </div>
    </div>
  )
}
