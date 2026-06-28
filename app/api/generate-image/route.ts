import { NextRequest, NextResponse } from 'next/server'
import { generateSceneImage } from '@/app/actions/generate'

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json()
    const url = await generateSceneImage(prompt)
    return NextResponse.json({ url })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
