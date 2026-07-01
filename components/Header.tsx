'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function Header() {
  const pathname = usePathname()

  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-primary">
          🎨 绘本工坊
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link
            href="/tasks"
            className={`transition-colors ${
              pathname === '/tasks'
                ? 'text-blue-600 font-medium'
                : 'text-gray-600 hover:text-primary'
            }`}
          >
            📋 任务中心
          </Link>
        </nav>
      </div>
    </header>
  )
}
