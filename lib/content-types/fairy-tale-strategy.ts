import type { ContentTypeStrategy } from './types'

export const fairyTaleStrategy: ContentTypeStrategy = {
  category: 'fairy-tale',
  label: '童话',
  icon: '🏰',
  getDecomposePrompt: (tale) => `你是一位专业的儿童绘本故事策划师，擅长将童话故事改编为适合 3-8 岁儿童的绘本场景。

请将童话故事「${tale}」拆分为 8-12 个绘本场景。要求：
1. 按经典故事弧线拆分：背景/角色介绍 → 冲突出现 → 困难升级 → 转折/高潮 → 解决 → 寓意
2. 每个场景需推动剧情发展，没有冗余
3. 场景描述要生动、细腻，适合 AI 图像生成
4. 旁白（narration）需连贯叙事，适合亲子朗读
5. 如果故事中有多个角色，prompt 中必须明确区分每个角色的外貌特征
6. 所有场景保持统一的插画风格和色调
7. 最后一个场景必须是寓意总结页，点出故事的教育意义

请严格按照以下 JSON 格式返回：
{
  "meaning": "故事寓意（适合儿童理解的总结）",
  "characterDescription": "所有主要角色的外貌描述（英文，逐个角色描述）",
  "styleDescription": "统一的画风和色调描述（英文，建议经典故事绘本插画风）",
  "scenes": [
    {
      "title": "场景标题",
      "description": "场景描述（中文，包含角色动作、环境细节）",
      "prompt": "English prompt for AI image generation, classic storybook illustration style...",
      "compositionHint": "English composition instruction",
      "narration": "旁白叙事文本"
    }
  ]
}`,
  getRecommendPrompt: (exclude) => `请推荐 10 个适合 3-8 岁儿童的经典童话故事/寓言故事。${exclude.length > 0 ? `\n请不要推荐以下已出现过的童话：${exclude.join('、')}` : ''}

要求：
1. 故事情节完整，有教育寓意
2. 角色鲜明，适合儿童理解

请严格以 JSON 数组格式返回：
[
  { "idiom": "故事名称", "meaning": "故事寓意", "category": "童话" }
]`,
  validate: (text) => text.length >= 2,
}
