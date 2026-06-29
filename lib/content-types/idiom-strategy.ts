import type { ContentTypeStrategy } from './types'

const VALID_IDIOM_RE = /^[\u4e00-\u9fff]{4}$/

export const idiomStrategy: ContentTypeStrategy = {
  category: 'idiom',
  label: '成语',
  icon: '🎭',

  getDecomposeVars: (text, _fullText) => ({
    text,
  }),

  getRecommendVars: (exclude) => ({
    hasExcludes: exclude.length > 0,
    excludesText: exclude.join('、'),
  }),

  validate: (text) => VALID_IDIOM_RE.test(text),
}
