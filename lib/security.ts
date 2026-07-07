/**
 * 安全工具模块
 * 提供输入验证、输出消毒、URL白名单验证等功能
 */

// ── 输入验证 ─────────────────────────────────────────────

// 允许的图片/视频域名白名单（完全由环境变量 ALLOWED_IMAGE_DOMAINS 配置，逗号分隔）
// 例如: apihub.agnes-ai.com,platform-outputs.agnes-ai.space
// 注意：必须在函数内读取，避免 ESM import hoisting 导致 dotenv 加载前求值
function getAllowedDomains(): string[] {
  return (process.env.ALLOWED_IMAGE_DOMAINS || '')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean)
}

/**
 * 验证内容输入（成语、古诗等）
 * - 长度限制：1-200 个字符
 * - 仅允许中文字符、字母、数字和常见标点
 */
export function validateContentInput(input: string): { valid: boolean; error?: string } {
  if (!input || typeof input !== 'string') {
    return { valid: false, error: '输入不能为空' }
  }

  const trimmed = input.trim()

  if (!trimmed) {
    return { valid: false, error: '输入不能为空' }
  }

  if (trimmed.length > 200) {
    return { valid: false, error: '输入不能超过 200 个字符' }
  }

  // 允许中文字符、字母、数字、常见标点、空白
  const validPattern = /^[\u4e00-\u9fa5a-zA-Z0-9·、，。！？；：""''（）()\[\]【】\s.,!?;:'"()-]+$/
  if (!validPattern.test(trimmed)) {
    return { valid: false, error: '输入包含非法字符' }
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
 * 移除潜在的脚本标签和事件处理器，然后 HTML 转义
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
    return getAllowedDomains().some(
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

// ── 常量时间字符串比较 ───────────────────────────────────

/**
 * 使用常量时间比较字符串，防止时序攻击
 * 纯 JS 实现，兼容 Edge Runtime（不依赖 Node 的 crypto/Buffer）
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false

  const aLen = a.length
  const bLen = b.length

  // 长度差异通过 XOR 累加到结果中，不提前返回
  let result = aLen ^ bLen

  // 遍历最长字符串，避免通过循环次数泄漏长度信息
  const maxLen = Math.max(aLen, bLen)
  for (let i = 0; i < maxLen; i++) {
    const charA = i < aLen ? a.charCodeAt(i) : 0
    const charB = i < bLen ? b.charCodeAt(i) : 0
    result |= charA ^ charB
  }

  return result === 0
}
