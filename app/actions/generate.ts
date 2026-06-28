'use server'

import {
  generateImage,
  downloadImageAsBlob,
  createVideoTask,
  getVideoResult,
} from '@/lib/agnes-api'

export async function generateSceneImage(prompt: string): Promise<string> {
  // 不内置重试，由 task-executor 层统一管理重试逻辑
  const result = await generateImage(prompt)
  const imageUrl = result.data?.[0]?.url
  if (!imageUrl) {
    throw new Error('图像生成失败：API 返回空 URL')
  }
  return imageUrl
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
): Promise<{ videoId: string }> {
  // 1. 创建视频任务
  const task = await createVideoTask(imageUrls)
  const videoId = task.video_id

  // 2. 轮询等待完成（最多 5 分钟）
  for (let i = 0; i < 30; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10000))
    const result = await getVideoResult(videoId)

    if (result.status === 'completed' && result.video_id) {
      // 注意: remixed_from_video_id 是视频 ID 而非 URL。
      // 实际视频访问方式需要查阅 Agnes Video API 文档确认。
      // 暂时使用 video_id 作为标识，前端可尝试以 ID 构建访问 URL。
      return { videoId: result.video_id }
    } else if (result.status === 'failed') {
      throw new Error('视频生成失败')
    }
  }

  throw new Error('视频生成超时')
}
