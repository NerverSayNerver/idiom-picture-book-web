// 品类枚举
export type ContentCategory = 'idiom' | 'poetry' | 'proverb' | 'nursery-rhyme' | 'fairy-tale'

// 泛化内容条目（取代 IdiomInfo）
export interface ContentInfo {
  sourceText: string
  meaning: string
  category: ContentCategory
  author?: string
  dynasty?: string
  /** 古诗全诗 / 儿歌完整歌词 */
  fullText?: string
}

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
  category: ContentCategory
  sourceText: string
  title: string
  idiom: string
  meaning: string
  author?: string
  dynasty?: string
  /** 古诗全诗 / 儿歌完整歌词 */
  fullText?: string
  createdAt: string
  scenes: Scene[]
  videoBlob?: Blob
  videoUrl?: string
}

// OpenAI 兼容的聊天完成响应
export interface ChatCompletionResponse {
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

// 预生成绘本索引条目
export interface PreGeneratedIndexItem {
  id: string
  title: string
  idiom: string
  meaning: string
  createdAt: string
  sceneCount: number
  author?: string
  dynasty?: string
  fullText?: string
}

// LLM 返回的原始场景模板（反序列化前）
export interface SceneTemplateRaw {
  title?: string
  description?: string
  prompt?: string
  narration?: string
  compositionHint?: string
}

// LLM 返回的原始分解结果（反序列化前）
export interface DecompositionRaw {
  meaning?: string
  characterDescription?: string
  styleDescription?: string
  scenes?: SceneTemplateRaw[]
}
