import type { Metadata, Viewport } from 'next'
import { Noto_Sans_SC } from 'next/font/google'
import './globals.css'
import { Header } from '@/components/Header'

const notoSansSC = Noto_Sans_SC({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-noto-sans-sc',
})

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
    <html lang="zh-CN" className={notoSansSC.variable}>
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
