'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getPictureBook } from '@/lib/db'
import { BookViewer } from '@/components/BookViewer'
import type { PictureBook } from '@/lib/types'

export default function ReadPage() {
  const params = useParams()
  const [book, setBook] = useState<PictureBook | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadBook = async () => {
      const id = params.id as string

      // 先从 IndexedDB 加载
      let loadedBook = await getPictureBook(id)

      // 如果没找到，尝试从预生成文件加载
      if (!loadedBook) {
        try {
          // 尝试通过 id 匹配预生成的绘本
          const response = await fetch('/pre-generated/index.json')
          if (response.ok) {
            const index = await response.json()
            const match = index.find((item: any) => item.id === id)
            if (match) {
              const bookResponse = await fetch(`/pre-generated/${match.idiom}.json`)
              if (bookResponse.ok) {
                loadedBook = await bookResponse.json()
              }
            }

            // 如果还是没找到，尝试通过标题匹配
            if (!loadedBook) {
              for (const item of index) {
                const bookResponse = await fetch(`/pre-generated/${item.idiom}.json`)
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
        } catch {
          // no pre-generated books
        }
      }

      setBook(loadedBook || null)
      setLoading(false)
    }
    loadBook()
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
