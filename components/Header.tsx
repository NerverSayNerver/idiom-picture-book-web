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
    // sticky + 半透明毛玻璃：52px 固定高度，移动端不挤压内容
    <header className="sticky top-0 z-30 h-[52px] bg-white/[.92] backdrop-blur border-b border-[var(--hairline)]">
      <div className="max-w-7xl mx-auto h-full px-3 sm:px-4 flex items-center gap-2 sm:gap-4">
        {/* Logo：emoji 与文字分开，truncate 不会把 emoji 吃掉 */}
        <Link
          href="/"
          aria-label="绘本工坊首页"
          className="flex items-center gap-1.5 min-w-0 shrink text-lg font-bold text-[var(--brand-strong)] rounded-inner focus-ring"
        >
          <span aria-hidden="true" className="shrink-0">🎨</span>
          <span className="min-w-0 truncate">绘本工坊</span>
        </Link>

        {/* 中部留白用 flex-1，避免 justify-between 把右侧可压缩项挤出屏幕 */}
        <div className="flex-1 min-w-0" aria-hidden="true" />

        <nav aria-label="主导航" className="flex items-center shrink-0">
          <Link
            href="/tasks"
            aria-label="任务中心"
            aria-current={isTasksActive ? 'page' : undefined}
            className={`flex items-center justify-center h-11 w-11 sm:w-auto sm:px-3.5 rounded-full text-sm font-medium transition-colors duration-fast focus-ring ${
              isTasksActive
                ? 'bg-primary/25 text-[var(--brand-strong)]'
                : 'text-[var(--text-body)] hover:bg-ink/[.04]'
            }`}
          >
            <span aria-hidden="true">📋</span>
            {/* <640：只留图标（44×44 热区）；sm 起显示文案 */}
            <span className="hidden sm:inline sm:ml-1.5">任务中心</span>
          </Link>
        </nav>

        {/* 次级入口：低视觉权重；'auto' 跟随系统，用户点击后持久化 on/off */}
        <div className="flex items-center gap-0.5 sm:gap-2 pl-1 sm:pl-3 border-l border-[var(--hairline)] shrink-0">
          <button
            type="button"
            role="switch"
            aria-checked={motionReduced}
            aria-label="减少动效"
            title={motionReduced ? '当前：减少动效' : '当前：完整动效'}
            onClick={() => handleMotionPreference(motionReduced ? 'off' : 'on')}
            className={`relative flex items-center justify-center h-11 w-11 sm:w-auto sm:px-2 sm:gap-1 rounded-full text-xs transition-colors duration-fast focus-ring ${
              motionReduced
                ? 'text-[var(--brand-strong)]'
                : 'text-[var(--text-muted)] hover:bg-ink/[.04] hover:text-[var(--text-body)]'
            }`}
          >
            <span aria-hidden="true" className="text-sm sm:text-xs">🐢</span>
            <span className="hidden sm:inline">减少动效</span>
            {/* 开启降级时的强调：底部 3px 点状指示（不只靠颜色区分） */}
            {motionReduced && (
              <span
                aria-hidden="true"
                className="absolute bottom-1 left-1/2 -translate-x-1/2 w-5 border-b-[3px] border-dotted border-current"
              />
            )}
          </button>
          {motionPreference !== 'auto' && (
            <button
              type="button"
              onClick={() => handleMotionPreference('auto')}
              aria-label="动效跟随系统设置"
              title="动效跟随系统设置"
              className="h-11 px-1.5 sm:px-2 text-[11px] text-[var(--text-muted)] hover:text-[var(--brand-strong)] transition-colors duration-fast rounded-full focus-ring"
            >
              跟随系统
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
