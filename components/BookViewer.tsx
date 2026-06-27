'use client'

import { useState, useCallback, useEffect } from 'react'
import type { PictureBook } from '@/lib/types'

interface BookViewerProps {
  book: PictureBook
}

export function BookViewer({ book }: BookViewerProps) {
  const [currentPage, setCurrentPage] = useState(0)
  const totalScenes = book.scenes.length

  const goToNext = useCallback(() => {
    setCurrentPage((prev) => Math.min(prev + 1, totalScenes - 1))
  }, [totalScenes])

  const goToPrev = useCallback(() => {
    setCurrentPage((prev) => Math.max(prev - 1, 0))
  }, [])

  // 键盘事件
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        goToNext()
      } else if (e.key === 'ArrowLeft') {
        goToPrev()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goToNext, goToPrev])

  const scene = book.scenes[currentPage]
  const imageSrc = scene.imageUrl
    ? scene.imageUrl
    : scene.imageBlob
    ? URL.createObjectURL(scene.imageBlob)
    : null

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* 工具栏 */}
      <div className="flex justify-between items-center">
        <button
          onClick={() => window.history.back()}
          className="text-gray-600 hover:text-gray-800"
        >
          ← 返回
        </button>
        <h2 className="text-xl font-bold text-gray-800">{book.title}</h2>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-blue-100 text-blue-700 rounded-button text-sm hover:bg-blue-200">
            🔊 朗读
          </button>
          <button className="px-4 py-2 bg-green-100 text-green-700 rounded-button text-sm hover:bg-green-200">
            📄 PDF
          </button>
        </div>
      </div>

      {/* 翻页阅读器 */}
      <div className="flex items-center gap-4">
        <button
          onClick={goToPrev}
          disabled={currentPage === 0}
          className="text-3xl text-gray-400 hover:text-gray-600 disabled:opacity-30"
        >
          ◀
        </button>

        <div className="flex-1 flex" style={{ perspective: '800px' }}>
          {/* 左页 - 插图 */}
          <div
            className="w-1/2 bg-gradient-to-r from-secondary to-primary/20 rounded-l-card p-6 shadow-lg"
            style={{ transform: 'rotateY(2deg)' }}
          >
            <div className="text-center mb-4">
              <span className="text-sm text-gray-500">
                第 {currentPage + 1} 幕
              </span>
              <h3 className="text-xl font-bold text-gray-800">
                {scene.title}
              </h3>
            </div>
            {imageSrc && (
              <img
                src={imageSrc}
                alt={scene.title}
                className="w-full h-auto rounded-lg shadow-md"
              />
            )}
          </div>

          {/* 右页 - 文本 */}
          <div
            className="w-1/2 bg-gradient-to-l from-secondary to-primary/20 rounded-r-card p-6 shadow-lg"
            style={{ transform: 'rotateY(-2deg)' }}
          >
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-gray-700 mb-2">
                  📖 场景描述
                </h4>
                <p className="text-gray-600">{scene.description}</p>
              </div>
              <div className="bg-white/60 rounded-lg p-4">
                <h4 className="font-semibold text-gray-700 mb-2">💬 旁白</h4>
                <p className="text-gray-800 italic text-lg">
                  &ldquo;{scene.narration}&rdquo;
                </p>
              </div>
              {currentPage === 0 && (
                <div className="bg-white/60 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-700 mb-2">
                    💡 成语含义
                  </h4>
                  <p className="text-gray-600">{book.meaning}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={goToNext}
          disabled={currentPage === totalScenes - 1}
          className="text-3xl text-primary hover:text-accent disabled:opacity-30"
        >
          ▶
        </button>
      </div>

      {/* 页码指示器 */}
      <div className="flex justify-center items-center gap-4">
        <div className="flex gap-2">
          {book.scenes.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentPage(i)}
              className={`w-3 h-3 rounded-full transition-all ${
                i === currentPage ? 'bg-primary scale-125' : 'bg-gray-300'
              }`}
            />
          ))}
        </div>
        <span className="text-sm text-gray-500">
          {currentPage + 1} / {totalScenes}
        </span>
      </div>
    </div>
  )
}
