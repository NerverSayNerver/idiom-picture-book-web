import type { ContentTypeStrategy } from './types'

export const poetryStrategy: ContentTypeStrategy = {
  category: 'poetry',
  label: '古诗',
  icon: '📜',
  getDecomposePrompt: (poem, fullText) => {
    const lines = (fullText || '')
      .split(/[，。？！\n；：、]+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
    const lineCount = lines.length
    const lineExamples = lines.slice(0, 8).map((l, i) => `第${i + 1}句：${l}`).join('\n')
    return `你是一位儿童古诗绘本策划师，擅长将古诗转化为适合 3-8 岁儿童的意境绘本画面。

请将古诗「${poem}」拆分为独立场景。

【硬性规则】
1. 场景数量必须严格等于 ${lineCount} 个（全诗共 ${lineCount} 句），不多不少。
2. 每个场景的 title 必须是对应诗句的**原文原句**（不可改写、不可概括、不可加前后文），title 不需要带书名号或引号。
3. 全诗原文供参考：
${lineExamples}
4. 不需要额外添加开篇/背景/意境介绍场景，每一幕直接对应一句诗。

【输出要求】
- 每个场景的 narration（旁白）格式为：原诗句 + 浅显的白话解释（两句之间用空格或换行分隔）
- 场景描述要注重中国传统美学意境（山水、月光、花鸟等）
- 图像 prompt 风格统一为「中国古典水墨/工笔画风，柔和色彩，童趣感」
- 如果需要角色，保持角色外貌一致
- **所有 prompt、characterDescription、styleDescription 必须使用中文**

请严格以 JSON 格式返回：
{
  "meaning": "全诗含义解释（适合儿童理解）",
  "author": "作者名",
  "dynasty": "朝代",
  "styleDescription": "统一的画风和色调描述（中文）",
  "scenes": [
    {
      "title": "原诗句原文（如：床前明月光）",
      "description": "场景描述（中文，描述画面意境）",
      "prompt": "中文生图提示词，中国古典水墨/工笔画风，柔和色彩，童趣感...",
      "compositionHint": "中文构图提示",
      "narration": "原诗句。白话解释..."
    }
  ]
}`
  },
  getRecommendPrompt: (exclude) => `请推荐 10 首适合 3-8 岁儿童学习的经典古诗。${exclude.length > 0 ? `\n请不要推荐以下已出现过的古诗：${exclude.join('、')}` : ''}

要求：
1. 选择五言或七言绝句，篇幅短小
2. 描写内容适合儿童理解（自然、亲情、四季等）
3. 含义解释要简单易懂

请严格以 JSON 数组格式返回：
[
  { "idiom": "诗名", "meaning": "含义解释", "author": "作者", "dynasty": "朝代" }
]`,
  validate: (text) => text.length >= 2 && text.length <= 30,
}
