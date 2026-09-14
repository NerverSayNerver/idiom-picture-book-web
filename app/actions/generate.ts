'use server'

import {
  generateImage,
  generateImageWithRef,
  downloadImageAsBlob,
  createVideoTask,
  getVideoResult,
} from '@/lib/agnes-api'

export async function generateSceneImage(prompt: string): Promise<string> {
  // 不内置重试，由 worker 层统一管理重试逻辑
  const result = await generateImage(prompt)
  const imageUrl = result.data?.[0]?.url
  if (!imageUrl) {
    throw new Error('图像生成失败：API 返回空 URL')
  }
  return imageUrl
}

/**
 * 图生图版本：以 referenceImageUrl 为参考生成当前场景图。
 * 由 worker 在首图生成后调用，确保绘本风格/角色连贯。
 */
export async function generateSceneImageWithRef(
  prompt: string,
  referenceImageUrl: string
): Promise<string> {
  const result = await generateImageWithRef(prompt, referenceImageUrl)
  const imageUrl = result.data?.[0]?.url
  if (!imageUrl) {
    throw new Error('图像生成失败（img2img）：API 返回空 URL')
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
): Promise<{ videoId: string; videoUrl: string }> {
  // 1. 创建视频任务
  const task = await createVideoTask(imageUrls)
  const videoId = task.video_id

  // 2. 轮询等待完成（最多 5 分钟）
  for (let i = 0; i < 30; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10000))
    const result = await getVideoResult(videoId)

    if (result.status === 'completed') {
      // Agnes Video V2.0：完成时 remixed_from_video_id / video_url 字段即最终视频 URL
      const videoUrl = result.video_url || result.remixed_from_video_id
      if (!videoUrl) {
        throw new Error('视频生成完成，但响应中未包含视频地址')
      }
      return { videoId: result.video_id || videoId, videoUrl }
    } else if (result.status === 'failed') {
      throw new Error('视频生成失败')
    }
  }

  throw new Error('视频生成超时')
}
