'use client'

import Link from 'next/link'

export function Header() {
  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
<Link href="/" className="text-xl font-bold text-primary">
  🎨 绘本工坊
</Link>
        <nav className="flex gap-4">
          <Link href="/" className="text-gray-600 hover:text-gray-800">
            📚 绘本库
          </Link>
          <Link href="/#create" className="text-gray-600 hover:text-gray-800">
            ✏️ 创建
          </Link>
        </nav>
      </div>
    </header>
  )
}
