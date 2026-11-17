'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

/** 可选配置；不传时行为与旧版完全一致（向后兼容） */
interface UseTTSOptions {
  /** 真实朗读失败时触发；由 stop()/系统抢占造成的 canceled/interrupted 不会触发 */
  onError?: () => void
}

interface UseTTSReturn {
  isPlaying: boolean
  isPaused: boolean
  rate: number
  currentCharIndex: number
  speak: (text: string) => void
  stop: () => void
  /** 仅清除逐字高亮，不打断当前朗读（翻页落定时调用） */
  clearHighlight: () => void
  togglePause: () => void
  setRate: (rate: number) => void
  speakScenes: (
    scenes: Array<{ narration: string }>,
    startIndex: number,
    onSceneEnd: (index: number) => void
  ) => void
  isSupported: boolean
}

const RATE_STORAGE_KEY = 'tts-rate'

/** 场景间留白：3D 半页翻页 560ms + 60ms 余量，避免新页朗读覆盖翻页动画 */
const SCENE_FLIP_GAP_MS = 620

export function useTTS(options: UseTTSOptions = {}): UseTTSReturn {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [currentCharIndex, setCurrentCharIndex] = useState(-1)
  // SSR/CSR 一致：初始值固定 1.0，存储值在挂载后的 effect 里读
  const [rate, setRateState] = useState(1.0)
  useEffect(() => {
    const saved = localStorage.getItem(RATE_STORAGE_KEY)
    if (saved) {
      const parsed = parseFloat(saved)
      if (!Number.isNaN(parsed)) setRateState(parsed)
    }
  }, [])

  // 场景间 620ms 间隔 timer；必须可取消，否则用户离开页面后仍会再次朗读
  const sceneTimerRef = useRef<number | null>(null)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const sceneQueueRef = useRef<Array<{ narration: string }>>([])
  const sceneIndexRef = useRef(0)
  const onSceneEndRef = useRef<((index: number) => void) | null>(null)
  const isContinuousRef = useRef(false)
  // 用 ref 保存回调，避免把 onError 变化带入 speakNextScene 的依赖链导致重朗读
  const onErrorRef = useRef(options.onError)
  useEffect(() => { onErrorRef.current = options.onError }, [options.onError])

  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

  // 选择中文语音
  const selectVoice = useCallback(() => {
    if (!isSupported) return null
    const voices = window.speechSynthesis.getVoices()
    return voices.find(v => v.lang.startsWith('zh')) || voices[0] || null
  }, [isSupported])

  const stop = useCallback(() => {
    // 先清掉场景间隔 timer，哪怕 speechSynthesis 不可用也要清
    if (sceneTimerRef.current !== null) {
      clearTimeout(sceneTimerRef.current)
      sceneTimerRef.current = null
    }
    if (!isSupported) return
    window.speechSynthesis.cancel()
    setIsPlaying(false)
    setIsPaused(false)
    setCurrentCharIndex(-1)
    isContinuousRef.current = false
    utteranceRef.current = null
  }, [isSupported])

  /** 翻页落定时把逐字高亮复位为普通态（不 cancel 正在进行的朗读） */
  const clearHighlight = useCallback(() => {
    setCurrentCharIndex(-1)
  }, [])

  /**
   * 统一 onerror：
   * - stop()/系统抢占产生的 canceled / interrupted 属于静默行为，直接吞掉
   * - 其它真实失败：停止朗读并通过可选 onError 通知调用方展示提示
   */
  const handleUtteranceError = useCallback((e: SpeechSynthesisErrorEvent) => {
    const kind = e && e.error
    if (kind === 'canceled' || kind === 'interrupted') return
    stop()
    onErrorRef.current?.()
  }, [stop])

  const speakNextScene = useCallback(() => {
    const queue = sceneQueueRef.current
    const idx = sceneIndexRef.current

    if (idx >= queue.length) {
      stop()
      return
    }

    const text = queue[idx].narration
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = rate

    const voice = selectVoice()
    if (voice) utterance.voice = voice

    utterance.onboundary = (e) => {
      setCurrentCharIndex(e.charIndex)
    }

    utterance.onend = () => {
      if (onSceneEndRef.current) {
        onSceneEndRef.current(idx)
      }
      sceneIndexRef.current = idx + 1
      // 等 3D 半页翻页（560ms）完成再加 60ms 余量，避免新场景朗读与翻页动画抢拍
      if (sceneTimerRef.current !== null) clearTimeout(sceneTimerRef.current)
      sceneTimerRef.current = window.setTimeout(() => {
        sceneTimerRef.current = null
        if (isContinuousRef.current) {
          speakNextScene()
        }
      }, SCENE_FLIP_GAP_MS)
    }

    utterance.onerror = handleUtteranceError

    utteranceRef.current = utterance
    window.speechSynthesis.speak(utterance)
  }, [rate, selectVoice, stop, handleUtteranceError])

  const speak = useCallback((text: string) => {
    if (!isSupported) return
    stop()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = rate

    const voice = selectVoice()
    if (voice) utterance.voice = voice

    utterance.onboundary = (e) => {
      setCurrentCharIndex(e.charIndex)
    }

    utterance.onend = () => {
      setIsPlaying(false)
      setCurrentCharIndex(-1)
    }

    utterance.onerror = handleUtteranceError

    utteranceRef.current = utterance
    setIsPlaying(true)
    window.speechSynthesis.speak(utterance)
  }, [isSupported, rate, selectVoice, stop, handleUtteranceError])

  const speakScenes = useCallback((
    scenes: Array<{ narration: string }>,
    startIndex: number,
    onSceneEnd: (index: number) => void
  ) => {
    if (!isSupported || scenes.length === 0) return
    stop()

    sceneQueueRef.current = scenes
    sceneIndexRef.current = startIndex
    onSceneEndRef.current = onSceneEnd
    isContinuousRef.current = true

    setIsPlaying(true)
    speakNextScene()
  }, [isSupported, stop, speakNextScene])

  const togglePause = useCallback(() => {
    if (!isSupported) return
    if (isPaused) {
      window.speechSynthesis.resume()
      setIsPaused(false)
    } else {
      window.speechSynthesis.pause()
      setIsPaused(true)
    }
  }, [isSupported, isPaused])

  const setRate = useCallback((newRate: number) => {
    setRateState(newRate)
    localStorage.setItem(RATE_STORAGE_KEY, String(newRate))
  }, [])

  // 组件卸载时停止朗读并撤销尚未触发的场景间隔 timer
  useEffect(() => {
    return () => {
      if (sceneTimerRef.current !== null) {
        clearTimeout(sceneTimerRef.current)
        sceneTimerRef.current = null
      }
      isContinuousRef.current = false
      if (isSupported) {
        window.speechSynthesis.cancel()
      }
    }
  }, [isSupported])

  return {
    isPlaying,
    isPaused,
    rate,
    currentCharIndex,
    speak,
    stop,
    clearHighlight,
    togglePause,
    setRate,
    speakScenes,
    isSupported,
  }
}
