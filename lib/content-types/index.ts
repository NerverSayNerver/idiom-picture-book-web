import type { ContentCategory } from '@/lib/types'
import type { ContentTypeStrategy } from './types'

const registry = new Map<ContentCategory, ContentTypeStrategy>()

export function registerStrategy(strategy: ContentTypeStrategy): void {
  registry.set(strategy.category, strategy)
}

export function getStrategy(category: ContentCategory): ContentTypeStrategy {
  const strategy = registry.get(category)
  if (!strategy) throw new Error(`Unknown content category: ${category}`)
  return strategy
}

export function getAllStrategies(): ContentTypeStrategy[] {
  return Array.from(registry.values())
}

// 透传 content-info 的导出，方便其他模块统一从 content-types 导入
export { getContentInfo } from '@/lib/content-info'

// 注册所有策略
import { idiomStrategy } from './idiom-strategy'
import { poetryStrategy } from './poetry-strategy'
import { nurseryRhymeStrategy } from './nursery-rhyme-strategy'
import { proverbStrategy } from './proverb-strategy'
import { fairyTaleStrategy } from './fairy-tale-strategy'

registerStrategy(idiomStrategy)
registerStrategy(poetryStrategy)
registerStrategy(nurseryRhymeStrategy)
registerStrategy(proverbStrategy)
registerStrategy(fairyTaleStrategy)
