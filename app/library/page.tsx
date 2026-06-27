'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getAllPictureBooks, deletePictureBook, savePictureBook } from '@/lib/db'
import type { PictureBook } from '@/lib/types'

export default function LibraryPage() {
  const [books, setBooks] = useState<PictureBook[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadBooks()
  }, [])

  const loadBooks = async () => {
    const allBooks: PictureBook[] = []
    const seenIds = new Set<string>()

    // 1. 先加载预生成的绘本
    try {
      const response = await fetch('/pre-generated/index.json')
      if (response.ok) {
        const index = await response.json()
        for (const item of index) {
          try {
            const bookResponse = await fetch(`/pre-generated/${item.idiom}.json`)
            if (bookResponse.ok) {
              const book = await bookResponse.json()
              if (!seenIds.has(book.idiom)) {
                allBooks.push(book)
                seenIds.add(book.idiom)
              }
            }
          } catch {
            // skip
          }
        }
      }
    } catch {
      // no pre-generated books
    }

    // 2. 再加载 IndexedDB 中用户生成的绘本
    try {
      const userBooks = await getAllPictureBooks()
      for (const book of userBooks) {
        if (!seenIds.has(book.idiom)) {
          allBooks.push(book)
          seenIds.add(book.idiom)
        }
      }
    } catch {
      // skip
    }

    setBooks(allBooks)
    setLoading(false)
  }

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除这本绘本吗？')) {
      await deletePictureBook(id)
      setBooks(books.filter((b) => b.id !== id))
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-xl text-gray-600">加载中...</div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen flex-col items-center p-8 bg-gradient-to-b from-secondary/30 to-background">
      <div className="w-full max-w-6xl">
        {/* 标题 */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary">📚 我的绘本书架</h1>
          <p className="mt-2 text-gray-600">共 {books.length} 本绘本</p>
        </div>

        {/* 空状态 */}
        {books.length === 0 && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">📖</div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">
              还没有绘本
            </h2>
            <p className="text-gray-500 mb-6">快去创建你的第一本成语绘本吧！</p>
            <Link href="/" className="button-primary inline-block">
              🎨 开始创作
            </Link>
          </div>
        )}

        {/* 绘本网格 */}
        {books.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {books.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

function BookCard({
  book,
  onDelete,
}: {
  book: PictureBook
  onDelete: (id: string) => void
}) {
  const [coverImage, setCoverImage] = useState<string | null>(null)

  useEffect(() => {
    // 获取封面图像
    const firstScene = book.scenes.find((s) => s.imageUrl)
    if (firstScene?.imageUrl) {
      // 如果是本地路径，直接使用
      if (firstScene.imageUrl.startsWith('/pre-generated/')) {
        setCoverImage(firstScene.imageUrl)
      } else {
        setCoverImage(firstScene.imageUrl)
      }
    } else if (firstScene?.imageBlob) {
      setCoverImage(URL.createObjectURL(firstScene.imageBlob))
    }
  }, [book])

  const createdDate = new Date(book.createdAt).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

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
