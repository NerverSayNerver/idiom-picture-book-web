'use client'

import { useState } from 'react'
import type { Scene } from '@/lib/types'

interface SceneCardProps {
  scene: Scene
  status: 'waiting' | 'generating' | 'completed'
}

export function SceneCard({ scene, status }: SceneCardProps) {
  const [copied, setCopied] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)

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
      // Fallback: 使用已废弃的 execCommand（仅在 clipboard API 不可用时）
      try {
        const textArea = document.createElement('textarea')
        textArea.value = scene.prompt
        textArea.style.position = 'fixed'
        textArea.style.opacity = '0'
        document.body.appendChild(textArea)
        textArea.select()
        // execCommand 已废弃，但作为 clipboard API 不可用时的 fallback
        document.execCommand('copy')
        document.body.removeChild(textArea)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        // 两种方式都失败，静默处理
      }
    }
  }

  const handleViewPrompt = () => {
    setShowPrompt(true)
  }

  const handleClosePrompt = () => {
    setShowPrompt(false)
  }

  return (
    <>
      <div className={`${config.bg} rounded-card p-4 transition-all`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">{config.icon}</span>
            <span className={`text-sm font-medium ${config.textColor}`}>
              {config.text}
            </span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={handleViewPrompt}
              className="text-xs px-2 py-1 bg-white/80 rounded hover:bg-white transition-colors text-gray-600"
              title="查看提示词"
            >
              👁️ 查看提示词
            </button>
            <button
              onClick={handleCopyPrompt}
              className="text-xs px-2 py-1 bg-white/80 rounded hover:bg-white transition-colors text-gray-600"
              title="复制提示词"
            >
              {copied ? '✅ 已复制' : '📋 复制'}
            </button>
          </div>
        </div>
        <h3 className="font-semibold text-gray-800">{scene.title}</h3>
        <p className="text-sm text-gray-600 mt-1 line-clamp-2">
          {scene.description}
        </p>
      </div>

      {/* 提示词查看弹窗 */}
      {showPrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-card p-6 max-w-2xl w-full mx-4 shadow-xl max-h-[80vh] overflow-hidden flex flex-col">
            {/* 标题 */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">
                📝 提示词详情
              </h2>
              <button
                onClick={handleClosePrompt}
                className="text-gray-500 hover:text-gray-700 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* 场景信息 */}
            <div className="mb-4">
              <h3 className="font-semibold text-gray-700 mb-1">
                场景标题：{scene.title}
              </h3>
              <p className="text-sm text-gray-600">
                {scene.description}
              </p>
            </div>

            {/* 提示词内容 */}
            <div className="flex-1 overflow-auto">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">英文提示词</span>
                  <button
                    onClick={handleCopyPrompt}
                    className="text-xs px-2 py-1 bg-white rounded hover:bg-gray-100 transition-colors text-gray-600"
                  >
                    {copied ? '✅ 已复制' : '📋 复制'}
                  </button>
                </div>
                <p className="text-sm text-gray-800 font-mono whitespace-pre-wrap">
                  {scene.prompt}
                </p>
              </div>
            </div>

            {/* 关闭按钮 */}
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleClosePrompt}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-button hover:bg-gray-200 transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
