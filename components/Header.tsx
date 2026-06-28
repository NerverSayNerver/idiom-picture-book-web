'use client'

import Link from 'next/link'

export function Header() {
  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <Link href="/" className="text-xl font-bold text-primary">
          🎨 绘本工坊
        </Link>
      </div>
    </header>
  )
}
