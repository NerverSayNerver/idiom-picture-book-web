import type {
  AgnesChatResponse,
  AgnesImageResponse,
  AgnesVideoTaskResponse,
  AgnesVideoResultResponse,
} from './types'

const API_BASE = 'https://apihub.agnes-ai.com/v1'
const API_KEY = process.env.AGNES_API_KEY

if (!API_KEY) {
  console.warn('AGNES_API_KEY is not set')
}

// LLM 对话（场景拆分）
export async function chatCompletion(
  messages: Array<{ role: string; content: string }>
): Promise<AgnesChatResponse> {
  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'agnes-2.0-flash',
      messages,
      temperature: 0.7,
      max_tokens: 2048,
    }),
  })

  if (!response.ok) {
    throw new Error(`Chat API error: ${response.status}`)
  }

  return response.json()
}

// 图像生成
export async function generateImage(
  prompt: string,
  size = '1024x768'
): Promise<AgnesImageResponse> {
  const response = await fetch(`${API_BASE}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'agnes-image-2.1-flash',
      prompt,
      size,
      extra_body: { response_format: 'url' },
    }),
  })

  if (!response.ok) {
    throw new Error(`Image API error: ${response.status}`)
  }

  return response.json()
}

// 创建视频任务（关键帧动画）
export async function createVideoTask(
  imageUrls: string[],
  prompt?: string
): Promise<AgnesVideoTaskResponse> {
  const response = await fetch('https://apihub.agnes-ai.com/v1/videos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'agnes-video-v2.0',
      prompt: prompt || '生成流畅的绘本故事动画，场景之间自然过渡，卡通漫画风格',
      extra_body: {
        image: imageUrls,
        mode: 'keyframes',
      },
      num_frames: 241,
      frame_rate: 24,
    }),
  })

  if (!response.ok) {
    throw new Error(`Video API error: ${response.status}`)
  }

  return response.json()
}

// 查询视频生成状态
export async function getVideoResult(
  videoId: string
): Promise<AgnesVideoResultResponse> {
  const response = await fetch(
    `https://apihub.agnes-ai.com/agnesapi?video_id=${videoId}`,
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
    }
  )

  if (!response.ok) {
    throw new Error(`Video result API error: ${response.status}`)
  }

  return response.json()
}

// 下载图像为 Blob
export async function downloadImageAsBlob(url: string): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Download error: ${response.status}`)
  }
  return response.blob()
}
