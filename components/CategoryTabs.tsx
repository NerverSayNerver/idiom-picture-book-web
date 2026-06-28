'use client'

import type { ContentCategory } from '@/lib/types'
import { getAllStrategies } from '@/lib/content-types'

interface CategoryTabsProps {
  activeCategory: ContentCategory
  onCategoryChange: (category: ContentCategory) => void
}

export function CategoryTabs({ activeCategory, onCategoryChange }: CategoryTabsProps) {
  const strategies = getAllStrategies()

  return (
    <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
      {strategies.map((s) => (
        <button
          key={s.category}
          onClick={() => onCategoryChange(s.category)}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
            activeCategory === s.category
              ? 'bg-white text-primary border border-b-white border-gray-200 -mb-px'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          {s.icon} {s.label}
        </button>
      ))}
    </div>
  )
}
