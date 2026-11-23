'use client'

import { useState, useEffect, useCallback, useRef, useMemo, useId } from 'react'
import Link from 'next/link'
import { getContentListByCategory } from '@/lib/content-info'
import { useAppStore } from '@/lib/store'
import { createJobAPI } from '@/lib/use-jobs'
import { getRandomItems, saveRecommendedItems } from '@/lib/db'
import { fetchRecommendations } from '@/app/actions/recommend'
import { getStrategy } from '@/lib/content-types'
import type { ContentCategory, ContentInfo } from '@/lib/types'

interface ContentSelectorProps {
  category: ContentCategory
  generatedTexts?: string[]
  activeTexts?: Set<string>
}

const DISPLAY_COUNT = 40

// Tailwind JIT 可扫描的字面量类名：前 6 张递增 50ms，第 7 张起统一 250ms
const ENTRANCE_DELAY_CLASSES = [
  '[animation-delay:0ms]',
  '[animation-delay:50ms]',
  '[animation-delay:100ms]',
  '[animation-delay:150ms]',
  '[animation-delay:200ms]',
  '[animation-delay:250ms]',
]
const entranceDelayClass = (index: number) => ENTRANCE_DELAY_CLASSES[Math.min(index, 5)]

// ─────────────────────────────────────────────
// 校验规则：文案与 lib/content-types/*-strategy.ts 保持一致
//   idiom       恰好 4 个汉字 /^[\u4e00-\u9fff]{4}$/
//   poetry      2–30 字          (poetry-strategy.ts)
//   proverb     ≥4 字            (proverb-strategy.ts)
//   nursery-rhyme / fairy-tale ≥2 字
// ─────────────────────────────────────────────
interface CategoryFormUI {
  /** 常驻格式提示 */
  hint: string
  placeholder: string
  /** 空输入的文案 */
  empty: string
  /** 超过该长度时显示 N/max 计数 */
  max?: number
}

const FORM_UI: Record<ContentCategory, CategoryFormUI> = {
  idiom: {
    hint: '格式：4 个汉字，例如 守株待兔',
    placeholder: '守株待兔',
    empty: '只能输入 4 个汉字哦',
    max: 4,
  },
  poetry: {
    hint: '2–30 个字，可含标点，换行分段',
    placeholder: '床前明月光，疑是地上霜',
    empty: '请输入古诗原文',
    max: 30,
  },
  'nursery-rhyme': {
    hint: '至少 2 个字，写歌名也行',
    placeholder: '小星星',
    empty: '请输入儿歌内容',
  },
  proverb: {
    hint: '至少 4 个字，例如 瑞雪兆丰年',
    placeholder: '瑞雪兆丰年',
    empty: '请输入谚语',
  },
  'fairy-tale': {
    hint: '至少 2 个字，写故事名就行',
    placeholder: '小红帽',
    empty: '请输入童话内容',
  },
}

/** 有实际内容的字符（汉字 / 字母 / 数字）；纯标点、纯空白都算「没有内容」 */
const HAS_MEANINGFUL_CHAR = /[\u4e00-\u9fffA-Za-z0-9]/
const CJK_ONLY = /^[\u4e00-\u9fff]+$/

/** 码点计数：emoji / 生僻字不会被算成 2 个 */
const countChars = (text: string) => Array.from(text).length

/**
 * 返回错误文案，null 表示合法。
 * 首调用本地细分规则给出精准文案，最后再用 strategy.validate 兜底，
 * 保证与后端（提交接口）判定完全一致。
 */
function validateContent(category: ContentCategory, raw: string): string | null {
  const ui = FORM_UI[category]
  const strategy = getStrategy(category)
  const text = raw.trim()

  // 从未输入过
  if (raw.length === 0) return ui.empty
  // 只打了空格 / 只打了标点：不要落到「请先选择内容」这种误导文案
  if (text.length === 0 || !HAS_MEANINGFUL_CHAR.test(text)) {
    return `请输入${strategy.label}内容`
  }

  const count = countChars(text)

  switch (category) {
    case 'idiom': {
      if (/[A-Za-z0-9]/.test(text)) return '成语请只输入汉字'
      if (!CJK_ONLY.test(text)) return '只能输入 4 个汉字哦'
      if (count !== 4) return `成语要正好 4 个汉字，现在是 ${count} 个`
      break
    }
    case 'poetry': {
      if (count < 2) return '至少 2 个字'
      if (count > 30) return `最多 30 个字，现在 ${count} 个`
      break
    }
    case 'proverb': {
      if (count < 4) return `谚语至少 4 个字，现在 ${count} 个`
      break
    }
    default: {
      // nursery-rhyme / fairy-tale
      if (count < 2) return '至少 2 个字'
    }
  }

  // 兜底：与后端策略完全一致（例如极端字符长度差异）
  if (!strategy.validate(text)) return `请检查${strategy.label}内容是否符合格式要求`
  return null
}

type SubmitFeedback =
  | { kind: 'success'; submitted: number; duplicate: number }
  | { kind: 'partial'; total: number; failed: number }
  | null

const SKELETON_COUNT = 8

export function ContentSelector({ category, generatedTexts = [], activeTexts = new Set() }: ContentSelectorProps) {
  const [customInput, setCustomInput] = useState('')
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [displayItems, setDisplayItems] = useState<ContentInfo[]>([])
  const [loadingItems, setLoadingItems] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [hint, setHint] = useState('')
  /** 推荐请求失败：常驻错误条（不自动消失），带重试 */
  const [refreshError, setRefreshError] = useState('')
  /** 提交结果：常驻反馈条 */
  const [submitFeedback, setSubmitFeedback] = useState<SubmitFeedback>(null)
  /** 是否已触碰校验（blur 或提交后为 true） */
  const [touched, setTouched] = useState(false)
  /** IME 合成中：一律不校验，否则拼音输入过程会误报「只能输入汉字」 */
  const [composing, setComposing] = useState(false)
  /** 自定义内容会与已选合并的一次性说明 */
  const [mergeHintVisible, setMergeHintVisible] = useState(false)

  const setCurrentIdiom = useAppStore((s) => s.setCurrentIdiom)
  const setCurrentCategory = useAppStore((s) => s.setCurrentCategory)
  const strategy = getStrategy(category)
  const formUI = FORM_UI[category]
  const isLongForm = category === 'poetry'

  const uid = useId()
  const inputId = `${uid}-custom`
  const ruleId = `${uid}-rule`
  const countId = `${uid}-count`
  const errorId = `${uid}-error`

  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mergeHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mergeHintShownRef = useRef(false)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  const showHint = useCallback((message: string) => {
    setHint(message)
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
    hintTimerRef.current = setTimeout(() => setHint(''), 2400)
  }, [])

  useEffect(() => () => {
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current)
    if (mergeHintTimerRef.current) clearTimeout(mergeHintTimerRef.current)
  }, [])

  const loadRecommended = async () => {
    try {
      const random = await getRandomItems(category, DISPLAY_COUNT)
      if (random.length > 0) {
        setDisplayItems(random)
      } else {
        // 没有缓存时使用内置列表
        setDisplayItems(getContentListByCategory(category))
      }
    } catch {
      setDisplayItems(getContentListByCategory(category))
    } finally {
      setLoadingItems(false)
    }
  }

  // 切换品类：重置一切输入态（换品类后旧内容不再适用）
  useEffect(() => {
    setRefreshing(false)
    setHint('')
    setRefreshError('')
    setSubmitFeedback(null)
    setLoadingItems(true)
    setTouched(false)
    setComposing(false)
    setMergeHintVisible(false)
    mergeHintShownRef.current = false
    loadRecommended()
    setSelectedItems(new Set())
    setCustomInput('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category])

  const refreshExcludeRef = useRef<string[]>([])

  // 每次 displayItems 更新时同步到 ref
  useEffect(() => {
    refreshExcludeRef.current = displayItems.map(i => i.sourceText)
  }, [displayItems])

  const handleRefresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    setRefreshError('')
    try {
      // server action 底层 LLM 调用最长 60s，前端额外设 90s 兜底
      const newItems = await Promise.race([
        fetchRecommendations(category, refreshExcludeRef.current),
        new Promise<never>((_, reject) => {
          refreshTimeoutRef.current = setTimeout(() => reject(new Error('请求超时，请稍后重试')), 90_000)
        }),
      ])
      if (newItems.length === 0) {
        throw new Error('未获取到新推荐，请再试一次')
      }
      await saveRecommendedItems(newItems, category)
      const random = await getRandomItems(category, DISPLAY_COUNT)
      if (random.length > 0) setDisplayItems(random)
      // 注意：不清空已选——选择是按文本的，换一批不应该静默丢掉用户的选择
      showHint(`已换一批${strategy.label}`)
    } catch (error) {
      console.error(`获取推荐${strategy.label}失败:`, error)
      // 不自动消失，给「重试」入口
      setRefreshError(error instanceof Error ? error.message : `获取推荐${strategy.label}失败`)
    } finally {
      // 请求已 settle：清掉 90s 兜底 timer，避免最长 90s 的悬挂定时器
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
        refreshTimeoutRef.current = null
      }
      setRefreshing(false)
    }
  }, [category, strategy.label, refreshing, showHint])

  const handleToggleSelect = (text: string, isActive: boolean, isGenerated: boolean) => {
    if (isActive) {
      showHint('该内容分析中，暂时不能选择')
      return
    }
    if (isGenerated) {
      showHint('该内容已生成绘本，换一个试试吧')
      return
    }
    setSelectedItems(prev => {
      const next = new Set(prev)
      if (next.has(text)) { next.delete(text) } else { next.add(text) }
      return next
    })
    setSubmitFeedback(null)
  }

  const availableItems = useMemo(() =>
    displayItems
      .map(i => i.sourceText)
      .filter(t => !activeTexts.has(t) && !generatedTexts.includes(t)),
    [displayItems, activeTexts, generatedTexts]
  )

  const trimmedCustom = customInput.trim()
  /** 只在「确实输入了内容」时显示错误：清空输入框不该继续报错 */
  const customError = touched && !composing && customInput.length > 0 ? validateContent(category, customInput) : null
  const customCount = countChars(trimmedCustom)

  /** 自定义内容与已有数据/队列的冲突（不打断输入，只提示并阻止重复提交该项） */
  const customConflict = useMemo(() => {
    if (trimmedCustom === '') return null
    if (activeTexts.has(trimmedCustom)) return { kind: 'active' as const, message: '这个内容正在分析中，稍等一下' }
    if (generatedTexts.includes(trimmedCustom)) return { kind: 'generated' as const, message: '这本已经生成过了，换个内容吧' }
    if (selectedItems.has(trimmedCustom)) return { kind: 'selected' as const, message: '已经选中过了' }
    return null
  }, [trimmedCustom, activeTexts, generatedTexts, selectedItems])

  const customBlocksSubmit = customConflict?.kind === 'active' || customConflict?.kind === 'generated'
  const customEligible =
    trimmedCustom !== '' && validateContent(category, customInput) === null && !customBlocksSubmit

  /** 自定义内容与多选合并去重（不再静默清空已选） */
  const submitTexts = useMemo(() => {
    const set = new Set(selectedItems)
    if (customEligible) set.add(trimmedCustom)
    return Array.from(set)
  }, [selectedItems, customEligible, trimmedCustom])

  const canSubmit = submitTexts.length > 0 || trimmedCustom !== ''
  const allSelected = availableItems.length > 0 && availableItems.every(t => selectedItems.has(t))

  const handleToggleAll = () => {
    setSubmitFeedback(null)
    setSelectedItems(allSelected ? new Set() : new Set(availableItems))
  }

  const handleClearSelected = () => {
    const cleared = selectedItems.size
    setSelectedItems(new Set())
    setSubmitFeedback(null)
    if (cleared > 0) showHint(`已清空 ${cleared} 个选择`)
  }

  const handleStart = async () => {
    // 防重复提交：按钮 disabled 之外再加一道逻辑闸门（键盘/程序化触发同样生效）
    if (submitting) return

    // 1) 自定义内容格式不合法：标记校验并聚焦，不提交
    if (trimmedCustom !== '' && validateContent(category, customInput) !== null) {
      setTouched(true)
      inputRef.current?.focus()
      return
    }
    const texts = submitTexts
    // 2) 什么都没选：触发校验并聚焦（可能是空输入）
    if (texts.length === 0) {
      setTouched(true)
      inputRef.current?.focus()
      return
    }

    setMergeHintVisible(false)
    setCurrentIdiom(texts[0])
    setCurrentCategory(category)
    setSubmitting(true)
    setSubmitFeedback(null)
    try {
      const results = await Promise.allSettled(texts.map(t => createJobAPI(t, category)))
      let duplicate = 0
      let failed = 0
      for (const r of results) {
        if (r.status === 'fulfilled') {
          if (r.value?.duplicate) duplicate += 1
        } else {
          failed += 1
        }
      }
      if (failed > 0) {
        // 部分/全部失败：保留已选项与输入，避免用户数据丢失
        setSubmitFeedback({ kind: 'partial', total: texts.length, failed })
        return
      }
      setSelectedItems(new Set())
      setCustomInput('')
      setTouched(false)
      setSubmitFeedback({ kind: 'success', submitted: texts.length - duplicate, duplicate })
    } catch (error) {
      console.error('提交任务失败:', error)
      // 失败不清理 selections / customInput
      setSubmitFeedback({ kind: 'partial', total: texts.length, failed: texts.length })
    } finally {
      setSubmitting(false)
    }
  }

  /** 首次在自定义框输入：一次性说明「会和上面选中的一起生成」 */
  const revealMergeHint = () => {
    if (mergeHintShownRef.current) return
    mergeHintShownRef.current = true
    setMergeHintVisible(true)
    if (mergeHintTimerRef.current) clearTimeout(mergeHintTimerRef.current)
    mergeHintTimerRef.current = setTimeout(() => setMergeHintVisible(false), 4000)
  }

  const handleCustomChange = (value: string) => {
    setCustomInput(value)
    setSubmitFeedback(null)
    if (value.trim() !== '') revealMergeHint()
  }

  const describedBy = [ruleId, countId, customError ? errorId : null].filter(Boolean).join(' ')

  const counterText = formUI.max ? `${customCount}/${formUI.max}` : `${customCount} 个字`

  // ── 推荐网格 ──
  const grid = (
    <div
      className={`grid grid-cols-3 sm:grid-cols-4 gap-1.5 overflow-y-auto overflow-x-hidden pr-1 h-[220px] ${
        refreshing ? 'opacity-60 pointer-events-none' : ''
      } ${submitting ? 'pointer-events-none' : ''}`}
      aria-busy={refreshing || submitting || undefined}
    >
      {loadingItems
        ? Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <div key={`sk-${i}`} className="min-h-[52px] rounded-inner bg-ink/[.06] animate-pulse" />
          ))
        : displayItems.map((item, index) => {
            const isGenerated = generatedTexts.includes(item.sourceText)
            const isActive = activeTexts.has(item.sourceText)
            const isSelected = selectedItems.has(item.sourceText)
            const isDisabled = isGenerated || isActive
            const meta = [item.dynasty, item.author].filter(Boolean).join(' ')

            let btnClass: string
            let badge: string | null = null
            let badgeClass = ''
            if (isActive) {
              btnClass = 'border-[1.5px] border-transparent bg-ink/[.035] text-ink/40 cursor-not-allowed'
              badge = '分析中'
              badgeClass = 'bg-[var(--info-soft)] text-[var(--info)]'
            } else if (isGenerated) {
              btnClass = 'border-[1.5px] border-transparent bg-ink/[.035] text-ink/40 cursor-not-allowed'
              badge = '已生成'
              badgeClass = 'bg-ink/[.08] text-[var(--text-muted)]'
            } else if (isSelected) {
              btnClass = 'border-[1.5px] border-[var(--brand-strong)] bg-[var(--brand-strong-soft)] text-[var(--brand-strong)]'
            } else {
              btnClass = 'border-[1.5px] border-transparent bg-ink/[.03] text-ink hover:bg-ink/[.07]'
            }

            return (
              <div key={item.sourceText} className={`animate-fade-up ${entranceDelayClass(index)}`}>
                <button
                  type="button"
                  onClick={() => handleToggleSelect(item.sourceText, isActive, isGenerated)}
                  aria-pressed={isSelected}
                  aria-disabled={isDisabled || undefined}
                  // 移动端没有 title：禁用原因写进可访问名
                  aria-label={isDisabled ? `${item.sourceText}，${badge}，暂时不能选择` : undefined}
                  className={`relative w-full min-h-[52px] py-2 pl-1.5 pr-2 rounded-inner text-[12.5px] font-medium leading-[1.25] transition-colors duration-normal flex flex-col items-center justify-center focus-ring ${btnClass}`}
                >
                  <span className="line-clamp-2 break-words w-full text-center">{item.sourceText}</span>
                  {meta && (
                    <span className="block w-full text-center text-[10px] opacity-70 mt-0.5 line-clamp-1">{meta}</span>
                  )}
                  {isSelected && (
                    <span
                      aria-hidden="true"
                      className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[var(--brand-strong)] text-white text-[10px] flex items-center justify-center animate-fade-in"
                    >
                      ✓
                    </span>
                  )}
                  {/* 角标落在格内（不用 -top/-right 外挂，避免被 overflow 裁切） */}
                  {badge && (
                    <span className={`mt-0.5 inline-block text-[9px] leading-none px-1 py-0.5 rounded-full ${badgeClass}`}>
                      {badge}
                    </span>
                  )}
                </button>
              </div>
            )
          })}
    </div>
  )

  // ── 推荐区兜底：空列表 ──
  const emptyRecommendation = !loadingItems && displayItems.length === 0 && (
    <button
      type="button"
      onClick={() => inputRef.current?.focus()}
      className="w-full rounded-inner bg-[var(--warn-soft)] px-3 py-2 text-left text-[12px] text-[var(--warn)] focus-ring"
    >
      没拿到推荐内容，手动输入也可以 👇
    </button>
  )

  // ── 换一批 ──
  const refreshButton = (extraClass: string) => (
    <button
      type="button"
      onClick={handleRefresh}
      disabled={refreshing}
      aria-busy={refreshing || undefined}
      aria-label={`换一批${strategy.label}推荐`}
      className={`flex items-center gap-1 rounded-button text-xs text-[var(--text-muted)] hit-44 hover:text-[var(--brand-strong)] hover:bg-ink/[.04] transition-colors duration-fast disabled:opacity-50 disabled:cursor-not-allowed focus-ring ${extraClass}`}
    >
      <span className={refreshing ? 'animate-spin inline-block' : 'inline-block'} aria-hidden="true">🔄</span>
      {refreshing ? '获取中…' : '换一批'}
    </button>
  )

  // ── 推荐失败：常驻错误条 + 重试（不自动消失） ──
  const refreshErrorBar = refreshError ? (
    <div
      role="status"
      className="mt-2 flex items-start justify-between gap-2 rounded-inner bg-[var(--danger-soft)] px-3 py-2 text-[12px] text-[var(--danger)]"
    >
      <span>⚠ 推荐没拿到：{refreshError}</span>
      <button
        type="button"
        onClick={handleRefresh}
        disabled={refreshing}
        className="shrink-0 underline underline-offset-2 font-medium disabled:opacity-50 focus-ring rounded-inner"
      >
        重试
      </button>
    </div>
  ) : null

  // ── 提交反馈 ──
  const submitFeedbackBar = submitFeedback?.kind === 'success' ? (
    <div
      role="status"
      className="rounded-inner bg-[var(--success-soft)] px-3 py-2 text-[12px] text-[var(--success)] space-y-0.5"
    >
      <p className="font-medium">
        {submitFeedback.submitted > 0
          ? `✅ 已提交 ${submitFeedback.submitted} 个任务`
          : '✅ 这些都已经在队列里了'}
        {' · '}
        <Link href="/tasks" className="underline underline-offset-2 focus-ring rounded-inner">
          去任务中心看进度 →
        </Link>
      </p>
      <p className="text-[11px] opacity-90">任务已加入队列，可以关掉页面 · 画好后会在这个设备上通知你</p>
      {submitFeedback.duplicate > 0 && submitFeedback.submitted > 0 && (
        <p className="text-[11px] text-[var(--text-muted)]">
          {submitFeedback.duplicate} 个已经在队列里了，不重复提交
        </p>
      )}
    </div>
  ) : submitFeedback?.kind === 'partial' ? (
    <div
      role="alert"
      className="flex items-center justify-between gap-2 rounded-inner bg-[var(--danger-soft)] px-3 py-2 text-[12px] text-[var(--danger)]"
    >
      <span>
        {submitFeedback.failed === submitFeedback.total
          ? `${submitFeedback.total} 个都没提交成功，已保留你的选择`
          : `${submitFeedback.total} 个里有 ${submitFeedback.failed} 个提交失败，已保留你的选择`}
      </span>
      <button
        type="button"
        onClick={handleStart}
        disabled={submitting}
        className="shrink-0 underline underline-offset-2 font-medium disabled:opacity-50 focus-ring rounded-inner"
      >
        重试
      </button>
    </div>
  ) : null

  // ── 自定义输入 ──
  const customField = (
    <div className="space-y-1.5">
      <div className="flex items-start gap-2">
        {isLongForm ? (
          <textarea
            ref={(el) => { inputRef.current = el }}
            id={inputId}
            rows={3}
            value={customInput}
            onChange={(e) => handleCustomChange(e.target.value)}
            onBlur={() => { if (customInput.trim() !== '') setTouched(true) }}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            placeholder={formUI.placeholder}
            aria-label={`自定义${strategy.label}`}
            aria-invalid={customError ? true : undefined}
            aria-describedby={describedBy}
            autoComplete="off"
            spellCheck={false}
            disabled={submitting}
            className={`flex-1 min-w-0 px-3 py-2.5 rounded-inner bg-white text-sm text-[var(--text-ink)] placeholder:text-ink-mute/70 border border-[var(--hairline)] focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-[var(--brand-strong)] transition-all duration-fast resize-y disabled:opacity-60 ${
              customError ? '[box-shadow:inset_0_0_0_2px_var(--danger)]' : ''
            }`}
          />
        ) : (
          <input
            ref={(el) => { inputRef.current = el }}
            id={inputId}
            type="text"
            value={customInput}
            onChange={(e) => handleCustomChange(e.target.value)}
            onBlur={() => { if (customInput.trim() !== '') setTouched(true) }}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            placeholder={formUI.placeholder}
            aria-label={`自定义${strategy.label}`}
            aria-invalid={customError ? true : undefined}
            aria-describedby={describedBy}
            autoComplete="off"
            spellCheck={false}
            disabled={submitting}
            className={`flex-1 min-w-0 h-11 px-3 rounded-inner bg-white text-sm text-[var(--text-ink)] placeholder:text-ink-mute/70 border border-[var(--hairline)] focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-[var(--brand-strong)] transition-all duration-fast disabled:opacity-60 ${
              customError ? '[box-shadow:inset_0_0_0_2px_var(--danger)]' : ''
            }`}
          />
        )}
        <button
          type="button"
          onClick={handleStart}
          disabled={submitting || !canSubmit}
          aria-busy={submitting || undefined}
          className="shrink-0 h-11 px-3.5 bg-primary text-ink rounded-button text-sm font-semibold hover:bg-primary/90 active:scale-[0.97] transition-all duration-fast disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap focus-ring"
        >
          {submitting
            ? '⏳ 提交中…'
            : submitTexts.length > 0
              ? `🚀 生成 ${submitTexts.length} 个`
              : '🚀 开始生成'}
        </button>
      </div>

      {/* 常驻规则 + 中性计数（计数器每键变化，不能播报） */}
      <div className="flex items-start justify-between gap-2">
        <p id={ruleId} className="text-[11px] leading-snug text-[var(--text-muted)]">{formUI.hint}</p>
        <span id={countId} aria-live="off" className="shrink-0 text-[11px] tabular-nums text-[var(--text-muted)]">
          {counterText}
        </span>
      </div>

      {/* 错误插槽：touched 后常驻（节点保留，只换内容，避免跳动） */}
      {touched && (
        <p
          id={errorId}
          role={customError ? 'alert' : undefined}
          className="min-h-[16px] text-[12px] text-[var(--danger)]"
        >
          {customError && <>⚠ {customError}</>}
        </p>
      )}

      {/* 冲突提示（不打断输入） */}
      {customConflict && (
        <p
          role="status"
          className={`text-[11px] ${
            customBlocksSubmit ? 'text-[var(--warn)]' : 'text-[var(--text-muted)]'
          }`}
        >
          {customConflict.message}
        </p>
      )}

      {/* 一次性合并说明 */}
      {mergeHintVisible && (
        <small className="block text-[11px] text-[var(--text-muted)]">
          自定义内容会和上面选中的一起生成
        </small>
      )}
    </div>
  )

  return (
    <div
      id={`selector-panel-${category}`}
      role="tabpanel"
      aria-labelledby={`tab-${category}`}
      className="w-full bg-white rounded-card p-4 shadow-card"
    >
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-base font-semibold text-[var(--text-ink)]">{strategy.icon} 选择{strategy.label}</h2>
        {refreshButton('px-2 py-2 -my-1')}
      </div>

      {grid}
      {emptyRecommendation}
      {refreshErrorBar}

      <div className="space-y-2 mt-3">
        <div className="flex items-center justify-between gap-2">
          {selectedItems.size > 0 ? (
            <button
              type="button"
              onClick={handleClearSelected}
              className="text-xs text-[var(--brand-strong)] hover:underline underline-offset-2 hit-44 transition-colors duration-fast focus-ring rounded-inner"
            >
              🗑 清空已选
            </button>
          ) : (
            <button
              type="button"
              onClick={handleToggleAll}
              disabled={availableItems.length === 0 || loadingItems}
              className="text-xs text-[var(--brand-strong)] hover:underline underline-offset-2 min-h-11 inline-flex items-center transition-colors duration-fast disabled:opacity-50 disabled:no-underline focus-ring rounded-inner"
            >
              ☑ 全选可用
            </button>
          )}
          <span aria-live="polite" className="text-xs text-[var(--text-muted)]">
            已选 {selectedItems.size} 个
          </span>
        </div>

        {hint && (
          <p role="status" className="text-[11px] text-[var(--warn)] animate-fade-in">{hint}</p>
        )}

        {customField}
        {submitFeedbackBar}
      </div>
    </div>
  )
}
