'use server'

import { chatCompletion } from '@/lib/agnes-api'
import { getStrategy } from '@/lib/content-types'
import type { IdiomDecomposition, SceneTemplateRaw, DecompositionRaw, ContentCategory } from '@/lib/types'

/**
 * 清理 LLM 输出中的常见 JSON 问题
 */
function sanitizeLlmJson(str: string): string {
  // 将 LLM 常用的中文引号/单引号替换为标准双引号（仅在 JSON key/value 位置）
  let result = str
  // 移除 ```json ... ``` 包裹（已在上层处理，这里兜底）
  result = result.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  // 替换全角引号为半角
  result = result.replace(/[""]/g, '"')
  // 修复单引号包裹的字符串值: 'xxx' → "xxx"（仅当在 JSON value 位置时）
  result = result.replace(/:\s*'([^']*?)'/g, ': "$1"')
  // 移除尾部逗号（数组/对象末尾）
  result = result.replace(/,\s*([\]}])/g, '$1')
  return result
}

/**
 * 修复被截断的 JSON：补全未闭合的字符串、数组、对象
 */
function repairTruncatedJson(str: string): string | null {
  // 找到最后一个完整的 JSON 对象结尾
  let fixed = str

  // 如果在字符串中间被截断，关闭字符串
  const lastQuote = fixed.lastIndexOf('"')
  if (lastQuote > 0) {
    // 检查引号是否未闭合（引号数量为奇数）
    const quoteCount = (fixed.match(/"/g) || []).length
    if (quoteCount % 2 !== 0) {
      fixed = fixed.substring(0, lastQuote + 1)
    }
  }

  // 计算未闭合的括号
  let braces = 0, brackets = 0
  let inString = false
  let escaped = false
  for (const ch of fixed) {
    if (escaped) { escaped = false; continue }
    if (ch === '\\') { escaped = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') braces++
    if (ch === '}') braces--
    if (ch === '[') brackets++
    if (ch === ']') brackets--
  }

  // 补全缺失的括号
  while (brackets > 0) { fixed += ']'; brackets-- }
  while (braces > 0) { fixed += '}'; braces-- }

  try { JSON.parse(fixed); return fixed } catch { return null }
}

export async function decomposeSource(
  sourceText: string,
  category: ContentCategory = 'idiom'
): Promise<IdiomDecomposition> {
  const strategy = getStrategy(category)
  const prompt = strategy.getDecomposePrompt(sourceText)

  const result = await chatCompletion([
    { role: 'system', content: '你是一位专业的儿童绘本策划师。请始终以 JSON 格式返回结果。' },
    { role: 'user', content: prompt },
  ])

  const content = result.choices[0]?.message?.content
  if (!content) throw new Error('LLM 返回内容为空')

  // 解析 JSON（兼容 markdown 代码块）
  let jsonStr = content
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) jsonStr = jsonMatch[1].trim()
  const jsonStart = jsonStr.indexOf('{')
  const jsonEnd = jsonStr.lastIndexOf('}')
  if (jsonStart !== -1 && jsonEnd !== -1) jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1)

  // 清理 LLM 输出中的常见问题（单引号字符串、尾逗号等）
  jsonStr = sanitizeLlmJson(jsonStr)

  let data: DecompositionRaw
  try {
    data = JSON.parse(jsonStr)
  } catch (parseError) {
    // 尝试修复被截断的 JSON（补全未闭合的括号）
    const repaired = repairTruncatedJson(jsonStr)
    if (repaired) {
      try {
        data = JSON.parse(repaired)
      } catch {
        throw new Error(
          `LLM 返回的 JSON 解析失败：${parseError instanceof Error ? parseError.message : String(parseError)}\n原始内容：${jsonStr.substring(0, 500)}`
        )
      }
    } else {
      throw new Error(
        `LLM 返回的 JSON 解析失败：${parseError instanceof Error ? parseError.message : String(parseError)}\n原始内容：${jsonStr.substring(0, 500)}`
      )
    }
  }

  if (!data.meaning || !Array.isArray(data.scenes) || data.scenes.length === 0) {
    throw new Error('LLM 返回格式不正确')
  }

  // characterDescription / styleDescription 可能是数组（LLM 偶发），统一转为字符串
  const characterDescription = Array.isArray(data.characterDescription)
    ? data.characterDescription.join('. ')
    : (data.characterDescription || '')
  const styleDescription = Array.isArray(data.styleDescription)
    ? data.styleDescription.join('. ')
    : (data.styleDescription || '')

  return {
    idiom: sourceText,
    meaning: data.meaning,
    characterDescription,
    styleDescription,
    scenes: data.scenes.map((s: SceneTemplateRaw, i: number) => {
      let prompt = s.prompt || `A cartoon scene for ${sourceText}`
      if (characterDescription) prompt = `${characterDescription}, ${prompt}`
      if (s.compositionHint) prompt = `${prompt}, ${s.compositionHint}`
      if (styleDescription) prompt = `${prompt}, ${styleDescription}`
      return {
        id: i + 1,
        title: s.title || `场景 ${i + 1}`,
        description: s.description || '',
        prompt,
        narration: s.narration || '',
        compositionHint: s.compositionHint || '',
      }
    }),
  }
}

/** @deprecated 使用 decomposeSource(text, 'idiom') */
export const decomposeIdiom = (idiom: string) => decomposeSource(idiom, 'idiom')
