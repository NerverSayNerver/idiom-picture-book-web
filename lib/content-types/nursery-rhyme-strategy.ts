import type { ContentTypeStrategy } from './types'

export const nurseryRhymeStrategy: ContentTypeStrategy = {
  category: 'nursery-rhyme',
  label: '儿歌',
  icon: '🎵',

  getDecomposeVars: (rhyme, _fullText) => ({
    text: rhyme,
  }),

  getRecommendVars: (exclude) => ({
    hasExcludes: exclude.length > 0,
    excludesText: exclude.join('、'),
  }),

  validate: (text) => text.length >= 2,
}
