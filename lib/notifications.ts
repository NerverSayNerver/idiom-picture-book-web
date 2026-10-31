// lib/notifications.ts
// 任务完成系统通知：标签页在后台时，用 Notification API 提醒生成结果
// 页面可见时已有 TaskQueue 页内横幅，此处只补"后台标签页"场景，避免打扰

import type { Task } from './task-types'

export const NOTIFY_ENABLED_KEY = 'pb-notify-enabled'

/** 活跃状态集合：从这些状态流转到 completed/failed 时触发通知 */
const ACTIVE_STATUSES = new Set(['pending', 'running', 'paused'])

// 模块级状态：同一页面多个 useJobs 实例共享，避免重复通知
const lastStatuses = new Map<string, string>()
let initialized = false

function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function getNotifyEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(NOTIFY_ENABLED_KEY) === '1'
  } catch {
    return false
  }
}

export function setNotifyEnabled(enabled: boolean): void {
  try {
    if (enabled) {
      window.localStorage.setItem(NOTIFY_ENABLED_KEY, '1')
    } else {
      window.localStorage.removeItem(NOTIFY_ENABLED_KEY)
    }
  } catch {
    // 隐私模式下 localStorage 不可用，忽略
  }
}

/**
 * 请求通知权限。返回权限结果：
 * - 'granted'：已授权，通知可用
 * - 'denied'：用户/浏览器拒绝，UI 应提示去浏览器设置开启
 * - 'unsupported'：当前环境不支持 Notification API
 */
export async function requestNotifyPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  try {
    const result = await Notification.requestPermission()
    return result === 'granted' ? 'granted' : 'denied'
  } catch {
    return 'denied'
  }
}

export function getNotifyPermission(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (!notificationsSupported()) return 'unsupported'
  return Notification.permission
}

function fireNotification(title: string, body: string): void {
  try {
    const notification = new Notification(title, { body, icon: '/icon.svg' })
    // 点击通知聚焦页面
    notification.onclick = () => {
      window.focus()
      notification.close()
    }
  } catch {
    // 部分环境（如移动端浏览器）构造 Notification 可能抛错，忽略
  }
}

/**
 * 在 useJobs 轮询数据更新时调用：检测任务从活跃流转到完成/失败，
 * 且页面处于后台时弹系统通知。首次加载不通知（避免恢复页面时轰炸）。
 */
export function trackJobNotifications(jobs: Task[]): void {
  if (typeof window === 'undefined') return

  const enabled = getNotifyEnabled()
  const canNotify =
    enabled && notificationsSupported() && Notification.permission === 'granted'

  // 始终维护状态快照，即使通知未开启（中途开启也不会误报历史任务）
  if (!initialized) {
    initialized = true
    for (const job of jobs) lastStatuses.set(job.id, job.status)
    return
  }

  if (!canNotify || document.visibilityState === 'visible') {
    for (const job of jobs) lastStatuses.set(job.id, job.status)
    return
  }

  for (const job of jobs) {
    const prev = lastStatuses.get(job.id)
    lastStatuses.set(job.id, job.status)
    if (!prev || prev === job.status) continue
    if (!ACTIVE_STATUSES.has(prev)) continue
    if (job.status === 'completed') {
      fireNotification('🎉 绘本生成完成', `《${job.sourceText}》已生成，去书架看看吧！`)
    } else if (job.status === 'failed') {
      fireNotification('❌ 绘本生成失败', `《${job.sourceText}》生成失败，可到任务中心重试。`)
    }
  }
}
