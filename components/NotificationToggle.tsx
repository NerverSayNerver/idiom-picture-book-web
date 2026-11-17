'use client'

import { useEffect, useState } from 'react'
import {
  getNotifyEnabled,
  setNotifyEnabled,
  requestNotifyPermission,
  getNotifyPermission,
} from '@/lib/notifications'

/**
 * 任务完成系统通知开关（铃铛按钮）。
 * 开启时请求通知权限；仅当标签页在后台时才会弹系统通知，页面可见时用页内横幅。
 */
export function NotificationToggle() {
  // permission 变化（用户在浏览器设置里改）无法监听，挂载和开关时读取
  const [mounted, setMounted] = useState(false)
  const [enabled, setEnabledState] = useState(false)
  const [permission, setPermission] = useState<'granted' | 'denied' | 'default' | 'unsupported'>('default')

  useEffect(() => {
    setMounted(true)
    setEnabledState(getNotifyEnabled())
    setPermission(getNotifyPermission())
  }, [])

  const handleToggle = async () => {
    if (!enabled) {
      const result = await requestNotifyPermission()
      setPermission(result === 'unsupported' ? 'unsupported' : getNotifyPermission())
      if (result === 'denied') return // 被拒时不落开关状态
      setNotifyEnabled(true)
      setEnabledState(true)
    } else {
      setNotifyEnabled(false)
      setEnabledState(false)
    }
  }

  if (!mounted) {
    // SSR/首帧占位，避免水合不一致
    return <span className="w-7 h-7 inline-block" aria-hidden="true" />
  }

  const unsupported = permission === 'unsupported'
  const denied = permission === 'denied'

  return (
    <button
      onClick={handleToggle}
      disabled={unsupported}
      title={
        unsupported
          ? '当前浏览器不支持系统通知'
          : denied
          ? '通知权限已被浏览器拒绝，请在浏览器设置中允许后重试'
          : enabled
          ? '已开启：生成完成/失败时（标签页在后台）弹系统通知'
          : '开启后，生成完成/失败时（标签页在后台）弹系统通知'
      }
      role="switch"
      aria-checked={enabled}
      aria-label="系统通知"
      className={`px-2 py-1 rounded-full text-sm transition-colors duration-fast ${
        enabled ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
      } ${unsupported ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      {/* key 变化触发重挂载，图标 80ms 淡入；不做铃铛摇晃 */}
      <span
        key={enabled ? 'on' : 'off'}
        aria-hidden="true"
        className="inline-block animate-fade-in duration-instant [animation-duration:80ms]"
      >
        {enabled ? '🔔' : '🔕'}
      </span>
    </button>
  )
}
