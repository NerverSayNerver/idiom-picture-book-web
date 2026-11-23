'use client'

import Illustration from '@/components/Illustration'

// 路由级错误边界：捕获子树渲染/运行时错误，避免整页白屏
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main id="main" tabIndex={-1} className="min-h-screen flex items-center justify-center px-4">
      <div
        role="alert"
        className="max-w-md w-full bg-white rounded-card shadow-card p-8 text-center animate-fade-up"
      >
        <Illustration name="error" className="w-32 h-32 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-800 mb-2">出错了</h2>
        <p className="text-gray-500 text-sm mb-1">页面遇到了一些问题</p>
        {error?.message && (
          <p className="text-gray-400 text-xs mb-6 break-all">{error.message}</p>
        )}
        <button
          onClick={reset}
          className="button-primary"
        >
          重试
        </button>
      </div>
    </main>
  )
}
