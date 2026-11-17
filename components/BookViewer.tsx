'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import type { AnimationEvent as ReactAnimationEvent } from 'react'
import type { PictureBook } from '@/lib/types'
import { VideoGenerator } from './VideoGenerator'
import { generatePDF } from '@/lib/pdf'
import { useTTS } from '@/hooks/useTTS'
import { getStrategy } from '@/lib/content-types'
import { getBookFullText, formatPoetryAttribution } from '@/lib/book-display'

interface BookViewerProps {
  book: PictureBook
}

const RATES = [0.5, 0.75, 1.0, 1.25, 1.5]

// 阅读进度 localStorage 键：{ [bookId]: 页码索引（0=封面）}
const PROGRESS_KEY = 'pb-reading-progress'

// 连点冷却：翻页落定后 300ms 内拒绝再次翻页，避免儿童连续按键"越按越远"
const FLIP_COOLDOWN_MS = 300
// 跨页跳转交叉淡入时长（与 duration-normal 对齐）
const CROSS_FADE_MS = 240
// 恢复提示淡出时长（与 duration-fast 对齐）
const HINT_FADE_MS = 180
// animate-flip-next 560ms + 140ms 兜底余量；仅当 animationend 丢失时兜底解锁
const FLIP_FALLBACK_MS = 700

export function BookViewer({ book }: BookViewerProps) {
  // ── 页码：0=封面, 1~N=场景, N+1=含义页 ────────────────
  const [currentPage, setCurrentPage] = useState(0)
  // ref 与 state 同步写入：TTS 回调是注册进 hook 的长期闭包，不能依赖 useState 的快照
  const currentPageRef = useRef(0)
  const setPage = useCallback((page: number) => {
    currentPageRef.current = page
    setCurrentPage(page)
  }, [])

  // ── 翻页状态机 ────────────────────────────────────────
  // flipFrom 固定为旧页快照，动画期间绝不跟随 currentPage 变化
  const [isFlipping, setIsFlipping] = useState(false)
  const [flipFrom, setFlipFrom] = useState<number | null>(null)
  const [flipDir, setFlipDir] = useState<'next' | 'prev' | null>(null)
  const [bookOpen, setBookOpen] = useState(false) // 封面→场景开书动画是否已落定
  const [crossFade, setCrossFade] = useState(false) // 跨页跳转（|target-current|>1）
  const isFlippingRef = useRef(false)
  const flipFromRef = useRef<number | null>(null)
  const lastFlipAtRef = useRef(0)
  const crossFadeTimerRef = useRef<number | null>(null)
  const flipFallbackTimerRef = useRef<number | null>(null)
  const ttsErrorTimerRef = useRef<number | null>(null)

  const categoryLabel = (() => {
    try { return getStrategy(book.category).label } catch { return '内容' }
  })()
  const isPoetry = book.category === 'poetry'
  const isNurseryRhyme = book.category === 'nursery-rhyme'
  const fullText = getBookFullText(book)
  const poetryAttribution = isPoetry ? formatPoetryAttribution(book) : undefined
  const meaningPageTitle = isPoetry ? '诗意解读' : isNurseryRhyme ? '儿歌寓意' : `${categoryLabel}含义`
  const reviewTitle = isPoetry ? '全诗回顾' : isNurseryRhyme ? '歌词回顾' : '故事回顾'
  const reviewDoneText = isPoetry ? '🎉 读完啦！' : isNurseryRhyme ? '🎉 唱完啦！' : '🎉 故事讲完啦！'
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [showVideoGenerator, setShowVideoGenerator] = useState(false)
  const [ttsError, setTTSError] = useState(false)
  const totalPages = book.scenes.length + 2 // 封面 + 场景 + 含义页

  // ── 阅读进度记忆（localStorage，按 book.id）──────────
  const [hydrated, setHydrated] = useState(false)
  const [progressRestored, setProgressRestored] = useState(false)
  const [hintLeaving, setHintLeaving] = useState(false)

  // 挂载时恢复上次阅读位置（仅一次，按 book.id）
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PROGRESS_KEY)
      if (raw) {
        const map = JSON.parse(raw) as Record<string, number>
        const saved = map[book.id]
        const lastPage = book.scenes.length + 1
        if (typeof saved === 'number' && Number.isInteger(saved) && saved >= 1 && saved <= lastPage) {
          setPage(saved)
          setProgressRestored(true)
        }
      }
    } catch {
      // localStorage 不可用或数据损坏，忽略
    }
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id])

  // 恢复提示：3.5s 后进入淡出，再 180ms 卸载
  useEffect(() => {
    if (!progressRestored) return
    const leaveTimer = setTimeout(() => setHintLeaving(true), 3500)
    const removeTimer = setTimeout(() => {
      setProgressRestored(false)
      setHintLeaving(false)
    }, 3500 + HINT_FADE_MS)
    return () => {
      clearTimeout(leaveTimer)
      clearTimeout(removeTimer)
    }
  }, [progressRestored])

  // 页面变化时保存进度；读到最后一页（含义页）视为读完，清除记录
  useEffect(() => {
    if (!hydrated) return
    try {
      const raw = window.localStorage.getItem(PROGRESS_KEY)
      const map: Record<string, number> = raw ? JSON.parse(raw) : {}
      const lastPage = book.scenes.length + 1
      if (currentPage >= 1 && currentPage < lastPage) {
        map[book.id] = currentPage
      } else {
        // 回到封面或已读到最后一页：不保留进度
        delete map[book.id]
      }
      window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(map))
    } catch {
      // 隐私模式等场景下写入失败，忽略
    }
  }, [hydrated, currentPage, book.id, book.scenes.length])

  // 组件卸载时清理所有定时器，避免 setState on unmounted component
  useEffect(() => () => {
    if (crossFadeTimerRef.current) clearTimeout(crossFadeTimerRef.current)
    if (flipFallbackTimerRef.current) clearTimeout(flipFallbackTimerRef.current)
    if (ttsErrorTimerRef.current !== null) clearTimeout(ttsErrorTimerRef.current)
  }, [])

  // TTS 真实失败提示（静默 stop() 不会触发）
  const handleTTSError = useCallback(() => {
    setTTSError(true)
    if (ttsErrorTimerRef.current !== null) clearTimeout(ttsErrorTimerRef.current)
    ttsErrorTimerRef.current = window.setTimeout(() => {
      ttsErrorTimerRef.current = null
      setTTSError(false)
    }, 3500)
  }, [])

  const {
    isPlaying,
    isPaused,
    rate,
    currentCharIndex,
    speak,
    speakScenes,
    stop,
    clearHighlight,
    togglePause,
    setRate: setTTSRate,
    isSupported,
  } = useTTS({ onError: handleTTSError })

  // 缓存从 Blob 创建的 URL，避免每次渲染创建新 URL
  const sceneBlobUrls = useMemo(() => {
    const urls: Map<number, string> = new Map()
    book.scenes.forEach((s) => {
      if (!s.imageUrl && s.imageBlob) {
        urls.set(s.id, URL.createObjectURL(s.imageBlob))
      }
    })
    return urls
  }, [book.scenes])

  // 获取场景图片 URL：优先 imageUrl，其次 Blob，最后构造文件系统路径
  const getSceneImageUrl = useCallback((scene: typeof book.scenes[0]) => {
    if (scene.imageUrl) return scene.imageUrl
    if (scene.imageBlob) return sceneBlobUrls.get(scene.id) || ''
    if (book.category && book.sourceText) {
      return `/generated/${book.category}/${book.sourceText}/${scene.id}.png`
    }
    return ''
  }, [book.category, book.sourceText, sceneBlobUrls])

  // 组件卸载时释放所有 blob URL
  useEffect(() => {
    return () => {
      sceneBlobUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [sceneBlobUrls])
  const isReadingModeRef = useRef(false)

  const finishFlip = useCallback(() => {
    // 幂等：animationend 与兜底 timer 可能都触发，只处理一次
    if (!isFlippingRef.current) return
    isFlippingRef.current = false
    setIsFlipping(false)
    setFlipFrom(null)
    setFlipDir(null)
    lastFlipAtRef.current = Date.now()
    if (flipFromRef.current === 0) setBookOpen(true)
    flipFromRef.current = null
    // 落定时清除逐字高亮，150ms 内退回普通态（见 useTTS.clearHighlight）
    clearHighlight()
    if (flipFallbackTimerRef.current) {
      clearTimeout(flipFallbackTimerRef.current)
      flipFallbackTimerRef.current = null
    }
  }, [clearHighlight])

  /** 统一翻页入口：相邻页走 3D leaf，跨页走交叉淡入 */
  const goToPage = useCallback((target: number, dir: 'next' | 'prev') => {
    const prev = currentPageRef.current
    const clamped = Math.max(0, Math.min(target, totalPages - 1))
    if (clamped === prev) return
    if (isFlippingRef.current) return // 丢弃连点，不排队
    if (Date.now() - lastFlipAtRef.current < FLIP_COOLDOWN_MS) return

    // reduced-motion 下全局 CSS 会 display:none 掉 .flip-leaf，animationend 不会触发；
    // 直接切页，避免等待兜底 timer 时出现空窗
    if (typeof window !== 'undefined' && (
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true ||
      document.documentElement.classList.contains('motion-reduced')
    )) {
      lastFlipAtRef.current = Date.now()
      clearHighlight()
      setPage(clamped)
      return
    }

    // 跨页跳转（缩略图 / 圆点）：无 leaf，直接 240ms 交叉淡入
    if (Math.abs(clamped - prev) > 1) {
      lastFlipAtRef.current = Date.now()
      clearHighlight()
      setCrossFade(true)
      setPage(clamped)
      if (crossFadeTimerRef.current) clearTimeout(crossFadeTimerRef.current)
      crossFadeTimerRef.current = window.setTimeout(() => setCrossFade(false), CROSS_FADE_MS)
      return
    }

    // 相邻页：旧页快照留在 leaf 上翻走，新页已在底层就位
    isFlippingRef.current = true
    flipFromRef.current = prev
    setFlipFrom(prev)
    setFlipDir(dir)
    setIsFlipping(true)
    setCrossFade(false)
    setPage(clamped)
    flipFallbackTimerRef.current = window.setTimeout(finishFlip, FLIP_FALLBACK_MS)
  }, [totalPages, setPage, clearHighlight, finishFlip])

  const goToNext = useCallback((target?: number) => {
    goToPage(typeof target === 'number' ? target : currentPageRef.current + 1, 'next')
  }, [goToPage])

  const goToPrev = useCallback((target?: number) => {
    goToPage(typeof target === 'number' ? target : currentPageRef.current - 1, 'prev')
  }, [goToPage])

  // leaf 自己的动画结束才解锁；子元素（sheen 无限循环等）冒泡上来的事件忽略
  const handleFlipEnd = useCallback((e: ReactAnimationEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    finishFlip()
  }, [finishFlip])

  // 判断当前页类型
  const isCover = currentPage === 0
  const isMeaningPage = currentPage === totalPages - 1
  const sceneIndex = currentPage - 1 // 场景索引从0开始

  // 循环切换语速
  const cycleRate = useCallback(() => {
    const currentIndex = RATES.indexOf(rate)
    const nextIndex = (currentIndex + 1) % RATES.length
    setTTSRate(RATES[nextIndex])
  }, [rate, setTTSRate])

  // 开始/停止朗读
  const handleSpeak = useCallback(() => {
    if (isPlaying) {
      stop()
      isReadingModeRef.current = false
      return
    }

    isReadingModeRef.current = true
    const startIndex = isCover ? 0 : isMeaningPage ? book.scenes.length : sceneIndex
    if (startIndex >= book.scenes.length) return

    // 封面起步：先把书翻开到第 1 页（场景 0 详情），让开书 3D 动画与首个场景朗读同时发生。
    // 这样下方 onSceneEnd 仍沿用 sceneIdx+2 映射，后续每个场景与其详情页一一对应，不会跳页。
    if (isCover) goToNext(1)

    // 使用 useTTS hook 的 speakScenes，确保 isPlaying/isPaused 状态同步
    speakScenes(
      book.scenes.map(s => ({ narration: s.narration })),
      startIndex,
      (sceneIdx) => {
        // 每个场景结束后的回调：统一走翻页入口（带 3D 动画），不直接 setCurrentPage
        const nextPage = sceneIdx + 2 // +1 for cover, +1 for next scene
        if (nextPage < totalPages) {
          // 朗读期间用户可能手动翻页，按 target 与当前页的相对位置决定方向，避免翻反
          if (nextPage > currentPageRef.current) {
            goToNext(nextPage)
          } else {
            goToPrev(nextPage)
          }
        } else {
          isReadingModeRef.current = false
        }
      }
    )
  }, [isPlaying, stop, isCover, isMeaningPage, sceneIndex, book.scenes, speakScenes, totalPages, goToNext, goToPrev])

  // 停止朗读并退出朗读模式
  const handleStop = useCallback(() => {
    stop()
    isReadingModeRef.current = false
  }, [stop])

  // 页面变化时，在朗读模式下处理含义页朗读
  useEffect(() => {
    if (!isReadingModeRef.current) return
    if (isCover) return

    if (isMeaningPage) {
      speak(book.meaning)
      // 朗读完含义后退出朗读模式（后续由用户手动触发朗读）
      isReadingModeRef.current = false
    }
    // 场景页朗读由 speakScenes 处理，无需在此创建 utterance
  }, [currentPage, isCover, isMeaningPage, book.meaning, speak])

  // 键盘事件：翻页中 / 输入控件 / 弹窗打开时不响应，Space 阻止默认滚动
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isFlipping) return
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName?.toLowerCase()
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) return
      }
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return

      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        goToNext()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goToPrev()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goToNext, goToPrev, isFlipping])

  // ── 逐字持久高亮：每个字一个稳定 key 的 span，避免 slice 重建 DOM ──
  const renderNarration = (narration: string, highlightEnabled: boolean) => {
    const chars = Array.from(narration)
    const showHighlight = highlightEnabled && isPlaying && currentCharIndex >= 0 && currentCharIndex < chars.length

    return (
      <div className="bg-white/60 rounded-lg p-4 relative">
        <h4 className="font-semibold text-gray-700 mb-2">
          {isPoetry ? '💡 白话释义' : isNurseryRhyme ? '🎵 歌词' : '💬 旁白'}
        </h4>
        {isPaused && showHighlight && (
          <span className="absolute top-3 right-3 text-xs text-yellow-700 bg-yellow-50 rounded-full px-2 py-0.5" aria-live="polite">
            ⏸ 已暂停
          </span>
        )}
        <p className={`text-gray-800 text-lg whitespace-pre-wrap ${isNurseryRhyme || !isPoetry ? 'italic' : ''}`}>
          {!isPoetry && !isNurseryRhyme && '「'}
          {chars.map((ch, i) => {
            const active = showHighlight && i === currentCharIndex
            const stateClass = active
              ? `${isPaused ? 'bg-yellow-100' : 'bg-yellow-200'} scale-105 ease-enter`
              : 'bg-transparent scale-100 ease-standard'
            return (
              <span
                key={i}
                className={`inline-block whitespace-pre origin-bottom rounded px-[1px] transition-all duration-fast ${stateClass}`}
              >
                {ch}
              </span>
            )
          })}
          {!isPoetry && !isNurseryRhyme && '」'}
        </p>
      </div>
    )
  }

  /**
   * 纯渲染函数：给定页码返回该页完整结构。
   * flip-leaf 用它渲染 flipFrom 的快照；主舞台用它渲染 currentPage。
   * 因为入参是固定值，动画期间 leaf 内容不会随 React 重渲染漂移成新页。
   */
  const renderPage = (pageNum: number, highlightEnabled: boolean) => {
    const pIsCover = pageNum === 0
    const pIsMeaning = pageNum === totalPages - 1
    const pSceneIndex = pageNum - 1
    const pScene = !pIsCover && !pIsMeaning ? book.scenes[pSceneIndex] : null

    // 含义页 stagger 只在落定时播放：翻页期间先不挂类，落定重渲染再加类触发动画
    const landAnim = (delay: string) => isFlipping ? '' : `animate-fade-up ${delay}`

    if (pIsCover) {
      return (
        <div className="bg-gradient-to-br from-secondary to-primary/20 rounded-card p-8 shadow-lg">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              {isPoetry ? '📜' : isNurseryRhyme ? '🎵' : '📚'} {book.title}
            </h1>
            {isPoetry && poetryAttribution && (
              <p className="text-amber-800 font-medium mb-3">{poetryAttribution}</p>
            )}
            {fullText && (isPoetry || isNurseryRhyme) ? (
              <div className={`mx-auto max-w-md rounded-lg p-4 mb-4 ${
                isPoetry ? 'bg-amber-50/80' : 'bg-blue-50/80'
              }`}>
                <p className={`whitespace-pre-line leading-relaxed ${
                  isPoetry
                    ? 'text-xl font-serif text-gray-800 tracking-wide'
                    : 'text-lg italic text-gray-700'
                }`}>
                  {fullText}
                </p>
              </div>
            ) : null}
            <p className="text-gray-600">{book.meaning}</p>
          </div>

          {/* 所有插图网格 */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {book.scenes.map((s, i) => {
              const imgSrc = getSceneImageUrl(s) || null
              return (
                <div
                  key={i}
                  className="bg-white rounded-lg overflow-hidden shadow-md cursor-pointer transition-all duration-normal ease-standard hover:shadow-lg hover:scale-105 hover:-translate-y-0.5"
                  onClick={() => goToNext(i + 1)}
                >
                  {imgSrc && (
                    <img
                      src={imgSrc}
                      alt={s.title}
                      className="w-full h-32 object-cover"
                    />
                  )}
                  <div className="p-2 text-center">
                    <span className="text-xs text-gray-500">
                      {isPoetry ? `第 ${i + 1} 句` : isNurseryRhyme ? `第 ${i + 1} 段` : `第 ${i + 1} 幕`}
                    </span>
                    <p className="text-sm font-medium text-gray-700 truncate">{s.title}</p>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="text-center text-sm text-gray-500">
            点击任意场景开始阅读 →
          </div>
        </div>
      )
    }

    if (pScene) {
      return (
        <div className="flex items-stretch">
          {/* 左页 - 插图 */}
          <div
            className="w-1/2 bg-gradient-to-r from-secondary to-primary/20 rounded-l-card p-6 shadow-lg"
          >
            <div className="text-center mb-4">
              <span className="text-sm text-gray-500">
                {isPoetry ? `第 ${pSceneIndex + 1} 句` : isNurseryRhyme ? `第 ${pSceneIndex + 1} 段` : `第 ${pSceneIndex + 1} 幕`}
              </span>
              <h3 className="text-xl font-bold text-gray-800">
                {pScene.title}
              </h3>
            </div>
            {(pScene.imageUrl || pScene.imageBlob) && (
              <img
                src={getSceneImageUrl(pScene) || ''}
                alt={pScene.title}
                className="w-full h-auto rounded-lg shadow-md"
              />
            )}
          </div>

          {/* 右页 - 文本 */}
          <div
            className="w-1/2 bg-gradient-to-l from-secondary to-primary/20 rounded-r-card p-6 shadow-lg"
          >
            <div className="space-y-4">
              {!isNurseryRhyme && (
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">
                    {isPoetry ? '🎨 意境描绘' : '📖 场景描述'}
                  </h4>
                  <p className="text-gray-600">{pScene.description}</p>
                </div>
              )}
              {isPoetry && (
                <div className="bg-amber-50/80 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-700 mb-2">📜 原诗</h4>
                  <p className="text-gray-800 text-xl font-serif tracking-wide">{pScene.title}</p>
                </div>
              )}
              {renderNarration(pScene.narration, highlightEnabled)}
            </div>
          </div>
        </div>
      )
    }

    if (pIsMeaning) {
      return (
        <div className="bg-gradient-to-br from-primary/20 to-accent/20 rounded-card p-8 shadow-lg text-center">
          <div className={`text-6xl mb-6 ${landAnim('[animation-delay:60ms]')}`}>{isPoetry ? '📜' : isNurseryRhyme ? '🎵' : '💡'}</div>
          <h2 className={`text-2xl font-bold text-gray-800 mb-4 ${landAnim('[animation-delay:120ms]')}`}>
            {meaningPageTitle}
          </h2>
          <p className={`text-xl text-gray-700 mb-8 leading-relaxed ${landAnim('[animation-delay:180ms]')}`}>
            {book.meaning}
          </p>

          <div className={landAnim('[animation-delay:240ms]')}>
            {fullText && (isPoetry || isNurseryRhyme) ? (
              <div className={`rounded-lg p-6 max-w-lg mx-auto mb-6 ${
                isPoetry ? 'bg-amber-50/80' : 'bg-blue-50/80'
              }`}>
                <h3 className="font-semibold text-gray-700 mb-3">
                  {isPoetry ? '📜 全诗' : '🎵 完整歌词'}
                </h3>
                <p className={`whitespace-pre-line leading-relaxed text-left ${
                  isPoetry
                    ? 'text-lg font-serif text-gray-800'
                    : 'text-base italic text-gray-700'
                }`}>
                  {fullText}
                </p>
              </div>
            ) : (
              <div className="bg-white/60 rounded-lg p-6 max-w-lg mx-auto">
                <h3 className="font-semibold text-gray-700 mb-3">📖 {reviewTitle}</h3>
                <div className="space-y-2 text-left">
                  {book.scenes.map((s, i) => (
                    <p key={i} className="text-gray-600 text-sm">
                      <span className="font-medium">第 {i + 1} 幕 {s.title}：</span>
                      {s.narration}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {(isPoetry || isNurseryRhyme) && fullText && (
              <div className="bg-white/60 rounded-lg p-6 max-w-lg mx-auto">
                <h3 className="font-semibold text-gray-700 mb-3">📖 {reviewTitle}</h3>
                <div className="space-y-2 text-left">
                  {book.scenes.map((s, i) => (
                    <p key={i} className="text-gray-600 text-sm">
                      <span className="font-medium">
                        {isPoetry ? `第 ${i + 1} 句` : `第 ${i + 1} 段`} {s.title}：
                      </span>
                      {s.narration}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 text-sm text-gray-500">
            {reviewDoneText}
          </div>
        </div>
      )
    }

    return null
  }

  // 开书：封面→场景的翻页期间舞台缩到 95%，落定时 bookOpen=true 过渡回 100%
  const isOpeningBook = isFlipping && !bookOpen && flipFrom === 0
  const toolbarBtn = 'px-4 py-2 rounded-button text-sm transition-all duration-fast ease-standard active:scale-[0.97]'

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* TTS 错误提示 */}
      {ttsError && (
        <div
          role="alert"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-red-50 text-red-700 border border-red-200 shadow-lg px-4 py-2 rounded-full text-sm animate-fade-up"
        >
          ⚠️ 朗读失败，请重试
        </div>
      )}

      {/* 工具栏 */}
      <div className="flex justify-between items-center">
        <button
          onClick={() => window.history.back()}
          className="text-gray-600 hover:text-gray-800 transition-colors duration-fast active:scale-[0.97]"
        >
          ← 返回
        </button>
        <h2 className="text-xl font-bold text-gray-800">{book.title}</h2>
        <div className="flex gap-2">
          {isSupported && (
            <>
              <button
                onClick={handleSpeak}
                className={`${toolbarBtn} ${
                  isPlaying
                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                    : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                }`}
              >
                {isPlaying ? '⏹ 停止' : '🔊 朗读'}
              </button>
              {isPlaying && (
                <>
                  <button
                    onClick={togglePause}
                    className={`${toolbarBtn} bg-yellow-100 text-yellow-700 hover:bg-yellow-200`}
                  >
                    {isPaused ? '▶ 继续' : '⏸ 暂停'}
                  </button>
                  <button
                    onClick={cycleRate}
                    className={`${toolbarBtn} bg-gray-100 text-gray-700 hover:bg-gray-200`}
                  >
                    🐢 {rate}x
                  </button>
                </>
              )}
            </>
          )}
          <button
            onClick={() => setShowVideoGenerator(!showVideoGenerator)}
            className={`${toolbarBtn} bg-purple-100 text-purple-700 hover:bg-purple-200`}
          >
            🎬 视频
          </button>
          <button
            onClick={() => generatePDF(book)}
            className={`${toolbarBtn} bg-green-100 text-green-700 hover:bg-green-200`}
          >
            📄 PDF
          </button>
        </div>
      </div>

      {/* 翻页阅读器 */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => goToPrev()}
          disabled={currentPage === 0}
          className="text-3xl text-gray-400 hover:text-gray-600 disabled:opacity-30 transition-transform duration-fast active:scale-95"
          aria-label="上一页"
        >
          ◀
        </button>

        <div className="flex-1">
          <div
            className={`book-stage relative ${isOpeningBook ? 'scale-95' : 'scale-100'} transition-transform duration-slow ease-enter`}
            data-flipping={isFlipping ? 'true' : undefined}
          >
            {/* 底层：接收页（新页）。跨页跳转时 240ms 交叉淡入 + translateX(8px) */}
            <div className={`page-layer relative ${crossFade ? 'animate-page-in' : ''}`}>
              {renderPage(currentPage, !isFlipping)}
              {isFlipping && (
                <div className="page-shadow animate-page-shadow pointer-events-none absolute inset-0" aria-hidden="true" />
              )}
            </div>

            {/* 覆盖层：旧页快照，仅翻页期间挂载，动画结束即卸载（will-change 用完即删） */}
            {isFlipping && flipFrom !== null && flipDir !== null && (
              <div
                key={`leaf-${flipFrom}-${flipDir}-${currentPage}`}
                className={`flip-leaf ${
                  flipDir === 'next'
                    ? 'flip-leaf--next animate-flip-next'
                    : 'flip-leaf--prev animate-flip-prev'
                }`}
                onAnimationEnd={handleFlipEnd}
                aria-hidden="true"
              >
                {/* .flip-leaf 是半页宽：内层撑到舞台 200% 并偏移，露出旧页对应的半边。
                    此处不挂 .page-layer（其 width:100% 在 utilities 之后定义会覆盖 w-[200%]） */}
                <div className={`w-[200%] h-full ${
                  flipDir === 'next' ? '-translate-x-1/2' : 'translate-x-0'
                }`}>
                  {renderPage(flipFrom, true)}
                </div>
                <div className={`leaf-sheen ${flipDir === 'prev' ? 'leaf-sheen--prev' : ''}`} />
              </div>
            )}
          </div>
        </div>

        <button
          onClick={() => goToNext()}
          disabled={currentPage === totalPages - 1}
          className="text-3xl text-primary hover:text-accent disabled:opacity-30 transition-transform duration-fast active:scale-95"
          aria-label="下一页"
        >
          ▶
        </button>
      </div>

      {/* 页码指示器 */}
      <div className="flex justify-center items-center gap-4">
        <div className="flex gap-2" role="group" aria-label="页码导航">
          {Array.from({ length: totalPages }).map((_, i) => {
            const isCurrent = i === currentPage
            return (
              <button
                key={i}
                onClick={() => goToPage(i, i > currentPage ? 'next' : 'prev')}
                className={`w-3 h-3 rounded-full transition-transform duration-normal ease-bounce-soft ${
                  isCurrent ? 'bg-primary scale-125' : 'bg-gray-300'
                }`}
                aria-label={`第 ${i} 页，共 ${totalPages} 页`}
                aria-current={isCurrent ? 'page' : undefined}
              />
            )
          })}
        </div>
        <span className="text-sm text-gray-500">
          {currentPage + 1} / {totalPages}
        </span>
        {progressRestored && (
          <span className={`text-xs text-primary bg-primary/10 px-2 py-1 rounded-full ${
            hintLeaving
              ? 'opacity-0 transition-opacity duration-fast'
              : 'animate-fade-up'
          }`}>
            📖 已恢复上次阅读位置
          </span>
        )}
      </div>

      {/* 视频生成 */}
      {showVideoGenerator && (
        <div className="bg-white rounded-card p-6 shadow-md">
          <h3 className="text-lg font-semibold mb-4">🎬 生成绘本视频</h3>
          <VideoGenerator
            imageUrls={book.scenes
              .map((s) => s.imageUrl)
              .filter((url): url is string => !!url)}
            onVideoGenerated={setVideoUrl}
          />
        </div>
      )}

      {/* 视频播放器 */}
      {videoUrl && (
        <div className="bg-white rounded-card p-6 shadow-md">
          <h3 className="text-lg font-semibold mb-4">📺 绘本视频</h3>
          <video src={videoUrl} controls className="w-full rounded-card" />
          <a
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block text-blue-600 hover:underline"
          >
            📥 打开/下载视频
          </a>
        </div>
      )}
    </div>
  )
}
