'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAppStore } from '@/lib/store'
import { getStrategy } from '@/lib/content-types'

interface BookCardBook {
  id: string
  category: string
  sourceText?: string
  title: string
  meaning: string
  createdAt?: string
  sceneCount?: number
  scenes?: Array<{ imageUrl?: string; imageBlob?: Blob }>
  idiom?: string
}

interface BookCardProps {
  book: BookCardBook
  onDelete: (id: string) => void
  onRegenerate?: (idiom: string) => void
}

function formatTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function BookCard({ book, onDelete, onRegenerate }: BookCardProps) {
  const [coverImage, setCoverImage] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const setCurrentIdiom = useAppStore((s) => s.setCurrentIdiom)
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
    const sourceText = book.sourceText || book.idiom || book.title
    if (sourceText && book.category) {
      setCoverImage(`/generated/${book.category}/${encodeURIComponent(sourceText)}/1.png`)
    }
  }, [book.scenes, book.category, book.sourceText, book.idiom, book.title])

  const sourceText = book.sourceText || book.idiom || book.title

  const handleRegenerate = async () => {
    onDelete(book.id)
    setCurrentIdiom(book.idiom || sourceText)
    onRegenerate?.(book.idiom || sourceText)
  }

  return (
    <div className="bg-white rounded-card overflow-hidden shadow-md hover:shadow-lg transition-all hover:scale-[1.02] relative">
      {/* 品类徽标 */}
      {strategy && (
        <span className="absolute top-2 left-2 z-10 bg-white/90 rounded-full px-2 py-0.5 text-xs font-medium shadow-sm">
          {strategy.icon} {strategy.label}
        </span>
      )}

      {/* 封面 */}
      <div className="h-48 bg-gradient-to-br from-secondary to-primary/20 flex items-center justify-center overflow-hidden">
        {coverImage ? (
          <img src={coverImage} alt={book.title} className="w-full h-full object-cover"
            onError={() => setCoverImage(null)}
          />
        ) : (
          <div className="text-6xl">📖</div>
        )}
      </div>

      {/* 信息 */}
      <div className="p-4">
        <h3 className="text-lg font-bold text-gray-800 mb-1">{book.title}</h3>
        <p className="text-xs text-gray-400 mb-2 font-mono">{formatTime(book.createdAt)}</p>
        <p className="text-sm text-gray-600 line-clamp-2 mb-4">{book.meaning}</p>

        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
            {book.sceneCount || (book.scenes?.length) || '?'} 个场景
          </span>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-2">
          <Link
            href={`/read/${book.category}:${encodeURIComponent(sourceText)}`}
            className="flex-1 text-center py-2 bg-primary text-white rounded-button text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            📖 阅读
          </Link>
          {showConfirm ? (
            <div className="flex gap-1">
              <button onClick={handleRegenerate} className="px-2 py-2 bg-orange-500 text-white rounded-button text-sm hover:bg-orange-600 transition-colors">确定</button>
              <button onClick={() => setShowConfirm(false)} className="px-2 py-2 bg-gray-200 text-gray-600 rounded-button text-sm hover:bg-gray-300 transition-colors">取消</button>
            </div>
          ) : (
            <button onClick={() => setShowConfirm(true)} className="px-3 py-2 bg-orange-100 text-orange-600 rounded-button text-sm hover:bg-orange-200 transition-colors">🔄</button>
          )}
          <button onClick={() => onDelete(book.id)} className="px-3 py-2 bg-red-100 text-red-600 rounded-button text-sm hover:bg-red-200 transition-colors">🗑️</button>
        </div>
      </div>
    </div>
  )
}
