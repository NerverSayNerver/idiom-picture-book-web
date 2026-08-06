import Link from 'next/link'

// 全局 404 页面：匹配不到任何路由时展示
export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center bg-white rounded-card shadow-md p-8">
        <img
          src="https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Children%27s%20book%20illustration%2C%20a%20cute%20curious%20child%20standing%20in%20front%20of%20an%20empty%20floating%20story%20book%20page%20with%20soft%20question%20marks%20drifting%20around%2C%20peach%20pink%20and%20cream%20pastel%20color%20palette%2C%20soft%20watercolor%20style%2C%20whimsical%20and%20gentle%2C%20no%20text&image_size=portrait_4_3"
          alt="找不到页面"
          className="w-48 h-auto mx-auto rounded-lg mb-4"
          loading="lazy"
        />
        <h1 className="text-5xl font-bold text-primary mb-3">404</h1>
        <p className="text-gray-600 mb-6">这一页好像被翻走了，找不到绘本啦</p>
        <Link href="/" className="button-primary inline-block">
          回到首页
        </Link>
      </div>
    </main>
  )
}
