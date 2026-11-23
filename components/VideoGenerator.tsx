'use client'

import { useEffect, useState } from 'react'
import { generateBookVideo } from '@/app/actions/generate'

interface VideoGeneratorProps {
  imageUrls: string[]
  onVideoGenerated: (videoUrl: string) => void
}

/** 超过这个秒数，额外提示"可以先去做别的"（API 预期 2-5 分钟） */
const SLOW_HINT_AFTER = 300

export function VideoGenerator({
  imageUrls,
  onVideoGenerated,
}: VideoGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 长任务心跳：5 分钟里界面若一个像素都不变，用户会以为死机去刷新
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!isGenerating) {
      setElapsed(0)
      return
    }
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [isGenerating])

  const handleGenerate = async () => {
    setIsGenerating(true)
    setError(null)

    try {
      const { videoUrl } = await generateBookVideo(imageUrls)
      onVideoGenerated(videoUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : '视频生成失败')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={handleGenerate}
        disabled={isGenerating}
        aria-busy={isGenerating}
        className="min-h-11 px-6 py-3 bg-gradient-to-r from-primary to-accent text-ink rounded-button font-semibold shadow-card [@media(hover:hover)]:hover:shadow-cardHover transition-all duration-fast ease-standard active:scale-[0.97] focus-ring disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isGenerating ? '⏳ 生成中...' : '🎬 生成视频'}
      </button>

      {isGenerating && (
        // 分工：外层 BookViewer 常驻"2-5 分钟 / 不能切走"的前置警告（静态、生成前就可见），
        // 这里只报"变化中的东西"——已等待时长，不再重复预计时间。
        // role="status" → 隐式 aria-live="polite"；但秒数每秒都变，若落在 live 区域内会
        // 变成"每秒播报一次"，所以给心跳行单独声明 aria-live="off"（视觉保留、不进播报队列）。
        // 背景是 bg-info-soft（彩色 soft 底），文字必须用 text-ink-body：ink-mute 在这类底上只有 4.19:1
        <div role="status" className="bg-info-soft rounded-card p-4 text-center animate-fade-up">
          <p className="text-info font-medium">正在生成视频，请稍候...</p>
          <p aria-live="off" className="text-sm text-ink-body mt-1 tabular-nums">
            已等待 {elapsed} 秒
          </p>
          {elapsed >= SLOW_HINT_AFTER && (
            <p className="text-sm text-ink-body mt-1">
              比预期久，可以先去做别的，生成完会出现在这里
            </p>
          )}
        </div>
      )}

      {error && (
        // role="alert" → 隐式 aria-live="assertive"
        <div role="alert" className="bg-danger-soft rounded-card p-4 animate-fade-up">
          <p className="font-semibold text-danger">视频生成失败</p>
          <p className="text-sm text-ink-body mt-1 break-words">{error}</p>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="mt-3 min-h-11 px-4 rounded-button bg-white text-danger border border-danger/30 font-medium [@media(hover:hover)]:hover:bg-danger-soft transition-colors duration-fast focus-ring disabled:opacity-50 disabled:cursor-not-allowed"
          >
            再试一次
          </button>
        </div>
      )}
    </div>
  )
}
