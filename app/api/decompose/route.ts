import { NextRequest, NextResponse } from 'next/server'
import { decomposeSource } from '@/app/actions/decompose'
import type { ContentCategory } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const { sourceText, category } = await request.json()
    const result = await decomposeSource(sourceText, (category || 'idiom') as ContentCategory)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
