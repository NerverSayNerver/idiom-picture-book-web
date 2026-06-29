import type { ContentTypeStrategy } from './types'

export const proverbStrategy: ContentTypeStrategy = {
  category: 'proverb',
  label: '谚语',
  icon: '💬',

  getDecomposeVars: (proverb, _fullText) => ({
    text: proverb,
  }),

  getRecommendVars: (exclude) => ({
    hasExcludes: exclude.length > 0,
    excludesText: exclude.join('、'),
  }),

  validate: (text) => text.length >= 4,
}
