'use server'

import { chatCompletion } from '@/lib/agnes-api'
import type { IdiomDecomposition } from '@/lib/types'

const SYSTEM_PROMPT =
  '你是一位专业的儿童绘本故事策划，擅长将成语故事拆分为适合儿童阅读的场景。请始终以 JSON 格式返回结果。'

const USER_PROMPT_TEMPLATE = (idiom: string) =>
  `请将成语「${idiom}」的故事拆分为 6 个关键场景。

要求：
1. 每个场景需要包含：标题、场景描述（用于生成图像的提示词）、旁白文本（适合朗读给孩子听）
2. 场景要按故事发展顺序排列，形成完整的叙事弧线
3. 场景描述要具体、生动，适合 AI 图像生成
4. 旁白文本要简洁、有韵律感，适合亲子朗读
5. 整体风格要适合 3-8 岁儿童
6. prompt 字段必须是英文，用于 AI 图像生成

请严格以以下 JSON 格式返回，不要包含任何其他内容：
{
  "meaning": "成语的含义解释",
  "scenes": [
    {
      "title": "场景标题",
      "description": "场景描述",
      "prompt": "English prompt for AI image generation, cartoon style",
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

  const data = JSON.parse(jsonStr)

  // 验证返回格式
  if (!data.meaning || !Array.isArray(data.scenes) || data.scenes.length === 0) {
    throw new Error('LLM 返回格式不正确')
  }

  return {
    idiom,
    meaning: data.meaning,
    scenes: data.scenes.map((s: any, i: number) => ({
      id: i + 1,
      title: s.title || `场景 ${i + 1}`,
      description: s.description || '',
      prompt: s.prompt || `A cartoon scene for ${idiom} story`,
      narration: s.narration || '',
    })),
  }
}
