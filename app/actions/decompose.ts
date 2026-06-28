'use server'

import { chatCompletion } from '@/lib/agnes-api'
import { getStrategy, getContentInfo } from '@/lib/content-types'
import type { IdiomDecomposition, SceneTemplateRaw, DecompositionRaw, ContentCategory } from '@/lib/types'

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/**
 * 从 fullText 中提取逐句诗行（去除标点、空白）
 */
function extractPoemLines(fullText: string): string[] {
  return fullText
    .split(/[，。？！\n；：、]+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

/**
 * 计算两个字符串的编辑距离（Levenshtein）
 */
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
  }
  return dp[m][n]
}

/**
 * 古诗后处理：将 LLM 返回的场景标题强制对齐到全诗的诗句原文。
 * 按场景在 scenes 数组中的顺序依次匹配诗句（顺序匹配 + 编辑距离兜底）。
 */
function normalizePoetrySceneTitles(
  scenes: SceneTemplateRaw[],
  poemLines: string[]
): SceneTemplateRaw[] {
  if (poemLines.length === 0 || scenes.length === 0) return scenes

  const used = new Set<number>()

  const bestMatch = (target: string): number => {
    let bestIdx = -1
    let bestDist = Infinity
    for (let i = 0; i < poemLines.length; i++) {
      if (used.has(i)) continue
      const dist = levenshtein(target, poemLines[i])
      if (dist < bestDist) {
        bestDist = dist
        bestIdx = i
      }
    }
    return bestIdx
  }

  return scenes.map((s) => {
    const title = (s.title || '').trim()
    // 优先：正文子串匹配（处理 LLM 加了前后文的情况）
    let matchedIdx = poemLines.findIndex(
      (line) => !used.has(poemLines.indexOf(line)) && title.includes(line) && line.length >= 2
    )
    if (matchedIdx >= 0 && !used.has(matchedIdx)) {
      used.add(matchedIdx)
      return { ...s, title: poemLines[matchedIdx] }
    }
    // 兜底：编辑距离最近
    const idx = bestMatch(title)
    if (idx >= 0) {
      used.add(idx)
      return { ...s, title: poemLines[idx] }
    }
    return s
  })
}

// ---------------------------------------------------------------------------
// 原有代码（json 清理函数保持不变）
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 主函数
// ---------------------------------------------------------------------------

export async function decomposeSource(
  sourceText: string,
  category: ContentCategory = 'idiom'
): Promise<IdiomDecomposition> {
  const strategy = getStrategy(category)
  // 对古诗品类传入 fullText，供 prompt 和后处理使用
  const info = category === 'poetry'
    ? getContentInfo(sourceText, category)
    : undefined
  const fullText = info?.fullText
  const prompt = strategy.getDecomposePrompt(sourceText, fullText)

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

  // 古诗：以 fullText 中的诗句原文作为每个场景的标题
  const poemLines = category === 'poetry' && fullText
    ? extractPoemLines(fullText)
    : []
  const normalizedScenes = category === 'poetry'
    ? normalizePoetrySceneTitles(data.scenes, poemLines)
    : data.scenes

  return {
    idiom: sourceText,
    meaning: data.meaning,
    characterDescription,
    styleDescription,
    scenes: normalizedScenes.map((s: SceneTemplateRaw, i: number) => {
      let prompt = s.prompt || `卡通绘本风格，${sourceText}`
      if (characterDescription) prompt = `${characterDescription}, ${prompt}`
      if (s.compositionHint) prompt = `${prompt}, ${s.compositionHint}`
      if (styleDescription) prompt = `${prompt}, ${styleDescription}`
      return {
        id: i + 1,
        // 古诗：优先使用诗句原文（后处理已保证）；兜底使用 LLM 返回的 title
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
