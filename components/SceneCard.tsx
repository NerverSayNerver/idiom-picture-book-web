'use client'

import type { Scene } from '@/lib/types'

interface SceneCardProps {
  scene: Scene
  status: 'waiting' | 'generating' | 'completed'
}

export function SceneCard({ scene, status }: SceneCardProps) {
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

  return (
    <div className={`${config.bg} rounded-card p-4 transition-all`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{config.icon}</span>
        <span className={`text-sm font-medium ${config.textColor}`}>
          {config.text}
        </span>
      </div>
      <h3 className="font-semibold text-gray-800">{scene.title}</h3>
      <p className="text-sm text-gray-600 mt-1 line-clamp-2">
        {scene.description}
      </p>
    </div>
  )
}
