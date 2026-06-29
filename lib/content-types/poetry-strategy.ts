import type { ContentTypeStrategy } from './types'

export const poetryStrategy: ContentTypeStrategy = {
  category: 'poetry',
  label: '古诗',
  icon: '📜',

  getDecomposeVars: (poem, fullText) => {
    const lines = (fullText || '')
      .split(/[，。？！\n；：、]+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
    const lineCount = lines.length
    const lineExamples = lines.slice(0, 8).map((l, i) => `第${i + 1}句：${l}`).join('\n')
    return {
      text: poem,
      lineCount,
      lineExamples,
    }
  },

  getRecommendVars: (exclude) => ({
    hasExcludes: exclude.length > 0,
    excludesText: exclude.join('、'),
  }),

  validate: (text) => text.length >= 2 && text.length <= 30,
}
