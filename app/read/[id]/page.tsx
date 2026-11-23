'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { BookViewer } from '@/components/BookViewer'
import type { PictureBook } from '@/lib/types'

/** book.json 里可能带大图 base64，10s 还没回来就转错误态而不是无限骨架 */
const LOAD_TIMEOUT_MS = 10_000

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; book: PictureBook }
  /** 404：这本书不存在 */
  | { status: 'notfound' }
  /** 网络错误 / 5xx / 超时 */
  | { status: 'error'; detail?: string }

// 移动端：底部条 56px + safe 由 56px 预留；≥md 底部条隐藏，底部留白改由 md:pb-8 显式接管
// （不要用 md:p-8 简写，否则它和 pb-[calc(...)] 是同一元素上的长写/简写竞争，1440 下到底谁赢要靠 CSS 顺序）
const MAIN_CLASS =
  'flex min-h-[100dvh] flex-col items-stretch justify-start px-3 pt-2 pb-[calc(56px+env(safe-area-inset-bottom)+16px)] md:min-h-screen md:items-center md:justify-center md:px-6 md:pt-5 md:pb-8'

/** 骨架：单页卡形状 + 3 行文字条 + 底部条 */
function BookSkeleton() {
  return (
    <div role="status" aria-live="polite" className="w-full">
      <span className="sr-only">正在打开绘本</span>
      <div
        aria-hidden="true"
        className="mx-auto flex max-h-[calc(100dvh-56px-env(safe-area-inset-bottom)-88px)] w-full max-w-[560px] animate-pulse flex-col overflow-hidden rounded-card bg-white shadow-card"
      >
        <div className="aspect-[4/3] max-h-[46dvh] min-h-[180px] w-full bg-[var(--brand-strong-soft)]" />
        <div className="space-y-2.5 p-4">
          <div className="h-4 w-3/4 rounded-inner bg-ink/[0.08]" />
          <div className="h-3 w-full rounded-inner bg-ink/[0.06]" />
          <div className="h-3 w-5/6 rounded-inner bg-ink/[0.06]" />
          <div className="mt-3 h-16 w-full rounded-inner bg-ink/5" />
        </div>
      </div>
      <div
        aria-hidden="true"
        className="fixed inset-x-0 bottom-0 z-40 h-14 border-t border-[var(--hairline)] bg-white/[0.94] backdrop-blur md:hidden"
      >
        <div className="mx-auto flex h-14 max-w-[520px] items-center justify-between px-3">
          <div className="h-11 w-11 animate-pulse rounded-full bg-ink/[0.08]" />
          <div className="mx-3 h-1.5 flex-1 animate-pulse rounded-full bg-ink/[0.08]" />
          <div className="h-11 w-11 animate-pulse rounded-full bg-ink/[0.08]" />
        </div>
      </div>
    </div>
  )
}

function StateCard({
  icon,
  title,
  description,
  children,
}: {
  icon: string
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-[420px] animate-fade-up rounded-card bg-white p-6 text-center shadow-card">
      <div aria-hidden="true" className="text-4xl">{icon}</div>
      <h1 className="mt-3 text-[18px] font-bold text-[var(--text-ink)]">{title}</h1>
      <p className="mt-2 text-[13.5px] leading-[1.7] text-[var(--text-body)]">{description}</p>
      <div className="mt-5 flex flex-col items-stretch gap-2 sm:flex-row sm:justify-center">{children}</div>
    </div>
  )
}

const PRIMARY_BTN =
  'inline-flex min-h-[44px] items-center justify-center rounded-button bg-primary px-5 text-[14px] font-semibold text-ink ring-1 ring-ink/[0.16] shadow-card transition-transform duration-fast ease-standard active:scale-[0.97]'
const GHOST_BTN =
  'inline-flex min-h-[44px] items-center justify-center rounded-button border border-ink/[0.14] bg-white px-5 text-[14px] font-medium text-[var(--text-ink)] transition-transform duration-fast ease-standard active:scale-[0.97] hover:bg-[var(--brand-strong-soft)]'

export default function ReadPage() {
  const params = useParams()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const abortRef = useRef<AbortController | null>(null)

  const loadBook = useCallback(async () => {
    // 同一时刻只保留一个请求
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    // 重试时不清空已有内容；其它情况回到骨架
    setState((prev) => (prev.status === 'ready' ? prev : { status: 'loading' }))

    const rawId = String(params.id ?? '')
    let id = rawId
    try {
      id = decodeURIComponent(rawId)
    } catch {
      // 非法编码：按原样使用
    }
    // 格式：category:sourceText；兼容旧格式（无前缀 → idiom）
    const separatorIndex = id.indexOf(':')
    const category = separatorIndex > 0 ? id.substring(0, separatorIndex) : 'idiom'
    const sourceText = separatorIndex > 0 ? id.substring(separatorIndex + 1) : id

    let timedOut = false
    const timeoutId = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, LOAD_TIMEOUT_MS)

    try {
      const response = await fetch(
        `/generated/${category}/${encodeURIComponent(sourceText)}/book.json`,
        { signal: controller.signal },
      )

      if (timedOut) return
      if (response.status === 404) {
        setState({ status: 'notfound' })
        return
      }
      if (!response.ok) {
        setState({ status: 'error', detail: `HTTP ${response.status}` })
        return
      }

      const data = (await response.json()) as PictureBook
      if (timedOut || controller.signal.aborted) return
      setState({ status: 'ready', book: data })
    } catch (err) {
      if (timedOut) {
        setState({ status: 'error', detail: '打开超时' })
        return
      }
      if (controller.signal.aborted) return // 卸载或被下一次请求取代，不动 state
      setState({
        status: 'error',
        detail: err instanceof Error ? err.message : undefined,
      })
    } finally {
      window.clearTimeout(timeoutId)
    }
  }, [params.id])

  useEffect(() => {
    void loadBook()
    return () => abortRef.current?.abort()
  }, [loadBook])

  // ── 加载中：书页骨架 ──
  if (state.status === 'loading') {
    return (
      <main id="main" tabIndex={-1} className={MAIN_CLASS}>
        <BookSkeleton />
      </main>
    )
  }

  // ── 404：这本书不存在 ──
  if (state.status === 'notfound') {
    return (
      <main id="main" tabIndex={-1} className={MAIN_CLASS}>
        <StateCard
          icon="😢"
          title="这本绘本找不到了"
          description="可能已经被删除或尚未生成。可以回到书架看看别的绘本，或者重新生成一本。"
        >
          <Link href="/" className={PRIMARY_BTN}>回到书架</Link>
          <Link href="/" className={GHOST_BTN}>重新生成一本</Link>
        </StateCard>
      </main>
    )
  }

  // ── 网络 / 5xx：可原地重试 ──
  if (state.status === 'error') {
    return (
      <main id="main" tabIndex={-1} className={MAIN_CLASS}>
        <StateCard
          icon="📡"
          title="绘本没打开，网络不太稳"
          description={
            state.detail
              ? `刚才没能取到绘本内容（${state.detail}）。可以再试一次，网络恢复后会直接打开展示。`
              : '刚才没能取到绘本内容。可以再试一次，网络恢复后会直接打开展示。'
          }
        >
          <button type="button" onClick={() => { void loadBook() }} className={PRIMARY_BTN}>
            重试
          </button>
          <Link href="/" className={GHOST_BTN}>回到书架</Link>
        </StateCard>
      </main>
    )
  }

  // ── 空内容：画还没画完 ──
  if (state.book.scenes.length === 0) {
    return (
      <main id="main" tabIndex={-1} className={MAIN_CLASS}>
        <StateCard
          icon="🖌️"
          title="这本绘本还没画完"
          description="这个故事还没有任何画面，可能是生成中断了。可以回到书架重新生成一本。"
        >
          <Link href="/" className={PRIMARY_BTN}>重新生成一本</Link>
          <button type="button" onClick={() => { void loadBook() }} className={GHOST_BTN}>
            重新加载
          </button>
        </StateCard>
      </main>
    )
  }

  return (
    <main id="main" tabIndex={-1} className={MAIN_CLASS}>
      <BookViewer book={state.book} />
    </main>
  )
}
