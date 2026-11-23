/** @type {import('next').NextConfig} */
const path = require('path')

const nextConfig = {
  // 明确指定 Turbopack workspace root，避免父级目录存在 lockfile 时
  // Next.js 推断出错误的根目录（多 lockfile 警告）
  turbopack: {
    root: path.join(__dirname),
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'apihub.agnes-ai.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // 防止 MIME 类型嗅探
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // 防止点击劫持
          { key: 'X-Frame-Options', value: 'DENY' },
          // XSS 保护
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          // 控制 Referer 信息
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // 权限策略：限制浏览器功能
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // 内容安全策略
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: https: blob:",
              "font-src 'self' https://fonts.gstatic.com data:",
              "connect-src 'self' https://apihub.agnes-ai.com",
              "media-src 'self' https: blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
          // 严格传输安全（HTTPS 环境下生效）
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
      {
        // 派生档位（w320/w480/w768/w1024 WebP）：可长缓存 + 后台再校验。
        // 不用 immutable：重新生成绘本会以同名覆盖，immutable 会让用户永久看到旧图。
        source: '/generated/:path+.webp',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' },
        ],
      },
      {
        // 原图：可能被重新生成覆盖，只允许短缓存
        source: '/generated/:path+.png',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=3600' }],
      },
    ]
  },
}

module.exports = nextConfig
