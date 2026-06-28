'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getPictureBook, getAllPictureBooks } from '@/lib/db'
import { BookViewer } from '@/components/BookViewer'
import type { PictureBook, PreGeneratedIndexItem } from '@/lib/types'

export default function ReadPage() {
  const params = useParams()
  const [book, setBook] = useState<PictureBook | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const abortController = new AbortController()
    const { signal } = abortController

    const loadBook = async () => {
      // useParams 在某些场景下返回的还是 URL 编码值，需要解码
      const rawId = params.id as string
      const id = decodeURIComponent(rawId)

      // 先从 IndexedDB 加载（用 id 匹配，可能是 UUID 或成语名）
      let loadedBook = await getPictureBook(id)

      // 如果 IndexedDB 没找到，尝试通过成语名匹配用户生成的绘本
      if (!loadedBook && !signal.aborted) {
        const allBooks = await getAllPictureBooks()
        loadedBook = allBooks.find(b => b.idiom === id || b.title === id || b.id === id)
      }

      // 如果还是没找到，尝试从预生成文件加载
      if (!loadedBook && !signal.aborted) {
        try {
          const response = await fetch('/pre-generated/index.json', { signal })
          if (response.ok) {
            const index = await response.json()
            const match = index.find((item: PreGeneratedIndexItem) => item.idiom === id || item.id === id)
            if (match && !signal.aborted) {
              const bookResponse = await fetch(`/pre-generated/${match.idiom}.json`, { signal })
              if (bookResponse.ok) {
                loadedBook = await bookResponse.json()
              }
            }

            // 如果还是没找到，尝试遍历所有文件
            if (!loadedBook && !signal.aborted) {
              for (const item of index) {
                if (signal.aborted) break
                const bookResponse = await fetch(`/pre-generated/${item.idiom}.json`, { signal })
                if (bookResponse.ok) {
                  const book = await bookResponse.json()
                  if (book.title === id || book.idiom === id) {
                    loadedBook = book
                    break
                  }
                }
              }
            }
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return
        }
      }

      if (!signal.aborted) {
        setBook(loadedBook || null)
        setLoading(false)
      }
    }
    loadBook()

    return () => {
      abortController.abort()
    }
  }, [params.id])

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-xl text-gray-600">加载中...</div>
      </main>
    )
  }

  if (!book) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            绘本未找到
          </h1>
          <a href="/" className="button-primary">
            返回首页
          </a>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gradient-to-b from-secondary/30 to-background">
      <BookViewer book={book} />
    </main>
  )
}
