'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type MotionPreference = 'auto' | 'on' | 'off'

const MOTION_STORAGE_KEY = 'pb-motion-reduced'
const MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function readMotionPreference(): MotionPreference {
  try {
    const stored = window.localStorage.getItem(MOTION_STORAGE_KEY)
    return stored === 'on' || stored === 'off' ? stored : 'auto'
  } catch {
    return 'auto'
  }
}

function saveMotionPreference(pref: MotionPreference) {
  try {
    window.localStorage.setItem(MOTION_STORAGE_KEY, pref)
  } catch {
    // 隐私模式下 localStorage 可能不可用：本次会话内仍生效
  }
}

export function Header() {
  const pathname = usePathname()
  const [motionPreference, setMotionPreference] = useState<MotionPreference>('auto')
  const [systemReduced, setSystemReduced] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOTION_QUERY)
    setSystemReduced(mediaQuery.matches)
    setMotionPreference(readMotionPreference())

    const handleChange = (event: MediaQueryListEvent) => setSystemReduced(event.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const motionReduced =
    motionPreference === 'on' || (motionPreference === 'auto' && systemReduced)

  useEffect(() => {
    // 用户显式选择 > 系统偏好：off 需挂 motion-full 让 @media 降级规则失效，
    // auto 两档都不挂以跟随系统，on 强制降级。
    const root = document.documentElement
    root.classList.remove('motion-reduced', 'motion-full')
    if (motionPreference === 'on') {
      root.classList.add('motion-reduced')
    } else if (motionPreference === 'off') {
      root.classList.add('motion-full')
    }
  }, [motionPreference])

  const handleMotionPreference = (pref: MotionPreference) => {
    setMotionPreference(pref)
    saveMotionPreference(pref)
  }

  const isTasksActive = pathname === '/tasks'

  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <Link href="/" className="text-xl font-bold text-primary shrink-0">
          🎨 绘本工坊
        </Link>

        <div className="flex items-center gap-4">
          <nav className="flex items-center gap-4 text-sm">
            <Link
              href="/tasks"
              aria-current={isTasksActive ? 'page' : undefined}
              className={`transition-colors duration-fast ${
                isTasksActive
                  ? 'text-blue-600 font-medium'
                  : 'text-gray-600 hover:text-primary'
              }`}
            >
              📋 任务中心
            </Link>
          </nav>

          {/* 次级入口：低视觉权重；'auto' 跟随系统，用户点击后持久化 on/off */}
          <div className="flex items-center gap-2 pl-3 border-l border-gray-100">
            <button
              type="button"
              role="switch"
              aria-checked={motionReduced}
              aria-label="减少动效"
              title={motionReduced ? '当前：减少动效' : '当前：完整动效'}
              onClick={() => handleMotionPreference(motionReduced ? 'off' : 'on')}
              className={`flex items-center gap-1 text-xs transition-colors duration-fast ${
                motionReduced ? 'text-gray-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <span aria-hidden="true">🐢</span>
              <span>减少动效</span>
            </button>
            {motionPreference !== 'auto' && (
              <button
                type="button"
                onClick={() => handleMotionPreference('auto')}
                aria-label="动效跟随系统设置"
                title="动效跟随系统设置"
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors duration-fast"
              >
                跟随系统
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
