import type { Metadata } from 'next'
import './globals.css'
import { Header } from '@/components/Header'

export const metadata: Metadata = {
  title: '成语绘本工坊',
  description: '和宝贝一起创造成语故事',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-background">
        <Header />
        {children}
      </body>
    </html>
  )
}
