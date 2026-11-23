'use client'

import { useState, useEffect, useRef, useCallback, useId } from 'react'
import type { ReactNode } from 'react'

/**
 * 通用弹窗（从 TaskCard 内部原样抽出，行为完全一致）：
 * - 进入 animate-modal-in / 退出 160ms 淡出后卸载
 * - ESC / 遮罩 / ✕ 三种关闭，遮罩退出期间 pointer-events-none 防重复触发
 * - body 滚动锁 + 打开时聚焦关闭按钮 + 关闭时焦点归还触发元素
 * - Tab 焦点陷阱（首尾循环，焦点逃出容器时拉回）
 */
export interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  panelClassName: string
  /** true：无头部，标题置于内容下方（图片弹窗），关闭按钮浮于右上角 */
  titleInFooter?: boolean
  /**
   * false 时屏蔽 ESC / 遮罩 / ✕（默认 true）。
   * 用于不可恢复操作执行中（如删除绘本请求在途），避免"界面关了但操作删了一半"。
   */
  dismissible?: boolean
}

export default function Modal({ title, onClose, children, panelClassName, titleInFooter = false, dismissible = true }: ModalProps) {
  const headingId = `modal-title-${useId()}`
  const [isClosing, setIsClosing] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const closingRef = useRef(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 退出：置 isClosing → 160ms 后真正卸载；closingRef 防重复，closeTimerRef 供 unmount 清理
  const requestClose = useCallback(() => {
    if (!dismissible) return
    if (closingRef.current) return
    closingRef.current = true
    setIsClosing(true)
    closeTimerRef.current = setTimeout(onClose, 160)
  }, [onClose, dismissible])

  // 打开：锁 body 滚动 + 聚焦关闭按钮；关闭：恢复滚动 + 归还焦点给触发元素
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()
    return () => {
      // 卸载时清除尚未触发的关闭定时器，避免组件已销毁仍调用 onClose
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
      document.body.style.overflow = prevOverflow
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus()
      }
    }
  }, [])

  // ESC 关闭 + Tab 焦点陷阱（焦点在首/尾元素间循环）
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isClosing) return
      if (event.key === 'Escape') {
        if (!dismissible) return
        event.preventDefault()
        requestClose()
        return
      }
      if (event.key !== 'Tab') return
      const root = dialogRef.current
      if (!root) return
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      )
      if (focusables.length === 0) {
        event.preventDefault()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      if (event.shiftKey) {
        if (active === first || !root.contains(active)) {
          event.preventDefault()
          last.focus()
        }
      } else if (active === last || !root.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isClosing, requestClose, dismissible])

  const closeButton = (
    <button
      ref={closeButtonRef}
      type="button"
      aria-label="关闭弹窗"
      // 用 aria-disabled 而非 disabled：保持可聚焦，初始焦点与 Tab 陷阱不失效；点击由 requestClose 拦截
      aria-disabled={dismissible ? undefined : true}
      title={dismissible ? undefined : '操作进行中，暂时无法关闭'}
      onClick={requestClose}
      className={`${titleInFooter
        ? 'absolute top-2 right-2 z-10 w-8 h-8 flex items-center justify-center bg-black/40 hover:bg-black/60 text-white rounded-full text-lg transition-colors duration-fast focus-ring hit-44'
        : 'w-8 h-8 flex items-center justify-center bg-ink/[.06] hover:bg-ink/[.12] text-ink-body rounded-full text-lg transition-colors duration-fast focus-ring hit-44'}${dismissible ? '' : ' opacity-40 cursor-not-allowed hover:bg-transparent'}`}
    >
      ✕
    </button>
  )

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${isClosing ? 'pointer-events-none' : ''}`}>
      {/* 遮罩：进入 animate-fade-in；退出淡出且整层 pointer-events-none 防重复触发 */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm ${isClosing ? 'opacity-0 transition-opacity duration-fast' : 'animate-fade-in'}`}
        onClick={requestClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onClick={(e) => e.stopPropagation()}
        className={`modal-in relative z-10 ${isClosing ? 'opacity-0 transition-opacity duration-fast' : 'animate-modal-in'} ${panelClassName}`}
      >
        {/* 面板的圆角/阴影由调用方通过 panelClassName 传入（rounded-card / shadow-modal），此处不硬编码 */}
        {!titleInFooter && (
          <div className="sticky top-0 bg-white border-b border-ink-line px-6 py-4 flex items-center justify-between">
            <h3 id={headingId} className="text-lg font-bold text-ink">{title}</h3>
            {closeButton}
          </div>
        )}
        {titleInFooter && closeButton}
        {children}
        {titleInFooter && (
          <div id={headingId} className="px-4 py-2 bg-white border-t border-ink-line text-sm text-ink-mute text-center">
            {title}
          </div>
        )}
      </div>
    </div>
  )
}
