'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getContentListByCategory } from '@/lib/content-info'
import { useAppStore } from '@/lib/store'
import { createJobAPI } from '@/lib/use-jobs'
import { getRandomItems, saveRecommendedItems } from '@/lib/db'
import { fetchRecommendations } from '@/app/actions/recommend'
import { getStrategy } from '@/lib/content-types'
import type { ContentCategory, ContentInfo } from '@/lib/types'

interface ContentSelectorProps {
  category: ContentCategory
  compact?: boolean
  generatedTexts?: string[]
}

const DISPLAY_COUNT = 40

export function ContentSelector({ category, compact, generatedTexts = [] }: ContentSelectorProps) {
  const [customInput, setCustomInput] = useState('')
  const [selectedItem, setSelectedItem] = useState<string | null>(null)
  const [displayItems, setDisplayItems] = useState<ContentInfo[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const setCurrentIdiom = useAppStore((s) => s.setCurrentIdiom)
  const setCurrentCategory = useAppStore((s) => s.setCurrentCategory)
  const strategy = getStrategy(category)

  // 加载推荐内容 + 重置刷新旋转状态
  useEffect(() => {
    setRefreshing(false)
    loadRecommended()
    setSelectedItem(null)
    setCustomInput('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category])

  const loadRecommended = async () => {
    try {
      const random = await getRandomItems(category, DISPLAY_COUNT)
      if (random.length > 0) {
        setDisplayItems(random)
      } else {
        // 没有缓存时使用内置列表
        setDisplayItems(getContentListByCategory(category))
      }
    } catch {
      setDisplayItems(getContentListByCategory(category))
    }
  }

  const refreshExcludeRef = useRef<string[]>([])

  // 每次 displayItems 更新时同步到 ref
  useEffect(() => {
    refreshExcludeRef.current = displayItems.map(i => i.sourceText)
  }, [displayItems])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const newItems = await fetchRecommendations(category, refreshExcludeRef.current)
      await saveRecommendedItems(newItems, category)
      const random = await getRandomItems(category, DISPLAY_COUNT)
      if (random.length > 0) setDisplayItems(random)
      setSelectedItem(null)
    } catch (error) {
      console.error(`获取推荐${strategy.label}失败:`, error)
    } finally {
      setRefreshing(false)
    }
  }, [category, strategy.label])

  const handleSelect = (text: string) => {
    setSelectedItem(text)
    setCustomInput('')
  }

  const handleStart = async () => {
    const text = selectedItem || customInput.trim()
    if (!text) return
    if (!strategy.validate(text)) {
      alert(`请输入有效的${strategy.label}`)
      return
    }
    setCurrentCategory(category)
    setCurrentIdiom(text)
    // 通过 API 提交任务到服务端队列
    await createJobAPI(text, category)
    // 重置选择状态
    setSelectedItem(null)
    setCustomInput('')
  }

  const activeItem = selectedItem || customInput.trim()

  if (compact) {
    return (
      <div className="w-full bg-white rounded-card p-4 shadow-md">
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-base font-semibold text-gray-800">{strategy.icon} 选择{strategy.label}</h2>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-primary hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
            {refreshing ? '获取中...' : '换一批'}
          </button>
        </div>
        <div className="grid grid-cols-4 gap-1.5 mb-3 max-h-[220px] overflow-y-auto">
          {displayItems.map((item) => {
            const isSelected = selectedItem === item.sourceText
            const isGenerated = generatedTexts.includes(item.sourceText)
            return (
              <button
                key={item.sourceText}
                onClick={() => handleSelect(item.sourceText)}
                className={`py-2 px-1 rounded-lg text-xs font-medium transition-all relative leading-tight ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-300'
                    : isGenerated
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                }`}
              >
                {item.sourceText}
                {[item.dynasty, item.author].filter(Boolean).join(' ') && (
                  <span className="block text-[10px] opacity-70 mt-0.5">{[item.dynasty, item.author].filter(Boolean).join(' ')}</span>
                )}
                {isSelected && (
                  <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[10px] rounded-full w-3.5 h-3.5 flex items-center justify-center">✓</span>
                )}
                {isGenerated && !isSelected && (
                  <span className="absolute -top-1 -right-1 bg-green-500 text-white text-[10px] rounded-full w-3.5 h-3.5 flex items-center justify-center">✓</span>
                )}
              </button>
            )
          })}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder={`输入${strategy.label}...`}
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
          />
          <button
            onClick={handleStart}
            disabled={!activeItem}
            className="px-4 py-2 bg-primary text-white rounded-button text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            🚀 开始生成
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-primary">🎨 绘本工坊</h1>
        <p className="mt-2 text-lg text-gray-600">和宝贝一起创建{strategy.label}故事</p>
      </div>

      <div className="bg-white rounded-card p-6 shadow-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">{strategy.icon} 选择{strategy.label}</h2>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-primary hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
            {refreshing ? '获取中...' : '换一批'}
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2.5 max-h-[280px] overflow-y-auto">
          {displayItems.map((item) => {
            const isSelected = selectedItem === item.sourceText
            const isGenerated = generatedTexts.includes(item.sourceText)
            return (
              <button
                key={item.sourceText}
                onClick={() => handleSelect(item.sourceText)}
                className={`p-2.5 rounded-lg text-sm font-medium transition-all relative ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-300'
                    : isGenerated
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                }`}
              >
                {item.sourceText}
                {[item.dynasty, item.author].filter(Boolean).join(' ') && (
                  <span className="block text-xs opacity-70 mt-0.5">{[item.dynasty, item.author].filter(Boolean).join(' ')}</span>
                )}
                {isSelected && (
                  <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">✓</span>
                )}
                {isGenerated && !isSelected && (
                  <span className="absolute -top-1 -right-1 bg-green-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">✓</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="bg-white rounded-card p-6 shadow-md">
        <h2 className="text-lg font-semibold mb-4 text-gray-800">✏️ 或输入自定义{strategy.label}</h2>
        <input
          type="text"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          placeholder={`输入${strategy.label}...`}
          className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
        />
      </div>

      <div className="flex justify-center">
        <button
          onClick={handleStart}
          disabled={!activeItem}
          className="button-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          🚀 开始生成绘本
        </button>
      </div>
    </div>
  )
}
