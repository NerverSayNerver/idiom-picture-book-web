import type { ContentTypeStrategy } from './types'

export const proverbStrategy: ContentTypeStrategy = {
  category: 'proverb',
  label: '谚语',
  icon: '💬',
  getDecomposePrompt: (proverb) => `你是一位儿童绘本策划师，擅长将谚语/俗语转化为适合 3-8 岁儿童理解的生活场景绘本。

请将谚语「${proverb}」拆分为 4-6 个生活场景，帮助儿童理解这条谚语的含义。要求：
1. 每个场景展示谚语寓意的一个侧面，用小动物或小朋友的生活故事来呈现
2. 场景要贴近 3-8 岁儿童的日常生活体验（幼儿园、家庭、公园等）
3. 旁白（narration）要简洁、有韵律感，适合亲子朗读
4. 不要在场景中直接说出谚语原文，而是用故事让孩子自然领悟道理
5. 最后一个场景是回顾总结页，用简单的话说明「这个谚语告诉我们...」
6. 所有场景需保持统一的画风和角色外观

请严格按照以下 JSON 格式返回：
{
  "meaning": "谚语的含义解释（适合儿童理解）",
  "characterDescription": "主要角色的统一外貌描述（英文）",
  "styleDescription": "统一的画风和色调描述（英文，建议温暖明快的绘本风格）",
  "scenes": [
    {
      "title": "场景标题",
      "description": "场景描述（中文）",
      "prompt": "English prompt for AI image generation, warm picture book style...",
      "compositionHint": "English composition instruction",
      "narration": "旁白文本"
    }
  ]
}`,
  getRecommendPrompt: (exclude) => `请推荐 10 条适合 3-8 岁儿童的生活智慧谚语/俗语。${exclude.length > 0 ? `\n请不要推荐以下已出现过的谚语：${exclude.join('、')}` : ''}

要求：
1. 通俗易懂，有教育意义
2. 涵盖勤奋、诚实、友爱、智慧等主题

请严格以 JSON 数组格式返回：
[
  { "idiom": "谚语", "meaning": "含义解释", "category": "谚语" }
]`,
  validate: (text) => text.length >= 4,
}
