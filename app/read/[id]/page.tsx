'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { BookViewer } from '@/components/BookViewer'
import type { PictureBook } from '@/lib/types'

export default function ReadPage() {
  const params = useParams()
  const [book, setBook] = useState<PictureBook | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const abortController = new AbortController()
    const { signal } = abortController

    const loadBook = async () => {
      const rawId = params.id as string
      const id = decodeURIComponent(rawId)
      // 格式：category:sourceText（如 idiom:守株待兔）
      // 兼容旧格式：直接是名称 → 走 idiom 品类
      const separatorIndex = id.indexOf(':')
      const category = separatorIndex > 0 ? id.substring(0, separatorIndex) : 'idiom'
      const sourceText = separatorIndex > 0 ? id.substring(separatorIndex + 1) : id

      try {
        const response = await fetch(
          `/generated/${category}/${encodeURIComponent(sourceText)}/book.json`,
          { signal }
        )
        if (response.ok) {
          const data = await response.json()
          setBook(data)
        } else {
          setBook(null)
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setBook(null)
      }
      if (!signal.aborted) setLoading(false)
    }
    loadBook()

    return () => abortController.abort()
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
          <h1 className="text-2xl font-bold text-gray-800 mb-4">绘本未找到</h1>
          <a href="/" className="button-primary">返回首页</a>
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
