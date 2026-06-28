import type { ContentCategory } from '@/lib/types'

export interface ContentTypeStrategy {
  category: ContentCategory
  label: string
  icon: string

  /** 构建 decompose 的 LLM prompt */
  getDecomposePrompt(text: string): string

  /** 构建 recommend 的 LLM prompt */
  getRecommendPrompt(exclude: string[]): string

  /** 校验原文是否合法 */
  validate(text: string): boolean
}
