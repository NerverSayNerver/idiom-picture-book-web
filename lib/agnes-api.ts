import type {
  ChatCompletionResponse,
  AgnesImageResponse,
  AgnesVideoTaskResponse,
  AgnesVideoResultResponse,
} from './types'
import { getImageConfig, getVideoConfig } from './prompts'

// S1: 仅在开发环境且 DEBUG_LLM=1 时输出详细日志
const DEBUG = process.env.NODE_ENV === 'development' && process.env.DEBUG_LLM === '1'

// S6: 带超时的 fetch 封装
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 60000
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  if (init.signal) {
    init.signal.addEventListener('abort', () => controller.abort())
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// ── LLM 对话配置 ────────────────────────────────────────────
// 通过环境变量配置，支持任何 OpenAI 兼容的 API 端点。
// 默认值保持与原有 Agnes AI 配置一致，向后兼容。
const LLM_API_BASE = process.env.LLM_API_BASE || 'https://apihub.agnes-ai.com/v1'
const LLM_API_KEY = process.env.LLM_API_KEY || process.env.AGNES_API_KEY || ''
const LLM_MODEL = process.env.LLM_MODEL || 'agnes-2.0-flash'

function getLlmApiKey(): string {
  const key = LLM_API_KEY
  if (!key) {
    console.warn('LLM_API_KEY is not set')
    return ''
  }
  return key
}

// ── Agnes 生图 / 视频配置（保持原样，暂未通用化） ──────────
const API_BASE = 'https://apihub.agnes-ai.com/v1'

function getApiKey(): string {
  const key = process.env.AGNES_API_KEY
  if (!key) {
    console.warn('AGNES_API_KEY is not set')
    return ''
  }
  return key
}

// LLM 对话（场景拆分 / 推荐），兼容任何 OpenAI 兼容 API
export async function chatCompletion(
  messages: Array<{ role: string; content: string }>,
  options?: {
    model?: string
    temperature?: number
    maxTokens?: number
  }
): Promise<ChatCompletionResponse> {
  const model = options?.model || LLM_MODEL
  const temperature = options?.temperature ?? 0.7
  const maxTokens = options?.maxTokens ?? 8192
  if (DEBUG) {
    console.log('\n========== [LLM 请求] ==========')
    console.log(`Base URL: ${LLM_API_BASE}`)
    console.log(`Model: ${model}`)
    console.log('Messages:')
    for (const msg of messages) {
      console.log(`  [${msg.role}] ${msg.content}`)
    }
  }

  const response = await fetchWithTimeout(`${LLM_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getLlmApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'unknown')
    console.error('Chat API error:', response.status, errorText)
    throw new Error(`Chat API error: ${response.status}`)
  }

  const result = await response.json()
  const replyContent = result.choices?.[0]?.message?.content
  if (DEBUG) {
    console.log('\n========== [LLM 响应] ==========')
    console.log('Status:', response.status)
    console.log('Content:')
    console.log(replyContent)
    console.log('Usage:', JSON.stringify(result.usage, null, 2))
    console.log('=================================\n')
  }

  return result as ChatCompletionResponse
}

// 图像生成（文生图）
export async function generateImage(
  prompt: string,
  size = '512x512'
): Promise<AgnesImageResponse> {
  const imgCfg = getImageConfig()

  // 确保 prompt 存在且为字符串
  if (!prompt || typeof prompt !== 'string') {
    prompt = imgCfg.fallback
  }

  // 截断过长的 prompt 并简化
  let truncatedPrompt = prompt.length > imgCfg.maxLength ? prompt.substring(0, imgCfg.maxLength) : prompt
  // 确保 prompt 包含风格关键词
  if (!truncatedPrompt.toLowerCase().includes(imgCfg.styleKeyword)) {
    truncatedPrompt += imgCfg.styleSuffix
  }
  if (DEBUG) console.log('生成图像，prompt:', truncatedPrompt.substring(0, 50) + '...')

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
  const imgCfg = getImageConfig()

  if (!prompt || typeof prompt !== 'string') {
    prompt = imgCfg.fallback
  }
  if (!referenceImageUrl || typeof referenceImageUrl !== 'string') {
    // 回退到纯文生图
    return generateImage(prompt, size)
  }

  let truncatedPrompt = prompt.length > imgCfg.maxLength ? prompt.substring(0, imgCfg.maxLength) : prompt
  if (!truncatedPrompt.toLowerCase().includes(imgCfg.styleKeyword)) {
    truncatedPrompt += imgCfg.styleSuffix
  }
  if (DEBUG) console.log('图生图，参考图:', referenceImageUrl, 'prompt:', truncatedPrompt.substring(0, 50) + '...')

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

  if (DEBUG) {
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
  }

  const response = await fetchWithTimeout(`${API_BASE}/images/generations`, {
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
  if (DEBUG) {
    console.log('\n========== [图像生成响应] ==========')
    console.log('Status:', response.status)
    console.log('Image URL:', imageUrl ? imageUrl.substring(0, 100) + (imageUrl.length > 100 ? '...' : '') : 'null')
    console.log('Revised prompt:', result.data?.[0]?.revised_prompt || 'N/A')
    console.log('====================================\n')
  }

  return result
}

// 创建视频任务（关键帧动画）
export async function createVideoTask(
  imageUrls: string[],
  prompt?: string
): Promise<AgnesVideoTaskResponse> {
  const response = await fetchWithTimeout('https://apihub.agnes-ai.com/v1/videos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'agnes-video-v2.0',
      prompt: prompt || getVideoConfig().fallback,
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
  const response = await fetchWithTimeout(
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
  const response = await fetchWithTimeout(url, {}, 30000)
  if (!response.ok) {
    throw new Error(`Download error: ${response.status}`)
  }
  return response.blob()
}
