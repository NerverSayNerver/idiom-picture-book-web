'use client'

import { useState } from 'react'
import { IDIOM_LIST } from '@/lib/idioms'
import { useAppStore } from '@/lib/store'
import { useRouter } from 'next/navigation'

export function IdiomSelector() {
  const [customIdiom, setCustomIdiom] = useState('')
  const [selectedIdiom, setSelectedIdiom] = useState<string | null>(null)
  const setCurrentIdiom = useAppStore((s) => s.setCurrentIdiom)
  const router = useRouter()

  const handleSelect = (idiom: string) => {
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
    setCurrentIdiom(idiom)
    router.push('/generate')
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
          {IDIOM_LIST.map((item) => (
            <button
              key={item.idiom}
              onClick={() => handleSelect(item.idiom)}
              className={`p-3 rounded-lg text-sm font-medium transition-all ${
                selectedIdiom === item.idiom
                  ? 'bg-primary text-white shadow-md scale-105'
                  : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
              }`}
            >
              {item.idiom}
            </button>
          ))}
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
      </div>

      {/* 开始按钮 */}
      <div className="flex justify-center">
        <button
          onClick={handleStart}
          disabled={!activeIdiom}
          className="button-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          🚀 开始生成绘本
        </button>
      </div>
    </div>
  )
}
