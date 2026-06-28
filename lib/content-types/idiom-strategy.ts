import type { ContentTypeStrategy } from './types'

const DECOMPOSE_SYSTEM_PROMPT =
  '你是一位专业的儿童绘本故事策划，擅长将成语故事拆分为适合儿童阅读的场景。请始终以 JSON 格式返回结果。'

const DECOMPOSE_USER_TEMPLATE = (idiom: string) =>
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
      "compositionHint": "English composition instruction, e.g. close-up shot, wide angle scene",
      "narration": "旁白文本"
    }
  ]
}`

const RECOMMEND_USER_TEMPLATE = (exclude: string[]) =>
  `请推荐 10 个适合 3-8 岁儿童学习的成语故事。${exclude.length > 0 ? `\n请不要推荐以下已出现过的成语：${exclude.join('、')}` : ''}

要求：
1. 成语要常见、经典，适合儿童理解
2. 每个成语要有趣味性，能吸引孩子
3. 涵盖不同类别（寓言、历史、励志、智慧等）
4. 含义解释要简单易懂，用小朋友能理解的语言

请严格以以下 JSON 数组格式返回，不要包含任何其他内容：
[
  { "idiom": "成语", "meaning": "含义解释", "category": "类别" }
]`

const VALID_IDIOM_RE = /^[\u4e00-\u9fff]{4}$/

export const idiomStrategy: ContentTypeStrategy = {
  category: 'idiom',
  label: '成语',
  icon: '🎭',
  getDecomposePrompt: (text) => `${DECOMPOSE_SYSTEM_PROMPT}\n\n${DECOMPOSE_USER_TEMPLATE(text)}`,
  getRecommendPrompt: (exclude) => RECOMMEND_USER_TEMPLATE(exclude),
  validate: (text) => VALID_IDIOM_RE.test(text),
}
