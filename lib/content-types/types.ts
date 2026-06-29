import type { ContentCategory } from '@/lib/types'
import type { TemplateVars } from '@/lib/prompts/types'

export interface ContentTypeStrategy {
  category: ContentCategory
  label: string
  icon: string

  /**
   * 准备 decompose 的模板变量。
   * 提示词模板本身存储在 prompts/decompose.json 中，strategy 只负责计算动态变量。
   */
  getDecomposeVars(text: string, fullText?: string): TemplateVars

  /**
   * 准备 recommend 的模板变量。
   * 提示词模板本身存储在 prompts/recommend.json 中，strategy 只负责计算动态变量。
   */
  getRecommendVars(exclude: string[]): TemplateVars

  /** 校验原文是否合法 */
  validate(text: string): boolean
}
