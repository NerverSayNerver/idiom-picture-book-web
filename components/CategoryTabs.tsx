'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

  const count = strategies.length || 1

  return (
    <div className="border-b border-gray-200">
      <div className="relative flex gap-1">
        {strategies.map((s, index) => (
          <button
            key={s.category}
            ref={(el) => { tabRefs.current[index] = el }}
            type="button"
            onClick={() => onCategoryChange(s.category)}
            aria-current={index === activeIndex ? 'true' : undefined}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors duration-fast whitespace-nowrap ${
              index === activeIndex
                ? 'text-primary'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {s.icon} {s.label}
          </button>
        ))}
        <span
          aria-hidden="true"
          className="absolute bottom-0 h-0.5 rounded-full bg-primary transition-all duration-normal ease-standard"
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
