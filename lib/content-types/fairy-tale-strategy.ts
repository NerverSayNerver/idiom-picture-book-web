import type { ContentTypeStrategy } from './types'

export const fairyTaleStrategy: ContentTypeStrategy = {
  category: 'fairy-tale',
  label: '童话',
  icon: '🏰',

  getDecomposeVars: (tale, _fullText) => ({
    text: tale,
  }),

  getRecommendVars: (exclude) => ({
    hasExcludes: exclude.length > 0,
    excludesText: exclude.join('、'),
  }),

  validate: (text) => text.length >= 2,
}
