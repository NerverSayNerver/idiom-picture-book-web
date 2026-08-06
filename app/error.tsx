'use client'

// 路由级错误边界：捕获子树渲染/运行时错误，避免整页白屏
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-card shadow-md p-8 text-center">
        <img
          src="https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Children%27s%20book%20illustration%2C%20a%20cute%20confused%20owl%20with%20head%20tilted%20looking%20puzzled%2C%20small%20floating%20sparks%20around%2C%20peach%20pink%20and%20cream%20pastel%20color%20palette%2C%20soft%20watercolor%20style%2C%20minimal%20and%20clean%2C%20no%20text&image_size=square"
          alt="出错了"
          className="w-32 h-32 mx-auto rounded-full mb-4 object-cover"
          loading="lazy"
        />
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
