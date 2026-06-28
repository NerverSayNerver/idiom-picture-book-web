import type { ContentTypeStrategy } from './types'

export const nurseryRhymeStrategy: ContentTypeStrategy = {
  category: 'nursery-rhyme',
  label: '儿歌',
  icon: '🎵',
  getDecomposePrompt: (rhyme) => `你是一位儿童绘本策划师，擅长将儿歌/童谣转化为适合 0-6 岁婴幼儿的绘本画面。

请将儿歌「${rhyme}」拆分为 5-8 个童趣场景。要求：
1. 每段歌词（或每 1-2 句）作为一个场景，歌词有副歌时可重复展现但画面不同
2. 每个场景的 narration（旁白）必须是原歌词，保留韵律和重复感
3. 场景描述要表现出歌词中角色的表情和动作
4. 图像 prompt 风格统一为「明亮卡通风格，色彩鲜艳，圆润可爱，适合婴幼儿」
5. 角色需保持一致外貌特征
6. 最后一个场景建议是温馨团圆或大合唱画面

请严格按照以下 JSON 格式返回：
{
  "meaning": "儿歌的教育意义或主题说明",
  "characterDescription": "主要角色的统一外貌描述（英文）",
  "styleDescription": "统一的画风和色调描述（英文，建议明亮卡通风格）",
  "scenes": [
    {
      "title": "场景标题（可用歌词首句）",
      "description": "场景描述（中文）",
      "prompt": "English prompt for AI image generation, bright cartoon style...",
      "compositionHint": "English composition instruction",
      "narration": "原歌词（保留重复和韵律）"
    }
  ]
}`,
  getRecommendPrompt: (exclude) => `请推荐 10 首适合 0-6 岁婴幼儿的经典儿歌/童谣。${exclude.length > 0 ? `\n请不要推荐以下已出现过的儿歌：${exclude.join('、')}` : ''}

要求：
1. 旋律简单，歌词朗朗上口
2. 内容积极向上，有教育意义
3. 涵盖不同主题（动物、自然、生活习惯等）

请严格以 JSON 数组格式返回：
[
  { "idiom": "儿歌名称", "meaning": "内容说明", "category": "儿歌" }
]`,
  validate: (text) => text.length >= 2,
}
