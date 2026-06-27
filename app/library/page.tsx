'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { getAllPictureBooks, deletePictureBook } from '@/lib/db'
import type { PictureBook, PreGeneratedIndexItem } from '@/lib/types'

export default function LibraryPage() {
  const [books, setBooks] = useState<PictureBook[]>([])
  const [loading, setLoading] = useState(true)

  const loadBooks = useCallback(async () => {
    const allBooks: PictureBook[] = []
    const seenIds = new Set<string>()

    try {
      const response = await fetch('/pre-generated/index.json')
      if (response.ok) {
        const index: PreGeneratedIndexItem[] = await response.json()
        for (const item of index) {
          try {
            const bookResponse = await fetch(`/pre-generated/${item.idiom}.json`)
            if (bookResponse.ok) {
              const book: PictureBook = await bookResponse.json()
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
  }, [])

  useEffect(() => {
    loadBooks()
  }, [loadBooks])

  const handleDelete = useCallback(async (id: string) => {
    if (window.confirm('确定要删除这本绘本吗？')) {
      await deletePictureBook(id)
      setBooks((prev) => prev.filter((b) => b.id !== id))
    }
  }, [])

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
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary">📚 我的绘本书架</h1>
          <p className="mt-2 text-gray-600">共 {books.length} 本绘本</p>
        </div>

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

        {books.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {books.map((book) => (
              <BookCard key={book.id} book={book} onDelete={handleDelete} />
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

  const blobUrls = useMemo(() => {
    const urls = new Map<number, string>()
    book.scenes.forEach((s, i) => {
      if (s.imageBlob && !s.imageUrl) {
        urls.set(i, URL.createObjectURL(s.imageBlob))
      }
    })
    return urls
  }, [book])

  useEffect(() => {
    const firstScene = book.scenes.find((s) => s.imageUrl || s.imageBlob)
    if (firstScene?.imageUrl) {
      setCoverImage(firstScene.imageUrl)
    } else if (firstScene?.imageBlob) {
      const index = book.scenes.indexOf(firstScene)
      const url = blobUrls.get(index)
      if (url) setCoverImage(url)
    }

    return () => {
      blobUrls.forEach((url) => URL.revokeObjectURL(url))
      blobUrls.clear()
    }
  }, [book, blobUrls])

  const createdDate = new Date(book.createdAt).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="bg-white rounded-card overflow-hidden shadow-md hover:shadow-lg transition-all hover:scale-[1.02]">
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

      <div className="p-4">
        <h3 className="text-lg font-bold text-gray-800 mb-1">{book.title}</h3>
        <p className="text-sm text-gray-500 mb-2">{createdDate}</p>
        <p className="text-sm text-gray-600 line-clamp-2 mb-4">
          {book.meaning}
        </p>

        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
            {book.scenes.length} 个场景
          </span>
        </div>

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
