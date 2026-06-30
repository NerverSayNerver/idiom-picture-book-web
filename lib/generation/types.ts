// lib/generation/types.ts
// 通用多媒体生成抽象层：定义 ImageProvider / VideoProvider 接口及通用类型
//
// 对接新模型只需：
//   1. 实现 ImageProvider 或 VideoProvider 接口
//   2. 在 registry.ts 中 register
//   3. 环境变量 IMAGE_PROVIDER / VIDEO_PROVIDER 切换

// ── 图像生成 ─────────────────────────────────────────────────

export interface ImageResult {
  url: string
  revisedPrompt?: string
}

export interface ImageGenerateParams {
  prompt: string
  /** 尺寸字符串，如 "512x512"、"1024x1024" */
  size?: string
}

export interface ImageGenerateWithRefParams {
  prompt: string
  /** 参考图 URL（remote URL 或 base64 data URI） */
  referenceImageUrl: string
  size?: string
}

export interface ImageProvider {
  readonly name: string
  generate(params: ImageGenerateParams): Promise<ImageResult>
  generateWithRef(params: ImageGenerateWithRefParams): Promise<ImageResult>
}

// ── 视频生成 ─────────────────────────────────────────────────

export interface VideoTask {
  taskId: string
  status: 'pending' | 'processing'
}

export interface VideoResult {
  taskId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  videoId?: string
  videoUrl?: string
  error?: string
}

export interface VideoSubmitParams {
  imageUrls: string[]
  prompt?: string
  /** 总帧数 */
  frames?: number
  /** 帧率 */
  fps?: number
}

export interface VideoProvider {
  readonly name: string
  submit(params: VideoSubmitParams): Promise<VideoTask>
  poll(taskId: string): Promise<VideoResult>
}

// ── Provider 配置 ────────────────────────────────────────────

export interface ImageProviderConfig {
  apiKey: string
  baseUrl: string
  model: string
  maxWidth?: number
  maxHeight?: number
}

export interface VideoProviderConfig {
  apiKey: string
  baseUrl: string
  model: string
  defaultFrames?: number
  defaultFps?: number
}
