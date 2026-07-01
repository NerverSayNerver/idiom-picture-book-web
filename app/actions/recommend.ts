'use server'

import { chatCompletion } from '@/lib/agnes-api'
import { getStrategy } from '@/lib/content-types'
import { getSystemPrompt, buildUserPrompt } from '@/lib/prompts'
import type { ContentInfo, ContentCategory } from '@/lib/types'

export async function fetchRecommendations(
  category: ContentCategory,
  exclude: string[] = []
): Promise<ContentInfo[]> {
  const strategy = getStrategy(category)

  if (exclude.length > 50) exclude = exclude.slice(0, 50)

  // 从配置获取 system message（品类专属）和 user message（模板变量替换）
  const systemMessage = getSystemPrompt('recommend', category)
  const templateVars = strategy.getRecommendVars(exclude)
  const userMessage = buildUserPrompt('recommend', category, templateVars)

  const result = await chatCompletion([
    { role: 'system', content: systemMessage },
    { role: 'user', content: userMessage },
  ]).catch((err) => {
    // 区分超时与其他错误，方便客户端给出明确提示
    if (err.name === 'AbortError') {
      throw new Error('LLM 请求超时（60s），请稍后重试')
    }
    throw err
  })

  const content = result.choices[0]?.message?.content
  if (!content) throw new Error('LLM 返回内容为空')

  let jsonStr = content
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) jsonStr = jsonMatch[1].trim()
  const jsonStart = jsonStr.indexOf('[')
  const jsonEnd = jsonStr.lastIndexOf(']')
  if (jsonStart !== -1 && jsonEnd !== -1) jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1)

  const data = (() => {
    try {
      return JSON.parse(jsonStr)
    } catch (parseError) {
      console.error('推荐 JSON 解析失败:', parseError)
      throw new Error('LLM 返回的推荐数据格式不正确')
    }
  })()
  if (!Array.isArray(data) || data.length === 0) throw new Error('LLM 返回格式不正确')

  const items = data
    .filter((item: any) => (item.idiom || item.sourceText) && item.meaning && item.category)
    .map((item: any) => ({
      sourceText: item.idiom || item.sourceText,
      meaning: item.meaning,
      category: item.category,
    }))

  if (items.length === 0) {
    throw new Error('LLM 返回结果为空（过滤后无有效条目），请重试')
  }

  return items
}
