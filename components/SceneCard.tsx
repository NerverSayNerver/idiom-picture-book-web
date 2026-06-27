'use client'

import { useState } from 'react'
import type { Scene } from '@/lib/types'

interface SceneCardProps {
  scene: Scene
  status: 'waiting' | 'generating' | 'completed'
}

export function SceneCard({ scene, status }: SceneCardProps) {
  const [copied, setCopied] = useState(false)

  const statusConfig = {
    waiting: {
      bg: 'bg-gray-100',
      icon: '⏸️',
      text: '等待中',
      textColor: 'text-gray-500',
    },
    generating: {
      bg: 'bg-yellow-50',
      icon: '⏳',
      text: '生成中...',
      textColor: 'text-yellow-600',
    },
    completed: {
      bg: 'bg-green-50',
      icon: '✅',
      text: '已完成',
      textColor: 'text-green-600',
    },
  }

  const config = statusConfig[status]

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(scene.prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
      const textArea = document.createElement('textarea')
      textArea.value = scene.prompt
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className={`${config.bg} rounded-card p-4 transition-all`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{config.icon}</span>
          <span className={`text-sm font-medium ${config.textColor}`}>
            {config.text}
          </span>
        </div>
        <button
          onClick={handleCopyPrompt}
          className="text-xs px-2 py-1 bg-white/80 rounded hover:bg-white transition-colors text-gray-600"
          title="复制提示词"
        >
          {copied ? '✅ 已复制' : '📋 复制提示词'}
        </button>
      </div>
      <h3 className="font-semibold text-gray-800">{scene.title}</h3>
      <p className="text-sm text-gray-600 mt-1 line-clamp-2">
        {scene.description}
      </p>
    </div>
  )
}
