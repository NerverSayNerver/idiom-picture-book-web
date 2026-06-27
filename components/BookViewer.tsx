'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import type { PictureBook } from '@/lib/types'
import { VideoGenerator } from './VideoGenerator'
import { generatePDF } from '@/lib/pdf'

interface BookViewerProps {
  book: PictureBook
}

export function BookViewer({ book }: BookViewerProps) {
  const [currentPage, setCurrentPage] = useState(0)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [showVideoGenerator, setShowVideoGenerator] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const totalPages = book.scenes.length + 2

  const blobUrls = useMemo(() => {
    const urls = new Map<number, string>()
    book.scenes.forEach((s, i) => {
      if (s.imageBlob && !s.imageUrl) {
        urls.set(i, URL.createObjectURL(s.imageBlob))
      }
    })
    return urls
  }, [book])

  useEffect(() => {
    return () => {
      blobUrls.forEach((url) => URL.revokeObjectURL(url))
      blobUrls.clear()
    }
  }, [blobUrls])

  const getSceneImageUrl = useCallback(
    (sceneIndex: number) => {
      const scene = book.scenes[sceneIndex]
      if (!scene) return null
      return scene.imageUrl || blobUrls.get(sceneIndex) || null
    },
    [book.scenes, blobUrls],
  )

  const goToNext = useCallback(() => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages - 1))
  }, [totalPages])

  const goToPrev = useCallback(() => {
    setCurrentPage((prev) => Math.max(prev - 1, 0))
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        goToNext()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goToPrev()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goToNext, goToPrev])

  const handleSpeak = useCallback(() => {
    if (isSpeaking) {
      window.speechSynthesis.cancel()
      setIsSpeaking(false)
      return
    }

    const isCover = currentPage === 0
    const isMeaningPage = currentPage === totalPages - 1
    const sceneIndex = currentPage - 1

    let textToSpeak = ''
    if (isCover) {
      textToSpeak = `${book.title}。${book.meaning}`
    } else if (isMeaningPage) {
      textToSpeak = `成语含义：${book.meaning}`
    } else {
      const scene = book.scenes[sceneIndex]
      if (scene) {
        textToSpeak = `${scene.title}。${scene.narration}`
      }
    }

    if (textToSpeak && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(textToSpeak)
      utterance.lang = 'zh-CN'
      utterance.rate = 0.9
      utterance.onend = () => setIsSpeaking(false)
      utterance.onerror = () => setIsSpeaking(false)
      window.speechSynthesis.speak(utterance)
      setIsSpeaking(true)
    }
  }, [book, currentPage, totalPages, isSpeaking])

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel()
    }
  }, [])

  const isCover = currentPage === 0
  const isMeaningPage = currentPage === totalPages - 1
  const sceneIndex = currentPage - 1
  const scene = !isCover && !isMeaningPage ? book.scenes[sceneIndex] : null

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <button
          onClick={() => window.history.back()}
          className="text-gray-600 hover:text-gray-800"
        >
          ← 返回
        </button>
        <h2 className="text-xl font-bold text-gray-800">{book.title}</h2>
        <div className="flex gap-2">
          <button
            onClick={handleSpeak}
            className={`px-4 py-2 rounded-button text-sm transition-colors ${
              isSpeaking
                ? 'bg-blue-500 text-white'
                : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            }`}
          >
            {isSpeaking ? '🔊 停止朗读' : '🔊 朗读'}
          </button>
          <button
            onClick={() => setShowVideoGenerator(!showVideoGenerator)}
            className="px-4 py-2 bg-purple-100 text-purple-700 rounded-button text-sm hover:bg-purple-200"
          >
            🎬 视频
          </button>
          <button
            onClick={() => generatePDF(book)}
            className="px-4 py-2 bg-green-100 text-green-700 rounded-button text-sm hover:bg-green-200"
          >
            📄 PDF
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={goToPrev}
          disabled={currentPage === 0}
          className="text-3xl text-gray-400 hover:text-gray-600 disabled:opacity-30"
        >
          ◀
        </button>

        <div className="flex-1" style={{ perspective: '800px' }}>
          {isCover && (
            <div className="bg-gradient-to-br from-secondary to-primary/20 rounded-card p-8 shadow-lg">
              <div className="text-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800 mb-2">
                  📚 {book.title}
                </h1>
                <p className="text-gray-600">{book.meaning}</p>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-6">
                {book.scenes.map((s, i) => {
                  const imgSrc = getSceneImageUrl(i)
                  return (
                    <div
                      key={i}
                      className="bg-white rounded-lg overflow-hidden shadow-md cursor-pointer hover:shadow-lg transition-all hover:scale-105"
                      onClick={() => setCurrentPage(i + 1)}
                    >
                      {imgSrc && (
                        <img
                          src={imgSrc}
                          alt={s.title}
                          className="w-full h-32 object-cover"
                        />
                      )}
                      <div className="p-2 text-center">
                        <span className="text-xs text-gray-500">第 {i + 1} 幕</span>
                        <p className="text-sm font-medium text-gray-700 truncate">{s.title}</p>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="text-center text-sm text-gray-500">
                点击任意场景开始阅读 →
              </div>
            </div>
          )}

          {scene && (
            <div className="flex">
              <div
                className="w-1/2 bg-gradient-to-r from-secondary to-primary/20 rounded-l-card p-6 shadow-lg"
                style={{ transform: 'rotateY(2deg)' }}
              >
                <div className="text-center mb-4">
                  <span className="text-sm text-gray-500">
                    第 {sceneIndex + 1} 幕
                  </span>
                  <h3 className="text-xl font-bold text-gray-800">
                    {scene.title}
                  </h3>
                </div>
                {getSceneImageUrl(sceneIndex) && (
                  <img
                    src={getSceneImageUrl(sceneIndex)!}
                    alt={scene.title}
                    className="w-full h-auto rounded-lg shadow-md"
                  />
                )}
              </div>

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
                </div>
              </div>
            </div>
          )}

          {isMeaningPage && (
            <div className="bg-gradient-to-br from-primary/20 to-accent/20 rounded-card p-8 shadow-lg text-center">
              <div className="text-6xl mb-6">💡</div>
              <h2 className="text-2xl font-bold text-gray-800 mb-4">
                成语含义
              </h2>
              <p className="text-xl text-gray-700 mb-8 leading-relaxed">
                {book.meaning}
              </p>

              <div className="bg-white/60 rounded-lg p-6 max-w-lg mx-auto">
                <h3 className="font-semibold text-gray-700 mb-3">📖 故事回顾</h3>
                <div className="space-y-2 text-left">
                  {book.scenes.map((s, i) => (
                    <p key={i} className="text-gray-600 text-sm">
                      <span className="font-medium">第 {i + 1} 幕 {s.title}：</span>
                      {s.narration}
                    </p>
                  ))}
                </div>
              </div>

              <div className="mt-6 text-sm text-gray-500">
                🎉 故事讲完啦！
              </div>
            </div>
          )}
        </div>

        <button
          onClick={goToNext}
          disabled={currentPage === totalPages - 1}
          className="text-3xl text-primary hover:text-accent disabled:opacity-30"
        >
          ▶
        </button>
      </div>

      <div className="flex justify-center items-center gap-4">
        <div className="flex gap-2">
          {Array.from({ length: totalPages }).map((_, i) => (
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
          {currentPage + 1} / {totalPages}
        </span>
      </div>

      {showVideoGenerator && (
        <div className="bg-white rounded-card p-6 shadow-md">
          <h3 className="text-lg font-semibold mb-4">🎬 生成绘本视频</h3>
          <VideoGenerator
            imageUrls={book.scenes
              .map((s, i) => s.imageUrl || blobUrls.get(i))
              .filter((url): url is string => !!url)}
            onVideoGenerated={setVideoUrl}
          />
        </div>
      )}

      {videoUrl && (
        <div className="bg-white rounded-card p-6 shadow-md">
          <h3 className="text-lg font-semibold mb-4">📺 绘本视频</h3>
          <video src={videoUrl} controls className="w-full rounded-card" />
          <a
            href={videoUrl}
            download
            className="mt-4 inline-block text-blue-600 hover:underline"
          >
            📥 下载视频
          </a>
        </div>
      )}
    </div>
  )
}
