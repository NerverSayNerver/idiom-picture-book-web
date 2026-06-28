'use server'

import { chatCompletion } from '@/lib/agnes-api'
import { getStrategy } from '@/lib/content-types'
import type { IdiomDecomposition, SceneTemplateRaw, DecompositionRaw, ContentCategory } from '@/lib/types'

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

  let data: DecompositionRaw
  try {
    data = JSON.parse(jsonStr)
  } catch (parseError) {
    throw new Error(
      `LLM 返回的 JSON 解析失败：${parseError instanceof Error ? parseError.message : String(parseError)}\n原始内容：${jsonStr.substring(0, 500)}`
    )
  }

  if (!data.meaning || !Array.isArray(data.scenes) || data.scenes.length === 0) {
    throw new Error('LLM 返回格式不正确')
  }

  const characterDescription = data.characterDescription || ''
  const styleDescription = data.styleDescription || ''

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
