'use server'

import { chatCompletion } from '@/lib/agnes-api'
import type { IdiomInfo } from '@/lib/idioms'

const SYSTEM_PROMPT =
  '你是一位专业的儿童教育专家，擅长为3-8岁儿童推荐适合的成语故事。请始终以 JSON 格式返回结果。'

function buildUserPrompt(exclude: string[]): string {
  const excludeText = exclude.length > 0
    ? `\n请不要推荐以下已出现过的成语：${exclude.join('、')}`
    : ''

  return `请推荐 10 个适合 3-8 岁儿童学习的成语故事。${excludeText}

要求：
1. 成语要常见、经典，适合儿童理解
2. 每个成语要有趣味性，能吸引孩子
3. 涵盖不同类别（寓言、历史、励志、智慧等）
4. 含义解释要简单易懂，用小朋友能理解的语言

请严格以以下 JSON 数组格式返回，不要包含任何其他内容：
[
  { "idiom": "成语", "meaning": "含义解释", "category": "类别" }
]`
}

export async function fetchRecommendedIdioms(
  exclude: string[] = []
): Promise<IdiomInfo[]> {
  // 限制排除列表长度，防止 LLM 提示词过大
  if (exclude.length > 50) {
    exclude = exclude.slice(0, 50)
  }

  const result = await chatCompletion([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(exclude) },
  ])

  const content = result.choices[0]?.message?.content
  if (!content) {
    throw new Error('LLM 返回内容为空')
  }

  // 解析 JSON（可能包含 markdown 代码块）
  let jsonStr = content
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim()
  }

  const jsonStart = jsonStr.indexOf('[')
  const jsonEnd = jsonStr.lastIndexOf(']')
  if (jsonStart !== -1 && jsonEnd !== -1) {
    jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1)
  }

  const data = JSON.parse(jsonStr)

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('LLM 返回格式不正确')
  }

  return data
    .filter((item: any) => item.idiom && item.meaning && item.category)
    .map((item: any) => ({
      idiom: item.idiom,
      meaning: item.meaning,
      category: item.category,
    }))
}
