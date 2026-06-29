// lib/prompts/types.ts
// 提示词配置文件的类型定义

/** 按品类分组的提示词配置（decompose.json / recommend.json 的结构） */
export interface PromptDomainConfig {
  system: Record<string, string>
  userTemplate: Record<string, string>
}

/** 图像生成配置（image.json 的结构） */
export interface ImagePromptConfig {
  fallback: string
  sceneFallback: string
  styleSuffix: string
  styleKeyword: string
  maxLength: number
  enhancedTemplate: {
    theme: string
    character: string
    style: string
    scene: string
    description: string
    composition: string
    prompt: string
  }
}

/** 视频生成配置（video.json 的结构） */
export interface VideoPromptConfig {
  fallback: string
}

/** 模板变量字典 */
export type TemplateVars = Record<string, string | number | boolean | undefined>
