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
      const loadedBook = await getPictureBook(id)
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
