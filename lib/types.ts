// 成语分解结果
export interface IdiomDecomposition {
  idiom: string
  meaning: string
  characterDescription?: string
  styleDescription?: string
  scenes: SceneTemplate[]
}

// 场景模板（LLM 返回）
export interface SceneTemplate {
  title: string
  description: string
  prompt: string
  narration: string
  compositionHint?: string  // 新增：构图提示
}

// 场景（包含图像）
export interface Scene extends SceneTemplate {
  id: number
  imageBlob?: Blob
  imageHash?: string
  imageUrl?: string
}

// 绘本
export interface PictureBook {
  id: string
  title: string
  idiom: string
  meaning: string
  createdAt: string
  scenes: Scene[]
  videoBlob?: Blob
  videoUrl?: string
}

// Agnes API 响应类型
export interface AgnesChatResponse {
  id: string
  choices: Array<{
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface AgnesImageResponse {
  data: Array<{
    url: string
  }>
}

export interface AgnesVideoTaskResponse {
  id: string
  task_id: string
  video_id: string
  status: string
  progress: number
}

export interface AgnesVideoResultResponse {
  id: string
  video_id: string
  status: string
  progress: number
  remixed_from_video_id?: string
  error?: string
}
