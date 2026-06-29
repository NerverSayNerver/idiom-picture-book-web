// middleware.ts — API 路由鉴权中间件
// 部署到公网前务必设置 INTERNAL_API_KEY 环境变量
import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 只保护 /api/ 路由
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // 开发环境未设置 API Key 时跳过鉴权
  const apiKey = process.env.INTERNAL_API_KEY
  if (!apiKey) {
    return NextResponse.next()
  }

  // 校验请求头中的 API Key
  const providedKey = request.headers.get('x-internal-key')
  if (providedKey === apiKey) {
    return NextResponse.next()
  }

  return NextResponse.json(
    { error: 'Unauthorized' },
    { status: 401 }
  )
}

export const config = {
  matcher: '/api/:path*',
}
