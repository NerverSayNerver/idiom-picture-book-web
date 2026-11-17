'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useAppStore } from '@/lib/store'
import { createJobAPI } from '@/lib/use-jobs'
import { getStrategy } from '@/lib/content-types'
import { getBookCardSubtitle, getBookCardAttribution, formatPoetryAttribution } from '@/lib/book-display'
import type { ContentCategory } from '@/lib/types'

interface BookCardBook {
  id: string
  category: string
  sourceText?: string
  title: string
  meaning: string
  createdAt?: string
  sceneCount?: number
  author?: string
  dynasty?: string
  fullText?: string
  scenes?: Array<{ imageUrl?: string; imageBlob?: Blob; narration?: string; title?: string }>
  idiom?: string
}

interface BookCardProps {
  book: BookCardBook
  onDelete: (id: string) => void
  entranceDelay?: number
}

// Tailwind JIT 可扫描的字面量类名：0~250ms，第 7 项起统一 250ms
const ENTRANCE_DELAY_CLASSES = [
  '[animation-delay:0ms]',
  '[animation-delay:50ms]',
  '[animation-delay:100ms]',
  '[animation-delay:150ms]',
  '[animation-delay:200ms]',
  '[animation-delay:250ms]',
]

function formatTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function BookCard({ book, onDelete, entranceDelay = 0 }: BookCardProps) {
  // 首次挂载即固定延迟：搜索/筛选改变 index 时不重播已存在卡片的入场动画
  const frozenDelayRef = useRef(entranceDelay)
  const delayIndex = Math.min(Math.max(Math.floor(frozenDelayRef.current / 50), 0), 5)
  const [coverImage, setCoverImage] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const setCurrentIdiom = useAppStore((s) => s.setCurrentIdiom)
  const setCurrentCategory = useAppStore((s) => s.setCurrentCategory)
  const strategy = book.category ? getStrategy(book.category as any) : null

  useEffect(() => {
    if (book.scenes && book.scenes.length > 0) {
      const firstScene = book.scenes.find((s) => s.imageUrl)
      if (firstScene?.imageUrl) {
        setCoverImage(firstScene.imageUrl)
        return
      }
    }
    // 尝试从文件系统路径构造封面图 URL
    // 注意：必须用 book.id（经过 sanitizeFilename 净化的文件夹名），
    // 而非 sourceText（原始文本，可能含逗号等标点），否则路径不匹配
    if (book.id && book.category) {
      setCoverImage(`/generated/${book.category}/${book.id}/1.png`)
    }
  }, [book.scenes, book.category, book.id])

  const sourceText = book.sourceText || book.idiom || book.title
  const isPoetry = book.category === 'poetry'
  const isNurseryRhyme = book.category === 'nursery-rhyme'
  const cardSubtitle = getBookCardSubtitle(book as any)
  const poetryAttribution = isPoetry
    ? formatPoetryAttribution({ ...book, sourceText, category: book.category } as any)
    : undefined
  const cardAttribution = getBookCardAttribution(book as any)

  const handleRegenerate = () => {
    if (!sourceText) return
    setCurrentCategory(book.category as ContentCategory)
    setCurrentIdiom(sourceText)
    createJobAPI(sourceText, book.category || 'idiom')
    setShowConfirm(false)
  }

  return (
    // 外层只负责入场动画，内层负责 hover 位移：避免 fade-up 的 transform 覆盖 hover transform
    <div className={`animate-fade-up ${ENTRANCE_DELAY_CLASSES[delayIndex]}`}>
      <div className="bg-white rounded-card overflow-hidden shadow-md hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-lg transition-all duration-normal ease-standard relative flex flex-col h-full">
        {/* 品类徽标 */}
        {strategy && (
          <span className="absolute top-2 left-2 z-10 bg-white/90 rounded-full px-2 py-0.5 text-xs font-medium shadow-sm">
            {strategy.icon} {strategy.label}
          </span>
        )}

        {/* 封面 */}
        <div className="h-48 bg-gradient-to-br from-secondary to-primary/20 flex items-center justify-center overflow-hidden shrink-0">
          {coverImage ? (
            <img src={coverImage} alt={book.title} className="w-full h-full object-cover"
              onError={() => setCoverImage(null)}
            />
          ) : (
            <img
              src="https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Children%27s%20book%20cover%20illustration%2C%20a%20blank%20open%20storybook%20with%20magical%20sparkles%20and%20stars%20floating%20around%2C%20peach%20pink%20and%20cream%20pastel%20color%20palette%2C%20soft%20watercolor%20style%2C%20dreamy%20and%20whimsical%2C%20no%20text&image_size=portrait_4_3"
              alt={book.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          )}
        </div>

        {/* 信息 */}
        <div className="p-4 flex flex-col flex-1">
          <h3 className="text-lg font-bold text-gray-800 mb-1">{book.title}</h3>
          {isPoetry && poetryAttribution && (
            <p className="text-xs text-amber-700 mb-1">{poetryAttribution}</p>
          )}
          {!isPoetry && cardAttribution && (
            <p className="text-xs text-gray-500 mb-1">{cardAttribution}</p>
          )}
          <p className="text-xs text-gray-400 mb-2 font-mono">{formatTime(book.createdAt)}</p>
          <p className={`text-sm text-gray-600 mb-4 ${isNurseryRhyme ? 'line-clamp-3 italic' : 'line-clamp-2'}`}>
            {cardSubtitle}
          </p>

          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
              {book.sceneCount || (book.scenes?.length) || '?'} 个场景
            </span>
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center gap-2 mt-auto">
            <Link
              href={`/read/${book.category}:${encodeURIComponent(book.id)}`}
              className="flex-1 flex items-center justify-center py-2 bg-primary text-ink rounded-button text-sm font-medium hover:bg-primary/90 active:scale-[0.97] transition-all duration-fast"
            >
              📖 阅读
            </Link>
            {showConfirm ? (
              <div className="flex items-center gap-1">
                <button onClick={handleRegenerate} className="px-2 py-2 bg-orange-700 text-white rounded-button text-sm hover:bg-orange-800 active:scale-[0.97] transition-all duration-fast">确定</button>
                <button onClick={() => setShowConfirm(false)} className="px-2 py-2 bg-gray-200 text-gray-600 rounded-button text-sm hover:bg-gray-300 active:scale-[0.97] transition-all duration-fast">取消</button>
              </div>
            ) : (
              <button onClick={() => setShowConfirm(true)} className="px-3 py-2 bg-orange-100 text-orange-600 rounded-button text-sm hover:bg-orange-200 active:scale-[0.97] transition-all duration-fast">🔄</button>
            )}
            <button onClick={() => onDelete(book.id)} className="px-3 py-2 bg-red-100 text-red-600 rounded-button text-sm hover:bg-red-200 active:scale-[0.97] transition-all duration-fast">🗑️</button>
          </div>
        </div>
      </div>
    </div>
  )
}
