'use client'

/**
 * 邻页预取（P1 `+1` / P2 `-1` / P3 `+2`）
 *
 * 分工（这条边界是整套设计的核心，改动前先读完）：
 * - **P0（屏幕上这一页）不由本 hook 负责**：它永远是 DOM 里的 `<img>`，
 *   带 `loading="eager"` + `fetchPriority=high`，浏览器自己管优先级与取消。
 * - 本 hook 只做**用户看不见的那几张**，因此有两条不对称规则：
 *   1. **预取不重试**。为看不见的工作重试是纯流量泄漏；用户翻到该页时自然进入 P0 路径，
 *      自动获得可见的重试策略 —— 「看不见的工作不重试，看得见的工作重试」。
 *   2. **P0 在飞时并发降为 1**。HTTP/2 下多流近似均分带宽，预取和当前页抢带宽会直接
 *      把首图从 220ms 拖到 440ms，击穿移动端 slide 的 240ms 遮蔽窗口。
 *
 * URL 产地：`pages[].url` 必须由 `lib/image-tiers.ts` 产出，且**与渲染 URL 逐字节相同**。
 * 本模块不拼路径、不改 query、不加 `crossOrigin`（多一种请求形态 = 多一份缓存条目 = 双倍下载）。
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'

export type PageQuality = 'full' | 'reduced' | 'minimal'

export interface PrefetchPageEntry {
  /** 页号与 BookViewer 的 currentPage 同一套编号：0 = 封面，1..N = 场景 */
  page: number
  /** 与 `<img src>` 完全一致的 URL；空串表示该页没有图片 */
  url: string
}

export interface UsePagePrefetchOptions {
  /** 预先算好的页 → URL 表（只含走网络路径的图片；`imageBlob` 的 objectURL 不参与档位与预取） */
  pages: readonly PrefetchPageEntry[]
  currentPage: number
  totalPages: number
  /** 会话质量档（挂载时判定一次，本次阅读只降不升） */
  quality: PageQuality
  /**
   * 硬闸门：PDF 导出中（`pdfBusyRef`）/ 抽屉与视频面板打开（`dialogOpenRef`）。
   * 置真时立刻 abort 全部在飞预取 —— 否则弱网下导出会退化成「PDF 导出失败」。
   * `visibilitychange → hidden` 由本 hook 自己监听，调用方不用管。
   */
  paused?: boolean
  /** 快扫模式（2s 内 ≥3 次落定）：窗口收为 `{+1}`、并发 1、不发 P3 */
  skimMode?: boolean
  /** 某页预取解码成功（可用于埋点/度量；不要在里面 setState 触发整树重渲染） */
  onDecoded?: (page: number) => void
}

export interface PrefetchStats {
  /** 发起过的预取请求数 */
  requested: number
  /** decode 成功的页数 */
  decoded: number
  /** 被抢占/卸载取消的请求数 */
  aborted: number
  /** B0：翻页时目标页已在内存 */
  hits: number
  /** B1：翻页时目标页未在内存（走占位路径） */
  misses: number
}

export interface UsePagePrefetchResult {
  /** 目标页是否已在内存 → 翻页时 B0/B1 的判据 */
  isDecoded: (page: number) => boolean
  /** 该页最近一次失败时间（10s 内不重复请求） */
  failedAt: (page: number) => number | null
  /** 页内 `<img>` 的 `onLoad` / `onError` 上报（`page` 用同一套页号） */
  reportSettled: (page: number, ok: boolean) => void
  /** 失败态「重试」按钮：清掉失败记录并重算窗口 */
  notifyRetry: (page: number) => void
  /** 每次都翻页记一笔，用于度量 B0 命中率（指标 3：≥80%） */
  noteFlip: (page: number, hit: boolean) => void
  stats: () => PrefetchStats
}

/** 落定后多久重算窗口：介于 duration-fast(150) 与 duration-normal(240) 之间 */
export const PREFETCH_SETTLE_DELAY_MS = 200
/** 挂载后多久强制发第一路：兜住「命中缓存秒开、永不触发 settled」与「当前页已失败」两种边界 */
export const PREFETCH_BOOTSTRAP_MS = 1500
/** 单次预取超时 */
export const PREFETCH_TIMEOUT_MS = 6000
/** 省流模式（saveData）下更想尽快知道结果，而不是悄悄替用户耗流量 */
export const PREFETCH_TIMEOUT_SAVEDATA_MS = 3000
/** 失败后的静默窗口：防止 resize / visibilitychange / connection change 把同一个失败 URL 反复打 */
export const PREFETCH_FAIL_COOLDOWN_MS = 10_000
/** 空闲窗口（P3 用） */
export const PREFETCH_IDLE_TIMEOUT_MS = 1000
/**
 * Safari（含 iOS 全部版本）没有 `requestIdleCallback`，而 iOS 是主力端：
 * 没有这条回退，`+2` 在 iPhone / iPad 上永远不发。
 */
export const PREFETCH_IDLE_FALLBACK_MS = 600

interface Inflight {
  img: HTMLImageElement
  timer: number
  page: number
}

interface IdleHandle {
  kind: 'ric' | 'timeout'
  id: number
}

function saveDataEnabled(): boolean {
  if (typeof navigator === 'undefined') return false
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  return conn?.saveData === true
}

export function usePagePrefetch(options: UsePagePrefetchOptions): UsePagePrefetchResult {
  const { pages, currentPage, totalPages, quality, paused = false, skimMode = false, onDecoded } = options

  /**
   * 最新参数快照。`pump` / `schedulePump` 因此可以保持稳定引用，
   * 不会被 `pages` 数组的每次 useMemo 重建打断定时器链。
   */
  const optRef = useRef({ pages, currentPage, totalPages, quality, paused, skimMode })
  optRef.current = { pages, currentPage, totalPages, quality, paused, skimMode }
  const onDecodedRef = useRef(onDecoded)
  onDecodedRef.current = onDecoded

  /** 保活用：解码后的 img 元素必须一直有引用，位图才不会被回收 */
  const decodedRef = useRef(new Map<number, HTMLImageElement>())
  /** 无占位即可上屏（预取 decode 成功 或 DOM 已 load） */
  const readyRef = useRef(new Set<number>())
  const failedRef = useRef(new Map<number, number>())
  const inflightRef = useRef(new Map<number, Inflight>())
  const statsRef = useRef<PrefetchStats>({ requested: 0, decoded: 0, aborted: 0, hits: 0, misses: 0 })

  const pumpRef = useRef<() => void>(() => {})
  const pumpTimerRef = useRef<number | null>(null)
  const idleRef = useRef<IdleHandle | null>(null)
  const forceTimerRef = useRef<number | null>(null)
  /** 已过 bootstrap 窗口：P0 未落定也允许发 P1（此时并发仍是 1） */
  const forceRef = useRef(false)
  const mountedRef = useRef(true)

  const cancelIdle = useCallback(() => {
    const handle = idleRef.current
    idleRef.current = null
    if (!handle) return
    if (handle.kind === 'ric') {
      const cancel = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback
      cancel?.(handle.id)
    } else {
      window.clearTimeout(handle.id)
    }
  }, [])

  /** 取消一路在飞预取：`HTMLImageElement` 没有 AbortController，清 src 是唯一手段 */
  const abortPrefetch = useCallback((page: number) => {
    const entry = inflightRef.current.get(page)
    if (!entry) return
    inflightRef.current.delete(page)
    window.clearTimeout(entry.timer)
    entry.img.onload = null
    entry.img.onerror = null
    entry.img.src = ''
    statsRef.current.aborted += 1
  }, [])

  const schedulePump = useCallback((delay: number) => {
    if (!mountedRef.current || typeof window === 'undefined') return
    if (pumpTimerRef.current !== null) window.clearTimeout(pumpTimerRef.current)
    pumpTimerRef.current = window.setTimeout(() => {
      pumpTimerRef.current = null
      pumpRef.current()
    }, delay)
  }, [])

  const settlePrefetch = useCallback(
    (page: number, ok: boolean) => {
      const entry = inflightRef.current.get(page)
      if (!entry) return
      inflightRef.current.delete(page)
      window.clearTimeout(entry.timer)
      entry.img.onload = null
      entry.img.onerror = null
      if (ok) {
        decodedRef.current.set(page, entry.img)
        readyRef.current.add(page)
        statsRef.current.decoded += 1
        onDecodedRef.current?.(page)
      } else {
        // 不重试：只记时间戳，翻到该页时由 P0 路径重新发起
        entry.img.src = ''
        failedRef.current.set(page, Date.now())
      }
      schedulePump(0)
    },
    [schedulePump],
  )

  const startPrefetch = useCallback(
    (page: number, url: string) => {
      const img = new Image()
      img.decoding = 'async'
      const timeout = saveDataEnabled() ? PREFETCH_TIMEOUT_SAVEDATA_MS : PREFETCH_TIMEOUT_MS
      const timer = window.setTimeout(() => settlePrefetch(page, false), timeout)
      inflightRef.current.set(page, { img, timer, page })
      statsRef.current.requested += 1
      img.onload = () => {
        // `decode()` reject 不算失败：字节已经进了缓存，换 DOM `<img>` 渲染仍然可用（Safari 差异）
        const done = () => settlePrefetch(page, true)
        if (typeof img.decode === 'function') img.decode().then(done, done)
        else done()
      }
      img.onerror = () => settlePrefetch(page, false)
      img.src = url
    },
    [settlePrefetch],
  )

  /**
   * 窗口重算。判定顺序照 `docs/superpowers/specs/2026-11-23-loading-ux-spec.md` §3.4：
   * 先闸门（质量/暂停/可见性）→ 再触发时机（P0 是否落定 / bootstrap）→ 再窗口 → 再并发。
   */
  const pump = useCallback(() => {
    if (!mountedRef.current || typeof window === 'undefined') return
    const { pages: pageList, currentPage: cur, totalPages: total, quality: q, paused: isPaused, skimMode: skim } = optRef.current

    /** 除 P0 外零请求的三种情况 */
    const quiet = q === 'minimal' || isPaused || document.visibilityState === 'hidden'
    if (quiet) {
      for (const page of [...inflightRef.current.keys()]) abortPrefetch(page)
      cancelIdle()
      return
    }

    const concurrency = q === 'reduced' ? 1 : 2
    /**
     * P0 判定：封面页（0）的"当前页内容"是缩略图墙，交给浏览器原生 lazy，不等它 settled；
     * 场景页则必须等自己的 `<img>` load/error 之后才允许发预取。
     */
    const p0Ready = cur === 0 || readyRef.current.has(cur)
    if (!p0Ready && !forceRef.current) return
    /** 当前页在飞时并发降为 1 —— 预取不许和用户眼睁睁等的那张图抢带宽 */
    const limit = p0Ready ? concurrency : 1

    // ── 窗口：前向优先（`+1` 是唯一必做项）──────────────
    const urgent: number[] = []
    const idleOnly: number[] = []
    const inWindow = new Set<number>()
    const push = (page: number, idle = false) => {
      if (page < 1 || page > total - 1) return // 0 = 封面、末页 = 含义页，都没有单张插图
      if (page === cur) return
      if (inWindow.has(page)) return
      inWindow.add(page)
      if (idle) idleOnly.push(page)
      else urgent.push(page)
    }
    if (cur === 0) {
      // 封面：只预取第 1 页的阅读档。用户可能点任意一格跳走，猜第 2 页之后就是纯浪费
      push(1)
    } else if (skim) {
      push(cur + 1)
    } else if (q === 'reduced') {
      // 弱网严格串行：先 `+1` 再 `-1`，永不发 `+2`
      push(cur + 1)
      push(cur - 1)
    } else {
      push(cur + 1)
      push(cur - 1)
      push(cur + 2, true)
    }

    /**
     * 抢占：窗口外的在飞预取 abort。
     * `page === cur` 必须放行 —— 它刚从 P1 升为 P0，正在下载的就是屏幕上要的那张，
     * abort 等于白扔已经下了一半的字节。
     */
    for (const page of [...inflightRef.current.keys()]) {
      if (page === cur) continue
      if (!inWindow.has(page)) abortPrefetch(page)
    }

    const now = Date.now()
    const pick = (page: number): PrefetchPageEntry | null => {
      if (page === cur) return null
      if (inflightRef.current.has(page)) return null
      if (readyRef.current.has(page)) return null
      const failedAt = failedRef.current.get(page)
      if (failedAt !== undefined && now - failedAt < PREFETCH_FAIL_COOLDOWN_MS) return null
      const entry = pageList.find((item) => item.page === page)
      if (!entry || !entry.url) return null
      return entry
    }

    let active = inflightRef.current.size
    const startIfPossible = (page: number): boolean => {
      if (active >= limit) return false
      const entry = pick(page)
      if (!entry) return false
      startPrefetch(page, entry.url)
      active += 1
      return true
    }

    for (const page of urgent) startIfPossible(page)

    // ── P3（`+2`）：只在浏览器空闲时发 ──────────────────
    if (idleOnly.length > 0 && active < limit) {
      cancelIdle()
      const run = () => {
        idleRef.current = null
        if (!mountedRef.current) return
        const snapshot = optRef.current
        // 空闲回调是异步的：这期间可能已经翻页/暂停/降档，重新过一遍闸门
        if (snapshot.paused || snapshot.quality !== 'full' || snapshot.skimMode) return
        if (snapshot.currentPage !== cur) return
        for (const page of idleOnly) startIfPossible(page)
      }
      const ric = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
        .requestIdleCallback
      if (typeof ric === 'function') idleRef.current = { kind: 'ric', id: ric(run, { timeout: PREFETCH_IDLE_TIMEOUT_MS }) }
      else idleRef.current = { kind: 'timeout', id: window.setTimeout(run, PREFETCH_IDLE_FALLBACK_MS) }
    }
  }, [abortPrefetch, cancelIdle, startPrefetch])

  useEffect(() => {
    pumpRef.current = pump
  }, [pump])

  // 卸载 / 路由离开：abort 全部在飞 + 清所有定时器
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      for (const page of [...inflightRef.current.keys()]) abortPrefetch(page)
      if (pumpTimerRef.current !== null) window.clearTimeout(pumpTimerRef.current)
      pumpTimerRef.current = null
      if (forceTimerRef.current !== null) window.clearTimeout(forceTimerRef.current)
      forceTimerRef.current = null
      cancelIdle()
    }
  }, [abortPrefetch, cancelIdle])

  // 页变化：落定后 200ms 重算窗口；1500ms 仍未落定则强制放行 P1
  useEffect(() => {
    if (typeof window === 'undefined') return
    forceRef.current = false
    schedulePump(PREFETCH_SETTLE_DELAY_MS)
    if (forceTimerRef.current !== null) window.clearTimeout(forceTimerRef.current)
    forceTimerRef.current = window.setTimeout(() => {
      forceTimerRef.current = null
      forceRef.current = true
      pumpRef.current()
    }, PREFETCH_BOOTSTRAP_MS)
    return () => {
      if (forceTimerRef.current !== null) {
        window.clearTimeout(forceTimerRef.current)
        forceTimerRef.current = null
      }
    }
  }, [currentPage, schedulePump])

  // 档位 / 闸门 / 快扫模式变化：立刻重算（降档或暂停都会 abort 掉不再需要的在飞请求）
  useEffect(() => {
    schedulePump(PREFETCH_SETTLE_DELAY_MS)
  }, [quality, paused, skimMode, schedulePump])

  // 后台标签页不该花用户流量
  useEffect(() => {
    if (typeof document === 'undefined') return
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') pumpRef.current() // pump 内部会 abort 全部
      else schedulePump(PREFETCH_SETTLE_DELAY_MS)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [schedulePump])

  const isDecoded = useCallback((page: number) => readyRef.current.has(page), [])

  const failedAt = useCallback((page: number) => failedRef.current.get(page) ?? null, [])

  const reportSettled = useCallback(
    (page: number, ok: boolean) => {
      if (ok) {
        readyRef.current.add(page)
        // 屏幕上这页已经画出：槽位可以给下一张
        schedulePump(PREFETCH_SETTLE_DELAY_MS)
      } else {
        failedRef.current.set(page, Date.now())
      }
    },
    [schedulePump],
  )

  const notifyRetry = useCallback(
    (page: number) => {
      failedRef.current.delete(page)
      schedulePump(0)
    },
    [schedulePump],
  )

  const noteFlip = useCallback((page: number, hit: boolean) => {
    if (hit) statsRef.current.hits += 1
    else statsRef.current.misses += 1
    // 度量用：控制台读 window.__pbPrefetch 即可算 B0 命中率（指标 3）
    if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
      ;(window as Window & { __pbPrefetch?: PrefetchStats }).__pbPrefetch = { ...statsRef.current }
    }
    void page
  }, [])

  const stats = useCallback(() => ({ ...statsRef.current }), [])

  return useMemo(
    () => ({ isDecoded, failedAt, reportSettled, notifyRetry, noteFlip, stats }),
    [failedAt, isDecoded, noteFlip, notifyRetry, reportSettled, stats],
  )
}
