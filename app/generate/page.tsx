'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { decomposeIdiom } from '@/app/actions/decompose'
import { generateSceneImage, downloadImage } from '@/app/actions/generate'
import { savePictureBook, saveSceneImage } from '@/lib/db'
import { ProgressBar } from '@/components/ProgressBar'
import { SceneCard } from '@/components/SceneCard'

export default function GeneratePage() {
  const router = useRouter()
  const {
    currentIdiom,
    currentScenes,
    isDecomposing,
    isGenerating,
    generatingSceneId,
    error,
    setDecomposition,
    setSceneImage,
    setDecomposing,
    setGenerating,
    setGeneratingScene,
    setError,
    saveCurrentBook,
  } = useAppStore()

  const [completedCount, setCompletedCount] = useState(0)

  useEffect(() => {
    if (!currentIdiom) {
      router.push('/')
      return
    }

    generateBook()
  }, [currentIdiom])

  const generateBook = async () => {
    try {
      // 阶段 1: LLM 场景拆分
      setDecomposing(true)
      const decomposition = await decomposeIdiom(currentIdiom!)
      setDecomposition(decomposition.meaning, decomposition.scenes)
      setDecomposing(false)

      // 阶段 2: 逐个生成图像
      setGenerating(true)
      for (let i = 0; i < decomposition.scenes.length; i++) {
        const scene = decomposition.scenes[i]
        setGeneratingScene(i + 1)

        // 生成图像
        const imageUrl = await generateSceneImage(scene.prompt)

        // 下载图像
        const imageBuffer = await downloadImage(imageUrl)
        const imageBlob = new Blob([imageBuffer])

        // 保存到 store
        setSceneImage(i + 1, imageUrl, imageBlob)
        setCompletedCount(i + 1)
      }

      setGenerating(false)
      setGeneratingScene(null)

      // 保存绘本到 IndexedDB
      const book = saveCurrentBook()
      await savePictureBook(book)

      // 保存图像到 IndexedDB
      for (const scene of book.scenes) {
        if (scene.imageBlob) {
          await saveSceneImage(book.id, scene.id, scene.imageBlob)
        }
      }

      // 跳转到阅读页
      router.push(`/read/${book.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败')
      setDecomposing(false)
      setGenerating(false)
      setGeneratingScene(null)
    }
  }

  if (!currentIdiom) {
    return null
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-8">
        {/* 标题 */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-primary">⏳ 正在生成绘本</h1>
          <p className="mt-2 text-lg text-gray-600">{currentIdiom}</p>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-card p-4 text-red-700">
            ❌ {error}
          </div>
        )}

        {/* 阶段 1: LLM 场景拆分 */}
        {isDecomposing && (
          <div className="bg-white rounded-card p-6 shadow-md text-center">
            <div className="text-4xl mb-4">🤖</div>
            <h2 className="text-xl font-semibold mb-2">AI 正在构思故事...</h2>
            <p className="text-gray-600">
              正在将「{currentIdiom}」拆分为精彩场景
            </p>
          </div>
        )}

        {/* 阶段 2: 图像生成 */}
        {currentScenes.length > 0 && (
          <>
            <div className="bg-white rounded-card p-6 shadow-md">
              <ProgressBar
                current={completedCount}
                total={currentScenes.length}
                label="图像生成进度"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {currentScenes.map((scene) => (
                <SceneCard
                  key={scene.id}
                  scene={scene}
                  status={
                    generatingSceneId === scene.id
                      ? 'generating'
                      : scene.imageUrl
                      ? 'completed'
                      : 'waiting'
                  }
                />
              ))}
            </div>
          </>
        )}

        {/* 趣味知识 */}
        <div className="bg-blue-50 rounded-card p-6 border border-blue-100">
          <h3 className="font-semibold text-blue-800 mb-2">💡 小知识</h3>
          <p className="text-blue-700 text-sm">
            成语是中华文化的瑰宝，每个成语背后都有一个有趣的故事。通过漫画绘本的形式，可以让孩子更容易理解成语的含义。
          </p>
        </div>
      </div>
    </main>
  )
}
