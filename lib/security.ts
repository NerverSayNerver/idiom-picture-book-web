/**
 * 安全工具模块
 * 提供输入验证、输出消毒、URL白名单验证等功能
 */

// ── 输入验证 ─────────────────────────────────────────────

// 允许的图片/视频域名白名单
const ALLOWED_DOMAINS = [
  'apihub.agnes-ai.com',
]

/**
 * 验证成语输入
 * - 长度限制：2-20 个字符
 * - 仅允许中文字符、常见标点
 */
export function validateIdiom(input: string): { valid: boolean; error?: string } {
  const trimmed = input.trim()

  if (!trimmed) {
    return { valid: false, error: '请输入成语' }
  }

  if (trimmed.length < 2) {
    return { valid: false, error: '成语至少需要 2 个字符' }
  }

  if (trimmed.length > 20) {
    return { valid: false, error: '成语不能超过 20 个字符' }
  }

  // 仅允许中文字符、字母、数字和部分标点
  const validPattern = /^[\u4e00-\u9fa5a-zA-Z0-9·、，。！？\s]+$/
  if (!validPattern.test(trimmed)) {
    return { valid: false, error: '成语包含非法字符' }
  }

  return { valid: true }
}

// ── 输出消毒 ─────────────────────────────────────────────

/**
 * HTML 转义，防止 XSS
 */
export function escapeHtml(text: string): string {
  if (!text || typeof text !== 'string') return ''

  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  }

  const htmlEscaper = /[&<>"'/]/g
  return text.replace(htmlEscaper, (match) => htmlEscapes[match])
}

/**
 * 对 LLM 返回的文本进行消毒
 * 移除潜在的脚本标签和事件处理器
 */
export function sanitizeLlmOutput(text: string): string {
  if (!text || typeof text !== 'string') return ''

  let sanitized = text

  // 移除 <script> 标签及其内容
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')

  // 移除事件处理器（如 onerror=, onload= 等）
  sanitized = sanitized.replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
  sanitized = sanitized.replace(/\son\w+\s*=\s*'[^']*'/gi, '')
  sanitized = sanitized.replace(/\son\w+\s*=\s*[^\s>]+/gi, '')

  // 移除 javascript: 协议
  sanitized = sanitized.replace(/javascript:/gi, '')

  // 移除 data: 协议中的 HTML（保留图片的 data: 协议）
  sanitized = sanitized.replace(/data:text\/html/gi, '')

  // HTML 转义剩余内容
  return escapeHtml(sanitized)
}

// ── URL 白名单验证 ───────────────────────────────────────

/**
 * 验证 URL 是否来自可信域名
 */
export function isAllowedUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false

  try {
    const parsed = new URL(url)
    return ALLOWED_DOMAINS.some(
      (domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
    )
  } catch {
    // 如果不是合法 URL（如 data: URI），检查是否是安全的 data URI
    if (url.startsWith('data:image/')) {
      return true
    }
    return false
  }
}

/**
 * 验证并返回安全的 URL，不安全时抛出错误
 */
export function validateUrl(url: string, context = 'URL'): string {
  if (!isAllowedUrl(url)) {
    throw new Error(`不安全的 ${context}: URL 域名不在白名单中`)
  }
  return url
}
