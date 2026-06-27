'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

interface UseTTSReturn {
  isPlaying: boolean
  isPaused: boolean
  rate: number
  currentCharIndex: number
  speak: (text: string) => void
  stop: () => void
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

export function useTTS(): UseTTSReturn {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [currentCharIndex, setCurrentCharIndex] = useState(-1)
  const [rate, setRateState] = useState(() => {
    if (typeof window === 'undefined') return 1.0
    const saved = localStorage.getItem(RATE_STORAGE_KEY)
    return saved ? parseFloat(saved) : 1.0
  })

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const sceneQueueRef = useRef<Array<{ narration: string }>>([])
  const sceneIndexRef = useRef(0)
  const onSceneEndRef = useRef<((index: number) => void) | null>(null)
  const isContinuousRef = useRef(false)

  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

  // 选择中文语音
  const selectVoice = useCallback(() => {
    if (!isSupported) return null
    const voices = window.speechSynthesis.getVoices()
    return voices.find(v => v.lang.startsWith('zh')) || voices[0] || null
  }, [isSupported])

  const stop = useCallback(() => {
    if (!isSupported) return
    window.speechSynthesis.cancel()
    setIsPlaying(false)
    setIsPaused(false)
    setCurrentCharIndex(-1)
    isContinuousRef.current = false
    utteranceRef.current = null
  }, [isSupported])

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
      // 延迟一下再读下一页，给翻页动画时间
      setTimeout(() => {
        if (isContinuousRef.current) {
          speakNextScene()
        }
      }, 500)
    }

    utterance.onerror = () => {
      stop()
    }

    utteranceRef.current = utterance
    window.speechSynthesis.speak(utterance)
  }, [rate, selectVoice, stop])

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

    utterance.onerror = () => {
      stop()
    }

    utteranceRef.current = utterance
    setIsPlaying(true)
    window.speechSynthesis.speak(utterance)
  }, [isSupported, rate, selectVoice, stop])

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

  // 组件卸载时停止朗读
  useEffect(() => {
    return () => {
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
    togglePause,
    setRate,
    speakScenes,
    isSupported,
  }
}
