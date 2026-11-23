import Illustration from '@/components/Illustration'
import Link from 'next/link'

// 全局 404 页面：匹配不到任何路由时展示
export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center bg-white rounded-card shadow-card p-8 animate-fade-up">
        <Illustration name="not-found" className="w-48 h-auto mx-auto mb-4" />
        <h1 className="text-5xl font-bold text-[var(--brand-strong)] mb-3">404</h1>
        <p className="text-gray-600 mb-6">这一页好像被翻走了，找不到绘本啦</p>
        <Link href="/" className="button-primary inline-block">
          回到首页
        </Link>
      </div>
    </main>
  )
}
