import { NextRequest, NextResponse } from 'next/server'
import { generateSceneImage } from '@/app/actions/generate'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { prompt } = body as { prompt?: string }

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
    }

    if (prompt.length > 2000) {
      return NextResponse.json({ error: 'prompt 长度不能超过 2000 个字符' }, { status: 400 })
    }

    const url = await generateSceneImage(prompt)
    return NextResponse.json({ url })
  } catch (error) {
    console.error('生成图片失败:', error)
    return NextResponse.json({ error: '图片生成失败，请稍后重试' }, { status: 500 })
  }
}
