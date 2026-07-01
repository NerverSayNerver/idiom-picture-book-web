import { NextRequest, NextResponse } from 'next/server'
import { decomposeSource } from '@/app/actions/decompose'
import { validateContentInput } from '@/lib/security'
import { validateCategory } from '@/lib/path-security'
import type { ContentCategory } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sourceText, category } = body as { sourceText?: string; category?: string }

    // 验证输入
    if (!sourceText) {
      return NextResponse.json({ error: 'sourceText is required' }, { status: 400 })
    }
    const { valid, error } = validateContentInput(sourceText)
    if (!valid) {
      return NextResponse.json({ error: error || '输入无效' }, { status: 400 })
    }

    // 验证品类
    let safeCategory: ContentCategory
    try {
      safeCategory = validateCategory(category || 'idiom') as ContentCategory
    } catch {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    }

    const result = await decomposeSource(sourceText, safeCategory)
    return NextResponse.json(result)
  } catch (error) {
    console.error('分解内容失败:', error)
    return NextResponse.json({ error: '内容分解失败，请稍后重试' }, { status: 500 })
  }
}
