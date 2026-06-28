'use client'

import { useState, useEffect } from 'react'
import { IDIOM_LIST } from '@/lib/content-info'
import type { ContentInfo } from '@/lib/types'
import { useAppStore } from '@/lib/store'
import { useRouter } from 'next/navigation'
import { getAllPictureBooks, getRandomIdioms, saveRecommendedIdioms } from '@/lib/db'
import { fetchRecommendedIdioms } from '@/app/actions/recommend'
import type { PreGeneratedIndexItem } from '@/lib/types'

interface IdiomSelectorProps {
  onBatchGenerate?: (idioms: string[]) => void
  compact?: boolean
}

export function IdiomSelector({ onBatchGenerate, compact }: IdiomSelectorProps) {
  const [customIdiom, setCustomIdiom] = useState('')
  const [selectedIdiom, setSelectedIdiom] = useState<string | null>(null)
  const [selectedIdioms, setSelectedIdioms] = useState<Set<string>>(new Set())
  const [existingIdioms, setExistingIdioms] = useState<Set<string>>(new Set())
  const [displayIdioms, setDisplayIdioms] = useState<ContentInfo[]>(IDIOM_LIST)
  const [refreshing, setRefreshing] = useState(false)
  const setCurrentIdiom = useAppStore((s) => s.setCurrentIdiom)
  const router = useRouter()

  const toggleIdiom = (idiom: string) => {
    setSelectedIdioms(prev => {
      const next = new Set(prev)
      next.has(idiom) ? next.delete(idiom) : next.add(idiom)
      return next
    })
    setSelectedIdiom(null)
    setCustomIdiom('')
  }

  // 初始化：加载已有绘本 + 从数据库随机加载推荐成语
  useEffect(() => {
    const abortController = new AbortController()
    const { signal } = abortController

    const loadExisting = async () => {
      try {
        const preGeneratedResponse = await fetch('/pre-generated/index.json', { signal })
        if (preGeneratedResponse.ok) {
          const index = await preGeneratedResponse.json()
          const idioms = new Set<string>(index.map((item: PreGeneratedIndexItem) => item.idiom))
          setExistingIdioms(idioms)
        }

        const userBooks = await getAllPictureBooks()
        setExistingIdioms(prev => {
          const newSet = new Set<string>(prev)
          userBooks.forEach(book => newSet.add(book.idiom))
          return newSet
        })
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error('加载绘本列表失败:', error)
      }
    }
    loadExisting()
    loadRandomIdioms()

    return () => {
      abortController.abort()
    }
  }, [])

  const IDIOM_DISPLAY_COUNT = 40

  const loadRandomIdioms = async () => {
    try {
      const random = await getRandomIdioms(IDIOM_DISPLAY_COUNT)
      if (random.length > 0) {
        setDisplayIdioms(random)
      }
    } catch (error) {
      console.error('加载推荐成语失败:', error)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      // 传入当前显示的成语作为排除列表
      const currentIdioms = displayIdioms.map(i => i.sourceText)
      const newIdioms = await fetchRecommendedIdioms(currentIdioms)
      // 去重保存到数据库
      await saveRecommendedIdioms(newIdioms)
      // 从数据库随机取 40 个
      const random = await getRandomIdioms(IDIOM_DISPLAY_COUNT)
      if (random.length > 0) {
        setDisplayIdioms(random)
      }
      setSelectedIdiom(null)
      setSelectedIdioms(new Set())
    } catch (error) {
      console.error('获取推荐成语失败:', error)
    } finally {
      setRefreshing(false)
    }
  }

  const handleSelect = (idiom: string) => {
    // 如果已有绘本，直接跳转阅读页
    if (existingIdioms.has(idiom)) {
      router.push(`/read/${encodeURIComponent(idiom)}`)
      return
    }
    setSelectedIdiom(idiom)
    setCustomIdiom('')
  }

  const handleCustomInput = (value: string) => {
    setCustomIdiom(value)
    setSelectedIdiom(null)
  }

  const handleStart = () => {
    const idiom = selectedIdiom || customIdiom.trim()
    if (!idiom) return

    // 已有绘本，直接跳转阅读页
    if (existingIdioms.has(idiom)) {
      router.push(`/read/${encodeURIComponent(idiom)}`)
      return
    }

    // 不存在，直接生成
    setCurrentIdiom(idiom)
    router.push('/generate')
  }

  const activeIdiom = selectedIdiom || customIdiom.trim()

  if (compact) {
    return (
      <div id="create" className="w-full bg-white rounded-card p-4 shadow-md">
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-base font-semibold text-gray-800">🎭 选择成语</h2>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-primary hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
            {refreshing ? '获取中...' : '换一批'}
          </button>
        </div>
        <div className="grid grid-cols-5 gap-1.5 mb-3 max-h-[220px] overflow-y-auto">
          {displayIdioms.map((item) => {
            const isMultiSelected = selectedIdioms.has(item.sourceText)
            const isSingleSelected = selectedIdiom === item.sourceText
            return (
              <button
                key={item.sourceText}
                onClick={() => onBatchGenerate ? toggleIdiom(item.sourceText) : handleSelect(item.sourceText)}
                className={`py-1.5 px-1 rounded-lg text-[11px] font-medium transition-all relative leading-tight ${
                  isMultiSelected || isSingleSelected
                    ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-300'
                    : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                }`}
              >
                {item.sourceText}
                {isMultiSelected && (
                  <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[10px] rounded-full w-3.5 h-3.5 flex items-center justify-center">✓</span>
                )}
                {!isMultiSelected && existingIdioms.has(item.sourceText) && (
                  <span className="absolute -top-1 -right-1 bg-green-500 text-white text-[10px] rounded-full w-3.5 h-3.5 flex items-center justify-center">✓</span>
                )}
              </button>
            )
          })}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={customIdiom}
            onChange={(e) => handleCustomInput(e.target.value)}
            placeholder="输入自定义成语..."
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
          />
          {onBatchGenerate && selectedIdioms.size > 0 ? (
            <button
              onClick={() => onBatchGenerate(Array.from(selectedIdioms))}
              className="px-4 py-2 bg-primary text-white rounded-button text-sm font-medium hover:bg-primary/90 transition-colors whitespace-nowrap"
            >
              🚀 批量生成（{selectedIdioms.size}）
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={!activeIdiom}
              className="px-4 py-2 bg-primary text-white rounded-button text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              🚀 开始生成
            </button>
          )}
        </div>
        {customIdiom.trim() && existingIdioms.has(customIdiom.trim()) && (
          <p className="text-xs text-green-600 mt-2">✓ 该成语已有绘本</p>
        )}
      </div>
    )
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-8">
      {/* 标题 */}
      <div className="text-center">
        <h1 className="text-4xl font-bold text-primary">🎨 成语绘本工坊</h1>
        <p className="mt-2 text-lg text-gray-600">和宝贝一起创造成语故事</p>
      </div>

      {/* 成语网格 */}
      <div className="bg-white rounded-card p-6 shadow-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">🎭 选择成语</h2>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-primary hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
            {refreshing ? '获取中...' : '换一批'}
          </button>
        </div>
        <div className="grid grid-cols-5 gap-2.5 max-h-[280px] overflow-y-auto">
          {displayIdioms.map((item) => {
            const isMultiSelected = selectedIdioms.has(item.sourceText)
            const isSingleSelected = selectedIdiom === item.sourceText
            return (
              <button
                key={item.sourceText}
                onClick={() => onBatchGenerate ? toggleIdiom(item.sourceText) : handleSelect(item.sourceText)}
                className={`p-2 rounded-lg text-xs font-medium transition-all relative ${
                  isMultiSelected || isSingleSelected
                    ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-300'
                    : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                }`}
              >
                {item.sourceText}
                {isMultiSelected && (
                  <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">✓</span>
                )}
                {!isMultiSelected && existingIdioms.has(item.sourceText) && (
                  <span className="absolute -top-1 -right-1 bg-green-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">✓</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* 自定义输入 */}
      <div className="bg-white rounded-card p-6 shadow-md">
        <h2 className="text-lg font-semibold mb-4 text-gray-800">✏️ 或输入自定义成语</h2>
        <input
          type="text"
          value={customIdiom}
          onChange={(e) => handleCustomInput(e.target.value)}
          placeholder="输入一个成语..."
          className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
        />
        {/* 自定义输入的已有提示 */}
        {customIdiom.trim() && existingIdioms.has(customIdiom.trim()) && (
          <p className="text-sm text-green-600 mt-2">
            ✓ 该成语已有绘本
          </p>
        )}
      </div>

      {/* 开始按钮 */}
      <div className="flex justify-center gap-4">
        {onBatchGenerate && selectedIdioms.size > 0 ? (
          <button
            onClick={() => onBatchGenerate(Array.from(selectedIdioms))}
            className="button-primary"
          >
            🚀 批量生成（{selectedIdioms.size} 个）
          </button>
        ) : (
          <button
            onClick={handleStart}
            disabled={!activeIdiom}
            className="button-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            🚀 开始生成绘本
          </button>
        )}
      </div>
    </div>
  )
}
