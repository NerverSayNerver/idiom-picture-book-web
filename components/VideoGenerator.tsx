'use client'

import { useState } from 'react'
import { generateBookVideo } from '@/app/actions/generate'

interface VideoGeneratorProps {
  imageUrls: string[]
  onVideoGenerated: (videoUrl: string) => void
}

export function VideoGenerator({
  imageUrls,
  onVideoGenerated,
}: VideoGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    setIsGenerating(true)
    setError(null)

    try {
      const { videoId } = await generateBookVideo(imageUrls)
      onVideoGenerated(videoId)
    } catch (err) {
      setError(err instanceof Error ? err.message : '视频生成失败')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="space-y-4">
      <button
        onClick={handleGenerate}
        disabled={isGenerating}
        className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-button font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
      >
        {isGenerating ? '⏳ 生成中...' : '🎬 生成视频'}
      </button>

      {isGenerating && (
        <div className="bg-purple-50 rounded-card p-4 text-center">
          <p className="text-purple-700">正在生成视频，请稍候...</p>
          <p className="text-sm text-purple-500 mt-1">预计需要 2-5 分钟</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 rounded-card p-4 text-red-700">
          ❌ {error}
        </div>
      )}
    </div>
  )
}
