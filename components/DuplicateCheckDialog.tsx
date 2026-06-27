'use client'

import { useState } from 'react'

interface DuplicateCheckDialogProps {
  idiom: string
  onViewExisting: () => void
  onRegenerate: () => void
  onClose: () => void
}

export function DuplicateCheckDialog({
  idiom,
  onViewExisting,
  onRegenerate,
  onClose,
}: DuplicateCheckDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-card p-6 max-w-md w-full mx-4 shadow-xl">
        {/* 标题 */}
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">📚</div>
          <h2 className="text-xl font-bold text-gray-800">
            绘本已存在
          </h2>
          <p className="text-gray-600 mt-2">
            「{idiom}」的绘本已经在你的书架中了
          </p>
        </div>

        {/* 操作按钮 */}
        <div className="flex flex-col gap-3">
          <button
            onClick={onViewExisting}
            className="w-full py-3 bg-primary text-white rounded-button font-medium hover:bg-primary/90 transition-colors"
          >
            📖 查看已有绘本
          </button>
          <button
            onClick={onRegenerate}
            className="w-full py-3 bg-gray-100 text-gray-700 rounded-button font-medium hover:bg-gray-200 transition-colors"
          >
            🔄 重新生成
          </button>
          <button
            onClick={onClose}
            className="w-full py-2 text-gray-500 hover:text-gray-700 transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
