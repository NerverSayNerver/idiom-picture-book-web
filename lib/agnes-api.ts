import type {
  AgnesChatResponse,
  AgnesImageResponse,
  AgnesVideoTaskResponse,
  AgnesVideoResultResponse,
} from './types'

const API_BASE = 'https://apihub.agnes-ai.com/v1'

function getApiKey(): string {
  const key = process.env.AGNES_API_KEY
  if (!key) {
    console.warn('AGNES_API_KEY is not set')
    return ''
  }
  return key
}

// LLM 对话（场景拆分）
export async function chatCompletion(
  messages: Array<{ role: string; content: string }>
): Promise<AgnesChatResponse> {
  console.log('\n========== [LLM 请求] ==========')
  console.log('Model: agnes-2.0-flash')
  console.log('Messages:')
  for (const msg of messages) {
    console.log(`  [${msg.role}] ${msg.content}`)
  }

  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'agnes-2.0-flash',
      messages,
      temperature: 0.7,
      max_tokens: 8192,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'unknown')
    console.error('Chat API error:', response.status, errorText)
    throw new Error(`Chat API error: ${response.status}`)
  }

  const result = await response.json()
  const replyContent = result.choices?.[0]?.message?.content
  console.log('\n========== [LLM 响应] ==========')
  console.log('Status:', response.status)
  console.log('Content:')
  console.log(replyContent)
  console.log('Usage:', JSON.stringify(result.usage, null, 2))
  console.log('=================================\n')

  return result
}

// 图像生成（文生图）
export async function generateImage(
  prompt: string,
  size = '512x512'
): Promise<AgnesImageResponse> {
  // 确保 prompt 存在且为字符串
  if (!prompt || typeof prompt !== 'string') {
    prompt = '卡通绘本风格，可爱的儿童绘本场景'
  }

  // 截断过长的 prompt 并简化
  let truncatedPrompt = prompt.length > 300 ? prompt.substring(0, 300) : prompt
  // 确保 prompt 以 "cartoon style" 结尾
  if (!truncatedPrompt.toLowerCase().includes('cartoon')) {
    truncatedPrompt += ', cartoon style'
  }
  console.log('生成图像，prompt:', truncatedPrompt.substring(0, 50) + '...')

  return fetchImageApi({
    prompt: truncatedPrompt,
    size,
  })
}

/**
 * 图生图（img2img）：以 referenceImageUrl 为参考生成新图，保持风格/角色一致。
 * referenceImageUrl 可以是本地路径（如 /generated/xxx/1.png）或远程 URL。
 */
export async function generateImageWithRef(
  prompt: string,
  referenceImageUrl: string,
  size = '512x512'
): Promise<AgnesImageResponse> {
  if (!prompt || typeof prompt !== 'string') {
    prompt = '卡通绘本风格，可爱的儿童绘本场景'
  }
  if (!referenceImageUrl || typeof referenceImageUrl !== 'string') {
    // 回退到纯文生图
    return generateImage(prompt, size)
  }

  let truncatedPrompt = prompt.length > 300 ? prompt.substring(0, 300) : prompt
  if (!truncatedPrompt.toLowerCase().includes('cartoon')) {
    truncatedPrompt += ', cartoon style'
  }
  console.log('图生图，参考图:', referenceImageUrl, 'prompt:', truncatedPrompt.substring(0, 50) + '...')

  return fetchImageApi({
    prompt: truncatedPrompt,
    size,
    extraBody: {
      image: [referenceImageUrl],
      response_format: 'url',
    },
  })
}

async function fetchImageApi(params: {
  prompt: string
  size?: string
  extraBody?: Record<string, any>
}): Promise<AgnesImageResponse> {
  const isImg2img = !!params.extraBody?.image
  const body: Record<string, any> = {
    model: 'agnes-image-2.1-flash',
    prompt: params.prompt,
    size: params.size || '512x512',
  }
  if (params.extraBody) {
    body.extra_body = params.extraBody
  }

  console.log('\n========== [图像生成请求] ==========')
  console.log('Model: agnes-image-2.1-flash')
  console.log('Mode:', isImg2img ? '图生图 (img2img)' : '文生图')
  console.log('Size:', params.size || '512x512')
  if (isImg2img) {
    const refImages = Array.isArray(params.extraBody?.image)
      ? params.extraBody.image.map((img: string) => img.length > 80 ? img.substring(0, 80) + '...[truncated]' : img)
      : [params.extraBody?.image]
    console.log('参考图 (image):', refImages)
  }
  console.log('Prompt:', params.prompt)

  const response = await fetch(`${API_BASE}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'unknown')
    console.error('Image API error:', response.status, errorText)
    throw new Error(`Image API error: ${response.status}`)
  }

  const result = await response.json()
  const imageUrl = result.data?.[0]?.url
  console.log('\n========== [图像生成响应] ==========')
  console.log('Status:', response.status)
  console.log('Image URL:', imageUrl ? imageUrl.substring(0, 100) + (imageUrl.length > 100 ? '...' : '') : 'null')
  console.log('Revised prompt:', result.data?.[0]?.revised_prompt || 'N/A')
  console.log('====================================\n')

  return result
}

// 创建视频任务（关键帧动画）
export async function createVideoTask(
  imageUrls: string[],
  prompt?: string
): Promise<AgnesVideoTaskResponse> {
  const response = await fetch('https://apihub.agnes-ai.com/v1/videos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
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
        Authorization: `Bearer ${getApiKey()}`,
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
