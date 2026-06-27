'use server'

import {
  generateImage,
  downloadImageAsBlob,
  createVideoTask,
  getVideoResult,
} from '@/lib/agnes-api'

export async function generateSceneImage(prompt: string): Promise<string> {
  const result = await generateImage(prompt)
  const imageUrl = result.data[0]?.url
  if (!imageUrl) {
    throw new Error('图像生成失败')
  }
  return imageUrl
}

export async function downloadImage(url: string): Promise<ArrayBuffer> {
  const blob = await downloadImageAsBlob(url)
  return blob.arrayBuffer()
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
