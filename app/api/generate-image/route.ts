import { NextRequest, NextResponse } from 'next/server'
import { generateSceneImage } from '@/app/actions/generate'

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json()
    const url = await generateSceneImage(prompt)
    return NextResponse.json({ url })
  } catch (error) {
    console.error('生成图片失败:', error)
    return NextResponse.json({ error: '图片生成失败，请稍后重试' }, { status: 500 })
  }
}
