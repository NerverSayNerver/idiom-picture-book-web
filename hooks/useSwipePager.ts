'use client'

import { useEffect, useRef } from 'react'

/**
 * 阅读器横向滑动手势（Pointer Events）。
 *
 * 设计要点：
 * 1. 只接管 `pointerType === 'touch'`，鼠标/触控笔完全不受影响（桌面保留箭头 + 键盘）。
 * 2. 拖拽期间**不 setState**，直接写 target 元素的 style（transform / opacity）。
 *    阅读器每次渲染都要重建逐字高亮 span，60fps 的 setState 会把主线程打满。
 * 3. 纵向手势与双指缩放一律交还浏览器（`touch-action: pan-y pinch-zoom`），
 *    保证 WCAG 1.4.4 双指缩放不被禁用。
 * 4. 状态机：idle → armed → dragging → commit / rebound → cooldown(settling)。
 */

export type SwipeDirection = 'next' | 'prev'

export interface SwipePagerOptions {
  /** 被拖动的元素（横向位移 + 透明度直接写在这个节点上） */
  targetRef: React.RefObject<HTMLElement | null>
  /** 关掉手势（例如抽屉/弹窗打开时） */
  enabled?: boolean
  canGoNext: () => boolean
  canGoPrev: () => boolean
  /** 翻页动画中 / 冷却中 → 返回 true，此时不 arm */
  isBlocked: () => boolean
  /** 提交翻页；offset 为松手瞬间的实际位移，供承接动画从当前位置无缝续接 */
  onCommit: (dir: SwipeDirection, offset: number) => void
  /** 拖拽开始/结束（用于自动朗读推进让位） */
  onDragChange?: (dragging: boolean) => void
}

/** 方向锁定阈值 */
const DIR_LOCK_PX = 8
/** 视口左右边缘不 arm，把系统返回手势留给 iOS/Android */
const EDGE_GUARD_PX = 12
/** 跟手位移上限：min(舞台宽 24%, 64px) */
const MAX_FOLLOW_RATIO = 0.24
const MAX_FOLLOW_PX = 64
/** 拖拽期间透明度线性降到 0.72 */
const OPACITY_FLOOR = 0.72
const OPACITY_FULL_RATIO = 0.6
/** 提交阈值：|dx| ≥ 18% 舞台宽，或（速度 > 0.35px/ms 且 |dx| ≥ 24px） */
const COMMIT_RATIO = 0.18
const COMMIT_MIN_PX = 24
const VELOCITY_MIN = 0.35
const VELOCITY_WINDOW_MS = 100
/** 按住超过 1.2s 且位移不足阈值 → 判为"按住看"，不翻页 */
const HOLD_MS = 1200
/** 回弹 220ms / 边界回弹 180ms，无 overshoot */
const REBOUND_MS = 220
const EDGE_REBOUND_MS = 180
/** 边界橡皮筋：dx * 0.28，上限 24px */
const EDGE_RUBBER = 0.28
const EDGE_MAX_PX = 24
/** 冷却，与 BookViewer 的 FLIP_COOLDOWN_MS 对齐 */
const COOLDOWN_MS = 300

const EASE_ENTER = 'cubic-bezier(0.22, 1, 0.36, 1)'

type Phase = 'idle' | 'armed' | 'dragging' | 'settling'

interface SwipeState {
  phase: Phase
  pointerId: number
  startX: number
  startY: number
  startT: number
  rawDx: number
  applied: number
  axis: null | 'x' | 'y'
  dir: SwipeDirection | null
  width: number
  edge: boolean
  samples: Array<{ t: number; x: number }>
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

export function useSwipePager(options: SwipePagerOptions): void {
  // 回调存 ref：避免每次渲染都重挂事件监听
  const optsRef = useRef(options)
  optsRef.current = options
  const targetRef = options.targetRef

  useEffect(() => {
    const el = targetRef.current
    if (!el) return

    const state: SwipeState = {
      phase: 'idle',
      pointerId: -1,
      startX: 0,
      startY: 0,
      startT: 0,
      rawDx: 0,
      applied: 0,
      axis: null,
      dir: null,
      width: 0,
      edge: false,
      samples: [],
    }

    let activePointers = 0
    /** 出现过第二根手指：直到全部抬起都不再 arm，避免双指缩放被误判为横滑 */
    let multiTouch = false
    let settleTimer = 0
    let cooldownUntil = 0

    const clearInline = () => {
      el.style.removeProperty('transform')
      el.style.removeProperty('opacity')
      el.style.removeProperty('transition')
      el.style.removeProperty('will-change')
    }

    const resetState = () => {
      state.phase = 'idle'
      state.pointerId = -1
      state.axis = null
      state.dir = null
      state.rawDx = 0
      state.applied = 0
      state.edge = false
      state.samples = []
    }

    /** ms = 0 → 立刻归位（承接翻页动画）；ms > 0 → 过渡回弹后清掉内联样式 */
    const settle = (ms: number) => {
      if (settleTimer) {
        window.clearTimeout(settleTimer)
        settleTimer = 0
      }
      if (ms <= 0) {
        el.style.transition = 'none'
        el.style.transform = 'translate3d(0,0,0)'
        el.style.opacity = '1'
        // 等一帧让 'none' 生效后再摘掉内联样式，否则下一次拖拽会带着 transition
        requestAnimationFrame(clearInline)
        return
      }
      el.style.transition = `transform ${ms}ms ${EASE_ENTER}, opacity ${ms}ms ${EASE_ENTER}`
      el.style.transform = 'translate3d(0,0,0)'
      el.style.opacity = '1'
      settleTimer = window.setTimeout(() => {
        settleTimer = 0
        clearInline()
      }, ms + 24)
    }

    const endDrag = () => {
      if (state.phase === 'dragging') optsRef.current.onDragChange?.(false)
    }

    /** 取最近 100ms 的平均速度（px/ms，方向与 dx 一致） */
    const velocity = () => {
      const s = state.samples
      if (s.length < 2) return 0
      const first = s[0]
      const last = s[s.length - 1]
      const dt = last.t - first.t
      if (dt <= 0) return 0
      return (last.x - first.x) / dt
    }

    const abort = (reboundMs: number) => {
      endDrag()
      settle(reboundMs)
      cooldownUntil = Date.now() + COOLDOWN_MS
      resetState()
    }

    const onPointerDown = (e: PointerEvent) => {
      // 只统计 touch：鼠标/笔的 pointer 计数会把后续触摸误判成多指
      if (e.pointerType !== 'touch') return
      activePointers += 1
      const o = optsRef.current

      if (!e.isPrimary || multiTouch || activePointers > 1) {
        multiTouch = true
        // 已经开始的单指拖拽立刻回弹，交给浏览器做缩放
        if (state.phase === 'dragging' || state.phase === 'armed') abort(REBOUND_MS)
        return
      }
      if (o.enabled === false) return
      if (o.isBlocked()) return
      if (Date.now() < cooldownUntil) return
      // 边缘 12px：让系统返回手势
      if (e.clientX <= EDGE_GUARD_PX || e.clientX >= window.innerWidth - EDGE_GUARD_PX) return

      const rect = el.getBoundingClientRect()
      state.phase = 'armed'
      state.pointerId = e.pointerId
      state.startX = e.clientX
      state.startY = e.clientY
      state.startT = performance.now()
      state.rawDx = 0
      state.applied = 0
      state.axis = null
      state.dir = null
      state.edge = false
      state.width = rect.width || window.innerWidth
      state.samples = [{ t: state.startT, x: e.clientX }]
    }

    const onPointerMove = (e: PointerEvent) => {
      if (state.phase !== 'armed' && state.phase !== 'dragging') return
      if (e.pointerId !== state.pointerId) return
      const o = optsRef.current

      if (multiTouch) {
        abort(REBOUND_MS)
        return
      }

      const now = performance.now()
      const dx = e.clientX - state.startX
      const dy = e.clientY - state.startY

      if (state.axis === null) {
        if (Math.abs(dx) < DIR_LOCK_PX && Math.abs(dy) < DIR_LOCK_PX) return
        if (Math.abs(dx) > Math.abs(dy) * 1.2) {
          state.axis = 'x'
          state.phase = 'dragging'
          try {
            el.setPointerCapture(e.pointerId)
          } catch {
            // 某些浏览器在 pointer 已失效时抛错，忽略即可
          }
          el.style.willChange = 'transform, opacity'
          o.onDragChange?.(true)
        } else {
          // 纵向：交还浏览器滚动，后续 move 一律不处理
          state.axis = 'y'
          state.phase = 'idle'
          return
        }
      }
      if (state.axis !== 'x') return

      // 横向已锁定：阻止浏览器横向 pan（touch-action 已声明 pan-y，这里只是兜底）
      e.preventDefault()

      state.rawDx = dx
      const dir: SwipeDirection = dx < 0 ? 'next' : 'prev'
      state.dir = dir
      const allowed = dir === 'next' ? o.canGoNext() : o.canGoPrev()
      state.edge = !allowed

      // 视觉跟手有硬上限；判定阈值仍用真实手指位移 rawDx（否则 375 宽下永远够不到 18%）
      const maxFollow = Math.min(state.width * MAX_FOLLOW_RATIO, MAX_FOLLOW_PX)
      state.applied = state.edge
        ? clamp(dx * EDGE_RUBBER, -EDGE_MAX_PX, EDGE_MAX_PX)
        : clamp(dx, -maxFollow, maxFollow)

      const ratio = Math.min(Math.abs(dx) / (state.width * OPACITY_FULL_RATIO || 1), 1)
      const opacity = 1 - (1 - OPACITY_FLOOR) * ratio

      el.style.transition = 'none'
      el.style.transform = `translate3d(${state.applied.toFixed(2)}px,0,0)`
      el.style.opacity = opacity.toFixed(3)

      state.samples.push({ t: now, x: e.clientX })
      while (state.samples.length > 2 && now - state.samples[0].t > VELOCITY_WINDOW_MS) {
        state.samples.shift()
      }
    }

    const finishDrag = () => {
      const o = optsRef.current
      const now = performance.now()
      const dist = Math.abs(state.rawDx)
      const threshold = state.width * COMMIT_RATIO
      const held = now - state.startT
      const v = velocity()
      const fastEnough = Math.abs(v) > VELOCITY_MIN && dist >= COMMIT_MIN_PX
      const farEnough = dist >= threshold
      const tooSlowHold = held > HOLD_MS && !farEnough
      const dir = state.dir
      const allowed = dir ? (dir === 'next' ? o.canGoNext() : o.canGoPrev()) : false

      if (dir && allowed && !state.edge && !tooSlowHold && (farEnough || fastEnough)) {
        const offset = state.applied
        endDrag()
        // 立即归位：旧页快照会从 offset 处接着滑出，视觉连续
        settle(0)
        cooldownUntil = Date.now() + COOLDOWN_MS
        resetState()
        o.onCommit(dir, offset)
        return
      }

      abort(state.edge ? EDGE_REBOUND_MS : REBOUND_MS)
    }

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') activePointers = Math.max(0, activePointers - 1)
      if (activePointers === 0) multiTouch = false

      if (e.pointerId !== state.pointerId) {
        // armed 但没进入 dragging：直接复位，保留 click
        if (state.phase === 'armed') resetState()
        return
      }
      if (state.phase === 'dragging') {
        finishDrag()
      } else if (state.phase === 'armed') {
        resetState()
      }
    }

    const onPointerCancel = (e: PointerEvent) => {
      if (e.pointerType === 'touch') activePointers = Math.max(0, activePointers - 1)
      if (activePointers === 0) multiTouch = false
      if (e.pointerId !== state.pointerId) return
      if (state.phase === 'dragging') {
        endDrag()
        settle(state.edge ? EDGE_REBOUND_MS : REBOUND_MS)
        cooldownUntil = Date.now() + COOLDOWN_MS
      }
      resetState()
    }

    // pointermove 必须非 passive，否则 preventDefault 无效
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove, { passive: false })
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerCancel)

    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerCancel)
      if (settleTimer) window.clearTimeout(settleTimer)
      endDrag()
      clearInline()
    }
  }, [targetRef])
}
