import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Header } from '@/components/Header'

// 字体走系统栈（定义在 tailwind.config.ts），不再用 next/font/google 引 Noto Sans SC。
// 实测：Noto Sans SC 会把中文字形切成上百个 unicode-range 子集，首页命中 36 个 woff2，
// 4G 下传输 1880KB（≈3.8s），比优化后的全部图片（232KB）还大 8 倍，直接卡住首图里程碑。
// 系统栈：iOS/iPad = 苹方、Windows = 微软雅黑、Android = Noto Sans CJK，字节 0，观感不输。
// 取舍：跨端字形不完全一致；若日后要严格统一，应自托管**按本站文案子集化**的单字重字体，
// 而不是回到 next/font/google 的全量 unicode-range。

export const metadata: Metadata = {
  title: '绘本工坊',
  description: '和宝贝一起创建绘本故事',
}

// 不设 maximumScale / userScalable: false —— 允许用户双指缩放（WCAG 1.4.4）
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#faf7f5',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-background font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-white focus:text-[var(--text-ink)] focus:px-4 focus:py-3 focus:rounded-button focus:shadow-modal focus:outline focus:outline-2 focus:outline-[var(--select)]"
        >
          跳到主要内容
        </a>
        <Header />
        {children}
      </body>
    </html>
  )
}
