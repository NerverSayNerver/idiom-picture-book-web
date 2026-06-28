'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { deletePictureBook } from '@/lib/db'
import type { PictureBook } from '@/lib/types'

interface BookCardProps {
  book: PictureBook
  onDelete: (id: string) => void
}

export function BookCard({ book, onDelete }: BookCardProps) {
  const [coverImage, setCoverImage] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const router = useRouter()
  const setCurrentIdiom = useAppStore((s) => s.setCurrentIdiom)

  // 使用 book.scenes 作为依赖（而非整个 book 对象），避免对象引用变化导致频繁 re-render
  useEffect(() => {
    const firstScene = book.scenes.find((s) => s.imageUrl)
    if (firstScene?.imageUrl) {
      setCoverImage(firstScene.imageUrl)
    } else if (firstScene?.imageBlob) {
      const url = URL.createObjectURL(firstScene.imageBlob)
      setCoverImage(url)
      // 清理：当组件卸载或依赖变化时释放 blob URL
      return () => {
        URL.revokeObjectURL(url)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.scenes])

  const createdDate = new Date(book.createdAt).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const handleRegenerate = async () => {
    await deletePictureBook(book.id)
    onDelete(book.id)
    setCurrentIdiom(book.idiom)
    router.push('/generate')
  }

  return (
    <div className="bg-white rounded-card overflow-hidden shadow-md hover:shadow-lg transition-all hover:scale-[1.02]">
      {/* 封面 */}
      <div className="h-48 bg-gradient-to-br from-secondary to-primary/20 flex items-center justify-center overflow-hidden">
        {coverImage ? (
          <img
            src={coverImage}
            alt={book.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="text-6xl">📖</div>
        )}
      </div>

      {/* 信息 */}
      <div className="p-4">
        <h3 className="text-lg font-bold text-gray-800 mb-1">{book.title}</h3>
        <p className="text-sm text-gray-500 mb-2">{createdDate}</p>
        <p className="text-sm text-gray-600 line-clamp-2 mb-4">
          {book.meaning}
        </p>

        {/* 场景数 */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
            {book.scenes.length} 个场景
          </span>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-2">
          <Link
            href={`/read/${book.id}`}
            className="flex-1 text-center py-2 bg-primary text-white rounded-button text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            📖 阅读
          </Link>
          {showConfirm ? (
            <div className="flex gap-1">
              <button
                onClick={handleRegenerate}
                className="px-2 py-2 bg-orange-500 text-white rounded-button text-sm hover:bg-orange-600 transition-colors"
              >
                确定
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="px-2 py-2 bg-gray-200 text-gray-600 rounded-button text-sm hover:bg-gray-300 transition-colors"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowConfirm(true)}
              className="px-3 py-2 bg-orange-100 text-orange-600 rounded-button text-sm hover:bg-orange-200 transition-colors"
            >
              🔄
            </button>
          )}
          <button
            onClick={() => onDelete(book.id)}
            className="px-3 py-2 bg-red-100 text-red-600 rounded-button text-sm hover:bg-red-200 transition-colors"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  )
}
