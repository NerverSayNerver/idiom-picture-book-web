'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { getPictureBook } from '@/lib/db'
import { BookViewer } from '@/components/BookViewer'
import type { PictureBook, PreGeneratedIndexItem } from '@/lib/types'

export default function ReadPage() {
  const params = useParams()
  const [book, setBook] = useState<PictureBook | null>(null)
  const [loading, setLoading] = useState(true)

  const loadBook = useCallback(async () => {
    const id = params.id as string

    let loadedBook = await getPictureBook(id)

    if (!loadedBook) {
      try {
        const response = await fetch('/pre-generated/index.json')
        if (response.ok) {
          const index: PreGeneratedIndexItem[] = await response.json()
          const match = index.find((item) => item.id === id)
          if (match) {
            const bookResponse = await fetch(`/pre-generated/${match.idiom}.json`)
            if (bookResponse.ok) {
              loadedBook = await bookResponse.json()
            }
          }

          if (!loadedBook) {
            for (const item of index) {
              const bookResponse = await fetch(`/pre-generated/${item.idiom}.json`)
              if (bookResponse.ok) {
                const fetchedBook: PictureBook = await bookResponse.json()
                if (fetchedBook.title === id || fetchedBook.idiom === id) {
                  loadedBook = fetchedBook
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
  }, [params.id])

  useEffect(() => {
    loadBook()
  }, [loadBook])

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
