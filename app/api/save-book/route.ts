import { NextRequest, NextResponse } from 'next/server'
import { saveBook } from '@/lib/save-book'
import { validateCategory } from '@/lib/path-security'
import type { PictureBook } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // 基本字段验证
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: '无效的请求体' }, { status: 400 })
    }

    const book = body as PictureBook

    if (!book.sourceText || typeof book.sourceText !== 'string') {
      return NextResponse.json({ success: false, error: 'sourceText is required' }, { status: 400 })
    }

    if (book.sourceText.length > 200) {
      return NextResponse.json({ success: false, error: 'sourceText 过长' }, { status: 400 })
    }

    // 验证品类
    try {
      validateCategory(book.category || 'idiom')
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid category' }, { status: 400 })
    }

    // 验证 scenes 数组
    if (!Array.isArray(book.scenes) || book.scenes.length === 0) {
      return NextResponse.json({ success: false, error: 'scenes 不能为空' }, { status: 400 })
    }

    if (book.scenes.length > 50) {
      return NextResponse.json({ success: false, error: 'scenes 数量不能超过 50' }, { status: 400 })
    }

    const result = await saveBook(book)
    return NextResponse.json({ success: true, path: result.path })
  } catch (error) {
    console.error('保存绘本失败:', error)
    return NextResponse.json({ success: false, error: '保存失败，请稍后重试' }, { status: 500 })
  }
}
