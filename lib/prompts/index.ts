// lib/prompts/index.ts
// 提示词配置加载层：从 JSON 文件加载提示词，提供模板变量替换

import decomposeConfig from '@/prompts/decompose.json'
import recommendConfig from '@/prompts/recommend.json'
import imageConfig from '@/prompts/image.json'
import videoConfig from '@/prompts/video.json'
import type { PromptDomainConfig, ImagePromptConfig, VideoPromptConfig, TemplateVars } from './types'

// ── 类型映射 ─────────────────────────────────────────────────────
type PromptDomain = 'decompose' | 'recommend'

const DOMAIN_MAP: Record<PromptDomain, PromptDomainConfig> = {
  decompose: decomposeConfig as PromptDomainConfig,
  recommend: recommendConfig as PromptDomainConfig,
}

// ── 模板引擎 ─────────────────────────────────────────────────────

/**
 * 简单的模板变量替换：
 * - {{variableName}} → 变量值
 * - {{#if varName}}...{{/if}} → 条件块（变量为 truthy 时保留内容）
 */
function renderTemplate(template: string, vars: TemplateVars): string {
  let result = template

  // 处理条件块：{{#if varName}}...{{/if}}
  result = result.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, varName, content) => {
      const val = vars[varName]
      if (!val) return ''
      // 递归处理内容块内的变量
      return renderTemplate(content, vars)
    }
  )

  // 处理普通变量替换：{{variableName}}
  result = result.replace(/\{\{(\w+)\}\}/g, (_match, varName) => {
    const val = vars[varName]
    return val !== undefined && val !== null ? String(val) : ''
  })

  return result.trim()
}

// ── 对外 API ─────────────────────────────────────────────────────

/**
 * 获取指定 domain + category 的 system message。
 * 优先返回品类专属 system，无则 fallback 到 generic。
 */
export function getSystemPrompt(domain: PromptDomain, category: string): string {
  const config = DOMAIN_MAP[domain]
  return config.system[category] || config.system.generic || ''
}

/**
 * 构建指定 domain + category 的 user message，支持模板变量替换。
 */
export function buildUserPrompt(domain: PromptDomain, category: string, vars: TemplateVars = {}): string {
  const config = DOMAIN_MAP[domain]
  const template = config.userTemplate[category]
  if (!template) {
    throw new Error(`No user template for domain="${domain}", category="${category}"`)
  }
  return renderTemplate(template, vars)
}

/**
 * 获取图像生成相关配置。
 */
export function getImageConfig(): ImagePromptConfig {
  return imageConfig as ImagePromptConfig
}

/**
 * 获取视频生成相关配置。
 */
export function getVideoConfig(): VideoPromptConfig {
  return videoConfig as VideoPromptConfig
}

/**
 * 构建增强版生图 prompt：注入绘本主题、角色设定、统一画风，确保同绘本图片连贯。
 * 统一 worker.ts 和 regenerate-all.ts 的逻辑，模板从 image.json 读取。
 */
export function buildEnhancedPrompt(params: {
  meaning?: string
  characterDescription?: string
  styleDescription?: string
  sceneId: number
  sceneTitle: string
  sceneDescription?: string
  compositionHint?: string
  scenePrompt: string
}): string {
  const tpl = getImageConfig().enhancedTemplate
  const parts: string[] = []

  const push = (tplStr: string, vars: TemplateVars) => {
    const rendered = renderTemplate(tplStr, vars)
    if (rendered) parts.push(rendered)
  }

  if (params.meaning) {
    push(tpl.theme, { meaning: params.meaning })
  }
  if (params.characterDescription) {
    push(tpl.character, { characterDescription: params.characterDescription })
  }
  if (params.styleDescription) {
    push(tpl.style, { styleDescription: params.styleDescription })
  }

  push(tpl.scene, { sceneId: params.sceneId, sceneTitle: params.sceneTitle })

  if (params.sceneDescription) {
    push(tpl.description, { sceneDescription: params.sceneDescription })
  }
  if (params.compositionHint) {
    push(tpl.composition, { compositionHint: params.compositionHint })
  }

  push(tpl.prompt, { scenePrompt: params.scenePrompt })

  return parts.join('\n')
}

// 导出类型供外部使用
export type { PromptDomain, PromptDomainConfig, ImagePromptConfig, VideoPromptConfig, TemplateVars }
