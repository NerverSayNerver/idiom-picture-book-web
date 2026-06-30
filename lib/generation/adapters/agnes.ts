// lib/generation/adapters/agnes.ts
// Agnes AI 适配器：将原有 agnes-api 逻辑封装为 ImageProvider + VideoProvider 实现

import type {
  ImageProvider,
  VideoProvider,
  ImageProviderConfig,
  VideoProviderConfig,
  ImageResult,
  VideoTask,
  VideoResult,
} from '../types'
import { getImageConfig, getVideoConfig } from '@/lib/prompts'

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
// Agnes 图像 Provider
// ════════════════════════════════════════════════════════════

export class AgnesImageProvider implements ImageProvider {
  readonly name = 'agnes'
  private config: ImageProviderConfig

  constructor(config: ImageProviderConfig) {
    this.config = config
  }

  async generate(params: { prompt: string; size?: string }): Promise<ImageResult> {
    return this.fetchImageApi({ prompt: params.prompt, size: params.size })
  }

  async generateWithRef(params: {
    prompt: string
    referenceImageUrl: string
    size?: string
  }): Promise<ImageResult> {
    return this.fetchImageApi({
      prompt: params.prompt,
      size: params.size,
      extraBody: {
        image: [params.referenceImageUrl],
        response_format: 'url',
      },
    })
  }

  private async fetchImageApi(params: {
    prompt: string
    size?: string
    extraBody?: Record<string, any>
  }): Promise<ImageResult> {
    const imgCfg = getImageConfig()

    // prompt 兜底与风格注入
    let prompt = params.prompt
    if (!prompt || typeof prompt !== 'string') {
      prompt = imgCfg.fallback
    }
    prompt =
      prompt.length > imgCfg.maxLength ? prompt.substring(0, imgCfg.maxLength) : prompt
    if (!prompt.toLowerCase().includes(imgCfg.styleKeyword)) {
      prompt += imgCfg.styleSuffix
    }

    const isImg2img = !!params.extraBody?.image
    const body: Record<string, any> = {
      model: this.config.model,
      prompt,
      size: params.size || '512x512',
    }
    if (params.extraBody) {
      body.extra_body = params.extraBody
    }

    if (DEBUG) {
      console.log('\n========== [Agnes 图像生成请求] ==========')
      console.log('Model:', this.config.model)
      console.log('Mode:', isImg2img ? '图生图 (img2img)' : '文生图')
      if (isImg2img) {
        console.log('参考图:', params.extraBody?.image)
      }
      console.log('Prompt:', prompt)
    }

    const response = await fetchWithTimeout(`${this.config.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown')
      console.error('Agnes Image API error:', response.status, errorText)
      throw new Error(`Image API error: ${response.status}`)
    }

    const result = await response.json()
    if (DEBUG) {
      console.log('\n========== [Agnes 图像生成响应] ==========')
      console.log('Status:', response.status)
      console.log('Image URL:', result.data?.[0]?.url)
      console.log('============================================\n')
    }

    return {
      url: result.data?.[0]?.url,
      revisedPrompt: result.data?.[0]?.revised_prompt,
    }
  }
}

// ════════════════════════════════════════════════════════════
// Agnes 视频 Provider
// ════════════════════════════════════════════════════════════

export class AgnesVideoProvider implements VideoProvider {
  readonly name = 'agnes'
  private config: VideoProviderConfig

  constructor(config: VideoProviderConfig) {
    this.config = config
  }

  async submit(params: {
    imageUrls: string[]
    prompt?: string
    frames?: number
    fps?: number
  }): Promise<VideoTask> {
    const response = await fetchWithTimeout(`${this.config.baseUrl}/v1/videos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        prompt: params.prompt || getVideoConfig().fallback,
        extra_body: {
          image: params.imageUrls,
          mode: 'keyframes',
        },
        num_frames: params.frames || this.config.defaultFrames || 241,
        frame_rate: params.fps || this.config.defaultFps || 24,
      }),
    })

    if (!response.ok) {
      throw new Error(`Video API error: ${response.status}`)
    }

    const result = await response.json()
    return {
      taskId: result.video_id,
      status: 'pending',
    }
  }

  async poll(taskId: string): Promise<VideoResult> {
    const response = await fetchWithTimeout(
      `${this.config.baseUrl}/agnesapi?video_id=${taskId}`,
      {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
      }
    )

    if (!response.ok) {
      throw new Error(`Video result API error: ${response.status}`)
    }

    const result = await response.json()
    return {
      taskId,
      status: this.mapStatus(result.status),
      progress: result.progress || 0,
      videoId: result.video_id,
      error: result.error,
    }
  }

  /** 将 Agnes 的状态字符串映射为标准 VideoResult 状态 */
  private mapStatus(agnesStatus: string): VideoResult['status'] {
    switch (agnesStatus) {
      case 'completed':
      case 'success':
        return 'completed'
      case 'failed':
      case 'error':
        return 'failed'
      case 'processing':
      case 'running':
        return 'processing'
      default:
        return 'pending'
    }
  }
}
