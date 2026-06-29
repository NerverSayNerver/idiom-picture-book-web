'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import type { PictureBook } from '@/lib/types'
import { VideoGenerator } from './VideoGenerator'
import { generatePDF } from '@/lib/pdf'
import { useTTS } from '@/hooks/useTTS'
import { getStrategy } from '@/lib/content-types'
import { getBookFullText, formatPoetryAttribution } from '@/lib/book-display'

interface BookViewerProps {
  book: PictureBook
}

const RATES = [0.5, 0.75, 1.0, 1.25, 1.5]

export function BookViewer({ book }: BookViewerProps) {
  // 页面索引: 0=封面, 1~N=场景, N+1=含义页
  const [currentPage, setCurrentPage] = useState(0)
  const categoryLabel = (() => {
    try { return getStrategy(book.category).label } catch { return '内容' }
  })()
  const isPoetry = book.category === 'poetry'
  const isNurseryRhyme = book.category === 'nursery-rhyme'
  const fullText = getBookFullText(book)
  const poetryAttribution = isPoetry ? formatPoetryAttribution(book) : undefined
  const meaningPageTitle = isPoetry ? '诗意解读' : isNurseryRhyme ? '儿歌寓意' : `${categoryLabel}含义`
  const reviewTitle = isPoetry ? '全诗回顾' : isNurseryRhyme ? '歌词回顾' : '故事回顾'
  const reviewDoneText = isPoetry ? '🎉 读完啦！' : isNurseryRhyme ? '🎉 唱完啦！' : '🎉 故事讲完啦！'
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [showVideoGenerator, setShowVideoGenerator] = useState(false)
  const totalPages = book.scenes.length + 2 // 封面 + 场景 + 含义页

  const {
    isPlaying,
    isPaused,
    rate,
    currentCharIndex,
    speak,
    speakScenes,
    stop,
    togglePause,
    setRate: setTTSRate,
    isSupported,
  } = useTTS()

  // 缓存从 Blob 创建的 URL，避免每次渲染创建新 URL
  const sceneBlobUrls = useMemo(() => {
    const urls: Map<number, string> = new Map()
    book.scenes.forEach((s) => {
      if (!s.imageUrl && s.imageBlob) {
        urls.set(s.id, URL.createObjectURL(s.imageBlob))
      }
    })
    return urls
  }, [book.scenes])

  // 获取场景图片 URL：优先 imageUrl，其次 Blob，最后构造文件系统路径
  const getSceneImageUrl = useCallback((scene: typeof book.scenes[0]) => {
    if (scene.imageUrl) return scene.imageUrl
    if (scene.imageBlob) return sceneBlobUrls.get(scene.id) || ''
    if (book.category && book.sourceText) {
      return `/generated/${book.category}/${book.sourceText}/${scene.id}.png`
    }
    return ''
  }, [book.category, book.sourceText, sceneBlobUrls])

  // 组件卸载时释放所有 blob URL
  useEffect(() => {
    return () => {
      sceneBlobUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [sceneBlobUrls])
  const isReadingModeRef = useRef(false)
  // 确保只在非 Strict Mode 双重调用时有问题时仍能正常工作
  const goToNext = useCallback(() => {
    setCurrentPage((prev) => Math.min(prev + 1, book.scenes.length + 1))
  }, [book.scenes.length])

  const goToPrev = useCallback(() => {
    setCurrentPage((prev) => Math.max(prev - 1, 0))
  }, [])

  // 循环切换语速
  const cycleRate = useCallback(() => {
    const currentIndex = RATES.indexOf(rate)
    const nextIndex = (currentIndex + 1) % RATES.length
    setTTSRate(RATES[nextIndex])
  }, [rate, setTTSRate])

  // 判断当前页类型
  const isCover = currentPage === 0
  const isMeaningPage = currentPage === totalPages - 1
  const sceneIndex = currentPage - 1 // 场景索引从0开始
  const scene = !isCover && !isMeaningPage ? book.scenes[sceneIndex] : null

  // 开始/停止朗读
  const handleSpeak = useCallback(() => {
    if (isPlaying) {
      stop()
      isReadingModeRef.current = false
      return
    }

    isReadingModeRef.current = true
    const startIndex = isCover ? 0 : isMeaningPage ? book.scenes.length : sceneIndex
    if (startIndex >= book.scenes.length) return

    // 使用 useTTS hook 的 speakScenes，确保 isPlaying/isPaused 状态同步
    speakScenes(
      book.scenes.map(s => ({ narration: s.narration })),
      startIndex,
      (sceneIdx) => {
        // 每个场景结束后的回调：翻到对应页面
        const nextPage = sceneIdx + 2 // +1 for cover, +1 for next scene
        if (nextPage < totalPages) {
          setCurrentPage(nextPage)
        } else {
          isReadingModeRef.current = false
        }
      }
    )
  }, [isPlaying, stop, isCover, isMeaningPage, sceneIndex, book.scenes, speakScenes, totalPages])

  // 停止朗读并退出朗读模式
  const handleStop = useCallback(() => {
    stop()
    isReadingModeRef.current = false
  }, [stop])

  // 页面变化时，在朗读模式下处理含义页朗读
  useEffect(() => {
    if (!isReadingModeRef.current) return
    if (isCover) return

    if (isMeaningPage) {
      speak(book.meaning)
      // 朗读完含义后退出朗读模式（后续由用户手动触发朗读）
      isReadingModeRef.current = false
    }
    // 场景页朗读由 speakScenes 处理，无需在此创建 utterance
  }, [currentPage, isCover, isMeaningPage, book.meaning, speak])

  // 键盘事件
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

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
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
          {isSupported && (
            <>
              <button
                onClick={handleSpeak}
                className={`px-4 py-2 rounded-button text-sm ${
                  isPlaying
                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                    : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                }`}
              >
                {isPlaying ? '⏹ 停止' : '🔊 朗读'}
              </button>
              {isPlaying && (
                <>
                  <button
                    onClick={togglePause}
                    className="px-4 py-2 bg-yellow-100 text-yellow-700 rounded-button text-sm hover:bg-yellow-200"
                  >
                    {isPaused ? '▶ 继续' : '⏸ 暂停'}
                  </button>
                  <button
                    onClick={cycleRate}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-button text-sm hover:bg-gray-200"
                  >
                    🐢 {rate}x
                  </button>
                </>
              )}
            </>
          )}
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

      {/* 翻页阅读器 */}
      <div className="flex items-center gap-4">
        <button
          onClick={goToPrev}
          disabled={currentPage === 0}
          className="text-3xl text-gray-400 hover:text-gray-600 disabled:opacity-30"
        >
          ◀
        </button>

        <div className="flex-1" style={{ perspective: '800px' }}>
          {/* 封面页 - 展示所有插图 */}
          {isCover && (
            <div className="bg-gradient-to-br from-secondary to-primary/20 rounded-card p-8 shadow-lg">
              <div className="text-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800 mb-2">
                  {isPoetry ? '📜' : isNurseryRhyme ? '🎵' : '📚'} {book.title}
                </h1>
                {isPoetry && poetryAttribution && (
                  <p className="text-amber-800 font-medium mb-3">{poetryAttribution}</p>
                )}
                {fullText && (isPoetry || isNurseryRhyme) ? (
                  <div className={`mx-auto max-w-md rounded-lg p-4 mb-4 ${
                    isPoetry ? 'bg-amber-50/80' : 'bg-blue-50/80'
                  }`}>
                    <p className={`whitespace-pre-line leading-relaxed ${
                      isPoetry
                        ? 'text-xl font-serif text-gray-800 tracking-wide'
                        : 'text-lg italic text-gray-700'
                    }`}>
                      {fullText}
                    </p>
                  </div>
                ) : null}
                <p className="text-gray-600">{book.meaning}</p>
              </div>

              {/* 所有插图网格 */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                {book.scenes.map((s, i) => {
                  const imgSrc = getSceneImageUrl(s) || null
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
                        <span className="text-xs text-gray-500">
                          {isPoetry ? `第 ${i + 1} 句` : isNurseryRhyme ? `第 ${i + 1} 段` : `第 ${i + 1} 幕`}
                        </span>
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

          {/* 场景页 */}
          {scene && (
            <div className="flex">
              {/* 左页 - 插图 */}
              <div
                className="w-1/2 bg-gradient-to-r from-secondary to-primary/20 rounded-l-card p-6 shadow-lg"
                style={{ transform: 'rotateY(2deg)' }}
              >
                <div className="text-center mb-4">
                  <span className="text-sm text-gray-500">
                    {isPoetry ? `第 ${sceneIndex + 1} 句` : isNurseryRhyme ? `第 ${sceneIndex + 1} 段` : `第 ${sceneIndex + 1} 幕`}
                  </span>
                  <h3 className="text-xl font-bold text-gray-800">
                    {scene.title}
                  </h3>
                </div>
                {(scene.imageUrl || scene.imageBlob) && (
                  <img
                    src={getSceneImageUrl(scene) || ''}
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
                  {!isNurseryRhyme && (
                    <div>
                      <h4 className="font-semibold text-gray-700 mb-2">
                        {isPoetry ? '🎨 意境描绘' : '📖 场景描述'}
                      </h4>
                      <p className="text-gray-600">{scene.description}</p>
                    </div>
                  )}
                  {isPoetry && (
                    <div className="bg-amber-50/80 rounded-lg p-4">
                      <h4 className="font-semibold text-gray-700 mb-2">📜 原诗</h4>
                      <p className="text-gray-800 text-xl font-serif tracking-wide">{scene.title}</p>
                    </div>
                  )}
                  <div className="bg-white/60 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-700 mb-2">
                      {isPoetry ? '💡 白话释义' : isNurseryRhyme ? '🎵 歌词' : '💬 旁白'}
                    </h4>
                    <p className={`text-gray-800 text-lg ${isNurseryRhyme ? 'italic' : isPoetry ? '' : 'italic'}`}>
                      {!isPoetry && !isNurseryRhyme && '「'}
                      {isPlaying && currentCharIndex >= 0 && currentCharIndex < scene.narration.length ? (
                        <>
                          {scene.narration.slice(0, currentCharIndex)}
                          <span className="bg-yellow-200 rounded px-0.5">
                            {scene.narration[currentCharIndex]}
                          </span>
                          {scene.narration.slice(currentCharIndex + 1)}
                        </>
                      ) : (
                        scene.narration
                      )}
                      {!isPoetry && !isNurseryRhyme && '」'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 含义页 */}
          {isMeaningPage && (
            <div className="bg-gradient-to-br from-primary/20 to-accent/20 rounded-card p-8 shadow-lg text-center">
              <div className="text-6xl mb-6">{isPoetry ? '📜' : isNurseryRhyme ? '🎵' : '💡'}</div>
              <h2 className="text-2xl font-bold text-gray-800 mb-4">
                {meaningPageTitle}
              </h2>
              <p className="text-xl text-gray-700 mb-8 leading-relaxed">
                {book.meaning}
              </p>

              {fullText && (isPoetry || isNurseryRhyme) ? (
                <div className={`rounded-lg p-6 max-w-lg mx-auto mb-6 ${
                  isPoetry ? 'bg-amber-50/80' : 'bg-blue-50/80'
                }`}>
                  <h3 className="font-semibold text-gray-700 mb-3">
                    {isPoetry ? '📜 全诗' : '🎵 完整歌词'}
                  </h3>
                  <p className={`whitespace-pre-line leading-relaxed text-left ${
                    isPoetry
                      ? 'text-lg font-serif text-gray-800'
                      : 'text-base italic text-gray-700'
                  }`}>
                    {fullText}
                  </p>
                </div>
              ) : (
                <div className="bg-white/60 rounded-lg p-6 max-w-lg mx-auto">
                  <h3 className="font-semibold text-gray-700 mb-3">📖 {reviewTitle}</h3>
                  <div className="space-y-2 text-left">
                    {book.scenes.map((s, i) => (
                      <p key={i} className="text-gray-600 text-sm">
                        <span className="font-medium">第 {i + 1} 幕 {s.title}：</span>
                        {s.narration}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {(isPoetry || isNurseryRhyme) && fullText && (
                <div className="bg-white/60 rounded-lg p-6 max-w-lg mx-auto">
                  <h3 className="font-semibold text-gray-700 mb-3">📖 {reviewTitle}</h3>
                  <div className="space-y-2 text-left">
                    {book.scenes.map((s, i) => (
                      <p key={i} className="text-gray-600 text-sm">
                        <span className="font-medium">
                          {isPoetry ? `第 ${i + 1} 句` : `第 ${i + 1} 段`} {s.title}：
                        </span>
                        {s.narration}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 text-sm text-gray-500">
                {reviewDoneText}
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

      {/* 页码指示器 */}
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

      {/* 视频生成 */}
      {showVideoGenerator && (
        <div className="bg-white rounded-card p-6 shadow-md">
          <h3 className="text-lg font-semibold mb-4">🎬 生成绘本视频</h3>
          <VideoGenerator
            imageUrls={book.scenes
              .map((s) => s.imageUrl)
              .filter((url): url is string => !!url)}
            onVideoGenerated={setVideoUrl}
          />
        </div>
      )}

      {/* 视频播放器 */}
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
