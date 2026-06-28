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

// 注册成语策略
import { idiomStrategy } from './idiom-strategy'
registerStrategy(idiomStrategy)
