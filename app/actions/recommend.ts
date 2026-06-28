'use server'

import { chatCompletion } from '@/lib/agnes-api'
import { getStrategy } from '@/lib/content-types'
import type { ContentInfo, ContentCategory } from '@/lib/types'

export async function fetchRecommendations(
  category: ContentCategory,
  exclude: string[] = []
): Promise<ContentInfo[]> {
  const strategy = getStrategy(category)

  if (exclude.length > 50) exclude = exclude.slice(0, 50)
  const prompt = strategy.getRecommendPrompt(exclude)

  const result = await chatCompletion([
    { role: 'system', content: '你是一位儿童教育专家。请始终以 JSON 格式返回结果。' },
    { role: 'user', content: prompt },
  ])

  const content = result.choices[0]?.message?.content
  if (!content) throw new Error('LLM 返回内容为空')

  let jsonStr = content
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) jsonStr = jsonMatch[1].trim()
  const jsonStart = jsonStr.indexOf('[')
  const jsonEnd = jsonStr.lastIndexOf(']')
  if (jsonStart !== -1 && jsonEnd !== -1) jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1)

  const data = JSON.parse(jsonStr)
  if (!Array.isArray(data) || data.length === 0) throw new Error('LLM 返回格式不正确')

  return data
    .filter((item: any) => (item.idiom || item.sourceText) && item.meaning && item.category)
    .map((item: any) => ({
      sourceText: item.idiom || item.sourceText,
      meaning: item.meaning,
      category: item.category,
    }))
}

/** @deprecated 使用 fetchRecommendations('idiom', exclude) */
export const fetchRecommendedIdioms = (exclude: string[] = []) =>
  fetchRecommendations('idiom', exclude)
