'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { useTaskStore } from '@/lib/task-store'
import { decomposeIdiom } from '@/app/actions/decompose'
import { generateSceneImage, downloadImageAsBase64 } from '@/app/actions/generate'
import { savePictureBook, saveSceneImage } from '@/lib/db'
import { TaskQueue } from '@/components/TaskQueue'
import { SceneCard } from '@/components/SceneCard'

// 将 base64 转换为 Blob
function base64ToBlob(base64: string): Blob {
  const parts = base64.split(',')
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png'
  const bstr = atob(parts[1])
  const n = bstr.length
  const u8arr = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    u8arr[i] = bstr.charCodeAt(i)
  }
  return new Blob([u8arr], { type: mime })
}

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

  const { addTask, updateTask, getTaskById } = useTaskStore()
  const [taskId, setTaskId] = useState<string | null>(null)

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
      
      // 创建拆分任务
      const decomposeTaskId = addTask({
        type: 'decompose',
        total: 1,
      })
      setTaskId(decomposeTaskId)
      updateTask(decomposeTaskId, { status: 'running' })
      
      const decomposition = await decomposeIdiom(currentIdiom!)
      setDecomposition(decomposition.meaning, decomposition.scenes)
      setDecomposing(false)
      
      // 完成拆分任务
      updateTask(decomposeTaskId, { 
        status: 'completed', 
        progress: 1,
        sceneTitle: currentIdiom || '场景拆分'
      })

      // 阶段 2: 逐个生成图像
      setGenerating(true)
      let successCount = 0

      // 为每个场景创建生成任务
      const sceneTaskIds: string[] = []
      for (let i = 0; i < decomposition.scenes.length; i++) {
        const scene = decomposition.scenes[i]
        const sceneTaskId = addTask({
          type: 'generate',
          sceneId: i + 1,
          sceneTitle: scene.title,
          total: 2, // 生成 + 下载
        })
        sceneTaskIds.push(sceneTaskId)
      }

      // 逐个处理场景
      for (let i = 0; i < decomposition.scenes.length; i++) {
        const scene = decomposition.scenes[i]
        const sceneTaskId = sceneTaskIds[i]
        
        // 检查任务是否被取消
        const currentTask = getTaskById(sceneTaskId)
        if (currentTask?.status === 'cancelled') {
          continue
        }
        
        setGeneratingScene(i + 1)
        updateTask(sceneTaskId, { status: 'running' })

        try {
          // 生成图像
          updateTask(sceneTaskId, { progress: 1, total: 2 })
          const imageUrl = await generateSceneImage(scene.prompt)

          // 在服务器端下载图像并转换为 base64
          updateTask(sceneTaskId, { progress: 2, total: 2 })
          const base64 = await downloadImageAsBase64(imageUrl)

          // 转换为 Blob
          const imageBlob = base64ToBlob(base64)

          // 保存到 store
          setSceneImage(i + 1, imageUrl, imageBlob)
          
          // 完成任务
          updateTask(sceneTaskId, { 
            status: 'completed', 
            progress: 2,
            total: 2 
          })
          
          successCount++
        } catch (err) {
          console.error(`场景 ${i + 1} 生成失败:`, err)
          
          // 标记任务失败
          updateTask(sceneTaskId, { 
            status: 'failed', 
            error: err instanceof Error ? err.message : '生成失败'
          })
          
          // 继续生成下一个场景
        }
      }

      setGenerating(false)
      setGeneratingScene(null)

      // 如果至少有一个场景成功，保存绘本
      if (successCount > 0) {
        // 创建保存任务
        const saveTaskId = addTask({
          type: 'save',
          total: 1,
        })
        updateTask(saveTaskId, { status: 'running' })
        
        const book = saveCurrentBook()
        await savePictureBook(book)

        // 保存图像到 IndexedDB
        for (const scene of book.scenes) {
          if (scene.imageBlob) {
            await saveSceneImage(book.id, scene.id, scene.imageBlob)
          }
        }
        
        updateTask(saveTaskId, { 
          status: 'completed', 
          progress: 1,
          sceneTitle: '绘本保存完成'
        })

        // 跳转到阅读页
        router.push(`/read/${book.id}`)
      } else {
        setError('所有场景生成失败，请重试')
      }
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
      <div className="w-full max-w-4xl space-y-8">
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

        {/* 任务队列 */}
        <TaskQueue />

        {/* 场景预览 */}
        {currentScenes.length > 0 && (
          <div className="bg-white rounded-card p-6 shadow-md">
            <h2 className="text-lg font-semibold mb-4">🎬 场景预览</h2>
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
          </div>
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