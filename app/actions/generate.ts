'use server'

import {
  generateImage,
  downloadImageAsBlob,
  createVideoTask,
  getVideoResult,
} from '@/lib/agnes-api'

export async function generateSceneImage(prompt: string): Promise<string> {
  // 重试逻辑，最多5次
  for (let i = 0; i < 5; i++) {
    try {
      const result = await generateImage(prompt)
      const imageUrl = result.data[0]?.url
      if (!imageUrl) {
        throw new Error('图像生成失败')
      }
      return imageUrl
    } catch (error) {
      console.log(`图像生成重试 ${i + 1}/5...`)
      if (i === 4) throw error
      // 等待更长时间再重试
      await new Promise((resolve) => setTimeout(resolve, 3000 * (i + 1)))
    }
  }
  throw new Error('图像生成失败')
}

// 服务器端下载图像并返回 base64
export async function downloadImageAsBase64(url: string): Promise<string> {
  const blob = await downloadImageAsBlob(url)
  const buffer = await blob.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')
  const mimeType = blob.type || 'image/png'
  return `data:${mimeType};base64,${base64}`
}

export async function generateBookVideo(
  imageUrls: string[]
): Promise<{ videoUrl: string }> {
  // 1. 创建视频任务
  const task = await createVideoTask(imageUrls)
  const videoId = task.video_id

  // 2. 轮询等待完成（最多 5 分钟）
  for (let i = 0; i < 30; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10000))
    const result = await getVideoResult(videoId)

    if (result.status === 'completed' && result.remixed_from_video_id) {
      return { videoUrl: result.remixed_from_video_id }
    } else if (result.status === 'failed') {
      throw new Error('视频生成失败')
    }
  }

  throw new Error('视频生成超时')
}
