'use server'

import { chatCompletion } from '@/lib/agnes-api'
import type { IdiomDecomposition, SceneTemplateRaw, DecompositionRaw } from '@/lib/types'

const SYSTEM_PROMPT =
  '你是一位专业的儿童绘本故事策划，擅长将成语故事拆分为适合儿童阅读的场景。请始终以 JSON 格式返回结果。'

const USER_PROMPT_TEMPLATE = (idiom: string) =>
  `请将成语「${idiom}」的故事拆分为 5-10 个关键场景。简单的故事拆分为 5-6 个场景，复杂的故事拆分为 7-10 个场景。

要求：
1. 每个场景需要包含：标题、场景描述（用于生成图像的提示词）、旁白文本（适合朗读给孩子听）
2. 场景要按故事发展顺序排列，形成完整的叙事弧线
3. 场景描述要具体、生动，适合 AI 图像生成
4. 旁白文本要简洁、有韵律感，适合亲子朗读
5. 整体风格要适合 3-8 岁儿童
6. prompt 字段必须是英文，用于 AI 图像生成
7. 所有场景必须保持统一的画风和色调，确保视觉一致性
8. 所有场景中的主要角色必须保持一致的外貌特征，确保角色识别度

请严格以以下 JSON 格式返回，不要包含任何其他内容：
{
  "meaning": "成语的含义解释",
  "characterDescription": "主要角色的统一外貌描述（英文，用于所有场景的prompt）",
  "styleDescription": "统一的画风和色调描述（英文，用于所有场景的prompt）",
  "scenes": [
    {
      "title": "场景标题",
      "description": "场景描述",
      "prompt": "English prompt for AI image generation, must include characterDescription and styleDescription",
      "compositionHint": "English composition instruction, e.g. close-up shot, wide angle scene, bird's eye view, medium shot, over-the-shoulder, low angle, dramatic angle",
      "narration": "旁白文本"
    }
  ]
}`

export async function decomposeIdiom(idiom: string): Promise<IdiomDecomposition> {
  const result = await chatCompletion([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: USER_PROMPT_TEMPLATE(idiom) },
  ])

  const content = result.choices[0]?.message?.content
  if (!content) {
    throw new Error('LLM 返回内容为空')
  }

  // 尝试解析 JSON（可能包含 markdown 代码块）
  let jsonStr = content
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim()
  }

  // 如果没有代码块，尝试直接解析
  // 有时 LLM 会在 JSON 前后添加说明文字
  const jsonStart = jsonStr.indexOf('{')
  const jsonEnd = jsonStr.lastIndexOf('}')
  if (jsonStart !== -1 && jsonEnd !== -1) {
    jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1)
  }

  let data: DecompositionRaw
  try {
    data = JSON.parse(jsonStr)
  } catch (parseError) {
    throw new Error(
      `LLM 返回的 JSON 解析失败：${parseError instanceof Error ? parseError.message : String(parseError)}\n原始内容：${jsonStr.substring(0, 500)}`
    )
  }

  // 验证返回格式
  if (!data.meaning || !Array.isArray(data.scenes) || data.scenes.length === 0) {
    throw new Error('LLM 返回格式不正确')
  }

  // 获取角色描述和风格描述
  const characterDescription = data.characterDescription || ''
  const styleDescription = data.styleDescription || ''

  return {
    idiom,
    meaning: data.meaning,
    scenes: data.scenes.map((s: SceneTemplateRaw, i: number) => {
      // 构建统一的prompt，包含角色描述和风格描述
      let prompt = s.prompt || `A cartoon scene for ${idiom} story`
      
      // 如果有角色描述，添加到prompt开头
      if (characterDescription) {
        prompt = `${characterDescription}, ${prompt}`
      }
      
      // 插入构图指令
      const compositionHint = s.compositionHint || ''
      if (compositionHint) {
        prompt = `${prompt}, ${compositionHint}`
      }
      
      // 如果有风格描述，添加到prompt末尾
      if (styleDescription) {
        prompt = `${prompt}, ${styleDescription}`
      }

      return {
        id: i + 1,
        title: s.title || `场景 ${i + 1}`,
        description: s.description || '',
        prompt: prompt,
        narration: s.narration || '',
        compositionHint,
      }
    }),
  }
}
