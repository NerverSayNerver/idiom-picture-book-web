import type { ContentTypeStrategy } from './types'

export const poetryStrategy: ContentTypeStrategy = {
  category: 'poetry',
  label: '古诗',
  icon: '📜',
  getDecomposePrompt: (poem) => `你是一位儿童古诗绘本策划师，擅长将古诗转化为适合 3-8 岁儿童的意境绘本画面。

请将古诗「${poem}」拆分为 4-8 个意境场景。要求：
1. 每句诗作为一个主要场景，可额外补充开头意境/背景介绍场景
2. 每个场景的 narration（旁白）必须包含：原诗句 + 浅显的白话解释
3. 场景描述要注重中国传统美学意境（山水、月光、花鸟等）
4. 图像 prompt 风格统一为「中国古典水墨/工笔画风，柔和色彩，童趣感」
5. 如果需要角色，保持角色外貌一致

请严格以 JSON 格式返回：
{
  "meaning": "全诗含义解释（适合儿童理解）",
  "author": "作者名",
  "dynasty": "朝代",
  "styleDescription": "统一的画风和色调描述（英文）",
  "scenes": [
    {
      "title": "场景标题（如：床前明月光）",
      "description": "场景描述（中文）",
      "prompt": "English prompt for AI image generation, classical Chinese ink brush style...",
      "compositionHint": "English composition instruction",
      "narration": "原诗句。白话解释..."
    }
  ]
}`,
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
