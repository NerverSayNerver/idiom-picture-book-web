/**
 * 为预生成绘本创建占位图片
 * 生成 SVG 文件（命名 .svg），并更新 book.json 中的 imageUrl
 */
const fs = require('fs')
const path = require('path')

const BASE = path.join(__dirname, '..', 'public', 'generated')

// 各品类主色调
const PALETTE = {
  idiom:         { bg: '#FFF3E0', fg: '#E65100', emoji: '🎭' },
  poetry:        { bg: '#E8EAF6', fg: '#1A237E', emoji: '📜' },
  'nursery-rhyme': { bg: '#F3E5F5', fg: '#6A1B9A', emoji: '🎵' },
  proverb:       { bg: '#E0F2F1', fg: '#004D40', emoji: '💬' },
  'fairy-tale':  { bg: '#FCE4EC', fg: '#880E4F', emoji: '🏰' },
}

function createSvg(title, sceneTitle, sceneIndex, palette) {
  const text = `${title} — ${sceneTitle}`
  const fontSize = text.length > 20 ? 22 : 28
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.bg}"/>
      <stop offset="100%" stop-color="${palette.fg}22"/>
    </linearGradient>
  </defs>
  <rect width="800" height="600" fill="url(#bg)"/>
  <circle cx="400" cy="260" r="80" fill="${palette.fg}15" stroke="${palette.fg}30" stroke-width="2"/>
  <text x="400" y="275" text-anchor="middle" font-size="64">${palette.emoji}</text>
  <text x="400" y="400" text-anchor="middle" font-family="sans-serif" font-size="${fontSize}" fill="${palette.fg}" font-weight="bold">${text}</text>
  <text x="400" y="440" text-anchor="middle" font-family="sans-serif" font-size="16" fill="${palette.fg}88">第 ${sceneIndex} 幕</text>
</svg>`
}

let svgCount = 0
let jsonCount = 0

for (const category of fs.readdirSync(BASE)) {
  const catDir = path.join(BASE, category)
  if (!fs.statSync(catDir).isDirectory() || category.startsWith('.')) continue

  const palette = PALETTE[category]
  if (!palette) continue

  for (const sourceText of fs.readdirSync(catDir)) {
    const bookDir = path.join(catDir, sourceText)
    if (!fs.statSync(bookDir).isDirectory()) continue

    const bookPath = path.join(bookDir, 'book.json')
    if (!fs.existsSync(bookPath)) continue

    let book
    try { book = JSON.parse(fs.readFileSync(bookPath, 'utf-8')) } catch { continue }

    let changed = false
    for (const scene of book.scenes) {
      // 生成 SVG 文件
      const svgPath = path.join(bookDir, `${scene.id}.svg`)
      if (!fs.existsSync(svgPath)) {
        const svg = createSvg(book.title, scene.title, scene.id, palette)
        fs.writeFileSync(svgPath, svg, 'utf-8')
        svgCount++
      }

      // 更新 imageUrl 指向 SVG
      const correctUrl = `/generated/${category}/${sourceText}/${scene.id}.svg`
      if (scene.imageUrl !== correctUrl) {
        scene.imageUrl = correctUrl
        changed = true
      }
    }

    // 删除旧的 .png 引用
    if (changed) {
      fs.writeFileSync(bookPath, JSON.stringify(book, null, 2), 'utf-8')
      jsonCount++
    }
  }
}

// 清理残留的 .png 文件
let cleaned = 0
for (const category of fs.readdirSync(BASE)) {
  const catDir = path.join(BASE, category)
  if (!fs.statSync(catDir).isDirectory() || category.startsWith('.')) continue
  for (const sourceText of fs.readdirSync(catDir)) {
    const bookDir = path.join(catDir, sourceText)
    if (!fs.statSync(bookDir).isDirectory()) continue
    for (const f of fs.readdirSync(bookDir)) {
      if (f.endsWith('.png') && f !== 'book.json') {
        fs.unlinkSync(path.join(bookDir, f))
        cleaned++
      }
    }
  }
}

console.log(`✓ 创建 ${svgCount} 张 SVG 占位图，更新 ${jsonCount} 个 book.json，清理 ${cleaned} 个旧 .png`)
