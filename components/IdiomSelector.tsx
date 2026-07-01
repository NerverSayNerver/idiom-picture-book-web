'use client'

import { useState, useEffect } from 'react'
import { IDIOM_LIST } from '@/lib/idioms'
import { useAppStore } from '@/lib/store'
import { useRouter } from 'next/navigation'
import { getAllPictureBooks } from '@/lib/db'
import { DuplicateCheckDialog } from './DuplicateCheckDialog'
import { validateIdiom } from '@/lib/security'

interface IdiomSelectorProps {
  onBatchGenerate?: (idioms: string[]) => void
}

export function IdiomSelector({ onBatchGenerate }: IdiomSelectorProps) {
  const [customIdiom, setCustomIdiom] = useState('')
  const [selectedIdiom, setSelectedIdiom] = useState<string | null>(null)
  const [selectedIdioms, setSelectedIdioms] = useState<Set<string>>(new Set())
  const [existingIdioms, setExistingIdioms] = useState<Set<string>>(new Set())
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false)
  const [duplicateIdiom, setDuplicateIdiom] = useState<string | null>(null)
  const [inputError, setInputError] = useState<string | null>(null)
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

  // 加载已有的绘本列表
  useEffect(() => {
    loadExistingIdioms()
  }, [])

  const loadExistingIdioms = async () => {
    try {
      // 加载预生成的绘本
      const preGeneratedResponse = await fetch('/pre-generated/index.json')
      if (preGeneratedResponse.ok) {
        const index = await preGeneratedResponse.json()
        const idioms = new Set<string>(index.map((item: any) => item.idiom))
        setExistingIdioms(idioms)
      }

      // 加载用户生成的绘本
      const userBooks = await getAllPictureBooks()
      setExistingIdioms(prev => {
        const newSet = new Set<string>(prev)
        userBooks.forEach(book => newSet.add(book.idiom))
        return newSet
      })
    } catch (error) {
      console.error('加载绘本列表失败:', error)
    }
  }

  const handleSelect = (idiom: string) => {
    setSelectedIdiom(idiom)
    setCustomIdiom('')
  }

  const handleCustomInput = (value: string) => {
    setCustomIdiom(value)
    setSelectedIdiom(null)
    if (value.trim()) {
      const { valid, error } = validateIdiom(value)
      setInputError(valid ? null : error || null)
    } else {
      setInputError(null)
    }
  }

  const handleStart = () => {
    const idiom = selectedIdiom || customIdiom.trim()
    if (!idiom) return

    // 验证输入
    const { valid, error } = validateIdiom(idiom)
    if (!valid) {
      setInputError(error || '输入无效')
      return
    }

    // 检查是否已存在
    if (existingIdioms.has(idiom)) {
      setDuplicateIdiom(idiom)
      setShowDuplicateDialog(true)
      return
    }

    // 不存在，直接生成
    setCurrentIdiom(idiom)
    router.push('/generate')
  }

  const handleViewExisting = () => {
    if (duplicateIdiom) {
      // 跳转到阅读页（需要找到对应的绘本ID）
      // 这里简化处理，直接跳转到绘本库
      router.push('/library')
    }
    setShowDuplicateDialog(false)
  }

  const handleRegenerate = () => {
    if (duplicateIdiom) {
      setCurrentIdiom(duplicateIdiom)
      router.push('/generate')
    }
    setShowDuplicateDialog(false)
  }

  const handleCloseDialog = () => {
    setShowDuplicateDialog(false)
    setDuplicateIdiom(null)
  }

  const activeIdiom = selectedIdiom || customIdiom.trim()

  return (
    <div className="w-full max-w-2xl mx-auto space-y-8">
      {/* 标题 */}
      <div className="text-center">
        <h1 className="text-4xl font-bold text-primary">🎨 成语绘本工坊</h1>
        <p className="mt-2 text-lg text-gray-600">和宝贝一起创造成语故事</p>
      </div>

      {/* 成语网格 */}
      <div className="bg-white rounded-card p-6 shadow-md">
        <h2 className="text-lg font-semibold mb-4 text-gray-800">🎭 选择成语</h2>
        <div className="grid grid-cols-5 gap-3">
          {IDIOM_LIST.map((item) => {
            const isMultiSelected = selectedIdioms.has(item.idiom)
            const isSingleSelected = selectedIdiom === item.idiom
            return (
              <button
                key={item.idiom}
                onClick={() => onBatchGenerate ? toggleIdiom(item.idiom) : handleSelect(item.idiom)}
                className={`p-3 rounded-lg text-sm font-medium transition-all relative ${
                  isMultiSelected || isSingleSelected
                    ? 'bg-blue-600 text-white shadow-md scale-105 ring-2 ring-blue-300'
                    : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                }`}
              >
                {item.idiom}
                {isMultiSelected && (
                  <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">✓</span>
                )}
                {!isMultiSelected && existingIdioms.has(item.idiom) && (
                  <span className="absolute -top-1 -right-1 bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">✓</span>
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
          maxLength={20}
          className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
        />
        {/* 输入错误提示 */}
        {inputError && (
          <p className="text-sm text-red-600 mt-2">
            ⚠️ {inputError}
          </p>
        )}
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

      {/* 重复检查对话框 */}
      {showDuplicateDialog && duplicateIdiom && (
        <DuplicateCheckDialog
          idiom={duplicateIdiom}
          onViewExisting={handleViewExisting}
          onRegenerate={handleRegenerate}
          onClose={handleCloseDialog}
        />
      )}
    </div>
  )
}
