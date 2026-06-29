// lib/path-security.ts
// 路径安全工具：防止路径遍历攻击

import path from 'path'

/** 允许的品类白名单 */
export const ALLOWED_CATEGORIES = ['idiom', 'poetry', 'nursery-rhyme', 'proverb', 'fairy-tale'] as const

/**
 * 净化文件名：只保留中文、字母、数字、连字符、下划线
 * 拒绝空字符串、`.`、`..` 等危险值
 */
export function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^\p{L}\p{N}_-]/gu, '_').slice(0, 100)
  if (!cleaned || cleaned === '.' || cleaned === '..' || /^_+$/.test(cleaned)) {
    throw new Error(`Invalid filename: ${name}`)
  }
  return cleaned
}

/**
 * 校验品类是否在白名单内
 */
export function validateCategory(category: string): string {
  if (!ALLOWED_CATEGORIES.includes(category as any)) {
    throw new Error(`Invalid category: ${category}`)
  }
  return category
}

/**
 * 校验最终路径仍在 baseDir 内（防止 .. 穿越）
 */
export function assertPathWithinBase(resolvedPath: string, baseDir: string): void {
  const resolvedBase = path.resolve(baseDir)
  const resolved = path.resolve(resolvedPath)
  if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
    throw new Error('Path traversal detected')
  }
}
