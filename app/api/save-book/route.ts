import { NextRequest, NextResponse } from 'next/server'
import { saveBook } from '@/lib/save-book'
import type { PictureBook } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const book: PictureBook = await request.json()
    const result = await saveBook(book)
    return NextResponse.json({ success: true, path: result.path })
  } catch (error) {
    console.error('保存绘本失败:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
