import type {
  ChatCompletionResponse,
  AgnesImageResponse,
  AgnesVideoTaskResponse,
  AgnesVideoResultResponse,
} from './types'
import { getImageConfig } from './prompts'
import { getImageProvider, getVideoProvider } from './generation'

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

// ════════════════════════════════════════════════════════════
// LLM 对话配置（保持不变，已通过环境变量支持任何 OpenAI 兼容端点）
// ════════════════════════════════════════════════════════════

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

// ════════════════════════════════════════════════════════════
// LLM 对话（场景拆分 / 推荐），兼容任何 OpenAI 兼容 API
// ════════════════════════════════════════════════════════════

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

// ════════════════════════════════════════════════════════════
// 图像生成（委托给 Provider 层）
// ════════════════════════════════════════════════════════════

/** 文生图 — 通过 IMAGE_PROVIDER 配置的 Provider 执行 */
export async function generateImage(
  prompt: string,
  size = '512x512'
): Promise<AgnesImageResponse> {
  const imgCfg = getImageConfig()

  // prompt 兜底与风格注入（保持原有逻辑不变）
  if (!prompt || typeof prompt !== 'string') {
    prompt = imgCfg.fallback
  }
  let truncatedPrompt = prompt.length > imgCfg.maxLength ? prompt.substring(0, imgCfg.maxLength) : prompt
  if (!truncatedPrompt.toLowerCase().includes(imgCfg.styleKeyword)) {
    truncatedPrompt += imgCfg.styleSuffix
  }
  if (DEBUG) console.log('生成图像，prompt:', truncatedPrompt.substring(0, 50) + '...')

  const provider = getImageProvider()
  const result = await provider.generate({ prompt: truncatedPrompt, size })

  // 转换为旧格式返回（向后兼容）
  return { data: [{ url: result.url }] }
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

  const provider = getImageProvider()
  const result = await provider.generateWithRef({
    prompt: truncatedPrompt,
    referenceImageUrl,
    size,
  })

  return { data: [{ url: result.url }] }
}

// ════════════════════════════════════════════════════════════
// 视频生成（委托给 Provider 层）
// ════════════════════════════════════════════════════════════

/** 创建视频任务 — 通过 VIDEO_PROVIDER 配置的 Provider 执行 */
export async function createVideoTask(
  imageUrls: string[],
  prompt?: string
): Promise<AgnesVideoTaskResponse> {
  const provider = getVideoProvider()
  const task = await provider.submit({ imageUrls, prompt })

  // 转换为旧格式返回（向后兼容）
  return {
    id: task.taskId,
    task_id: task.taskId,
    video_id: task.taskId,
    status: task.status,
    progress: 0,
  }
}

/** 查询视频生成状态 — 通过 VIDEO_PROVIDER 配置的 Provider 执行 */
export async function getVideoResult(
  videoId: string
): Promise<AgnesVideoResultResponse> {
  const provider = getVideoProvider()
  const result = await provider.poll(videoId)

  // 转换为旧格式返回（向后兼容）
  return {
    id: result.taskId,
    video_id: result.videoId || result.taskId,
    status: result.status,
    progress: result.progress,
    remixed_from_video_id: result.videoUrl,
    error: result.error,
  }
}

// ════════════════════════════════════════════════════════════
// 工具函数（保持不变）
// ════════════════════════════════════════════════════════════

/** 下载图像为 Blob */
export async function downloadImageAsBlob(url: string): Promise<Blob> {
  const response = await fetchWithTimeout(url, {}, 30000)
  if (!response.ok) {
    throw new Error(`Download error: ${response.status}`)
  }
  return response.blob()
}
