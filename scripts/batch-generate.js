/**
 * 批量生成绘本流水线脚本
 * 
 * 用法:
 *   node scripts/batch-generate.js --category=idiom     # 只生成成语
 *   node scripts/batch-generate.js --category=all       # 生成所有品类
 *   node scripts/batch-generate.js --category=poetry --items=静夜思,春晓  # 指定条目
 *
 * 前置条件: 需要 dev server 运行在 localhost:3000（API 路由）
 */

const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')

const BASE_DIR = path.join(__dirname, '..', 'public', 'generated')
const API_BASE = 'http://localhost:3000'

// 各品类要生成的内容列表
const CONTENT_MAP = {
  idiom: [
    '守株待兔', '叶公好龙', '愚公移山', '狐假虎威', '拔苗助长',
    '画蛇添足', '亡羊补牢', '井底之蛙', '掩耳盗铃', '刻舟求剑',
    '对牛弹琴', '杯弓蛇影', '鹤立鸡群', '画龙点睛', '坐井观天',
    '一举两得', '三心二意', '半途而废', '目不转睛', '津津有味',
  ],
  poetry: [
    '静夜思', '春晓', '咏鹅', '悯农', '登鹳雀楼', '江雪',
    '望庐山瀑布', '绝句', '早发白帝城', '望天门山',
  ],
  'nursery-rhyme': [
    '小兔子乖乖', '两只老虎', '小燕子', '数鸭子', '拔萝卜', '小星星',
  ],
  proverb: [
    '三个臭皮匠，顶个诸葛亮', '路遥知马力，日久见人心',
    '近朱者赤，近墨者黑', '千里送鹅毛，礼轻情意重',
    '世上无难事，只怕有心人',
  ],
  'fairy-tale': [
    '三只小猪', '小红帽', '龟兔赛跑', '乌鸦喝水', '狼来了', '丑小鸭',
  ],
}

function apiPost(endpoint, data) {
  return new Promise((resolve, reject) => {
    const json = JSON.stringify(data)
    const url = new URL(endpoint, API_BASE)
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) },
    }
    const req = http.request(options, (res) => {
      let body = ''
      res.on('data', (chunk) => body += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(body)) }
        catch { resolve({ error: body }) }
      })
    })
    req.on('error', reject)
    req.write(json)
    req.end()
  })
}

function downloadImage(url, filePath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http
    protocol.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`下载失败: ${res.statusCode}`))
        return
      }
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        fs.writeFileSync(filePath, Buffer.concat(chunks))
        resolve()
      })
    }).on('error', reject)
  })
}

async function generateBook(category, sourceText) {
  console.log(`\n[${category}] 开始: ${sourceText}`)

  const safeName = sourceText.replace(/[\/\\?%*:|"<>]/g, '_')
  const bookDir = path.join(BASE_DIR, category, safeName)
  fs.mkdirSync(bookDir, { recursive: true })

  // Step 1: 调用 decompose API
  console.log(`  → 分解场景...`)
  const decomposeResult = await apiPost('/api/decompose', { sourceText, category })
  if (decomposeResult.error) {
    throw new Error(`decompose 失败: ${decomposeResult.error}`)
  }

  // 保存过程数据
  fs.writeFileSync(
    path.join(bookDir, 'decompose-result.json'),
    JSON.stringify(decomposeResult, null, 2)
  )

  // Step 2: 逐场景生成图像
  const scenes = decomposeResult.scenes || []
  const imagePrompts = []

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i]
    console.log(`  → 生成场景 ${i + 1}/${scenes.length}: ${scene.title}`)

    const imageResult = await apiPost('/api/generate-image', { prompt: scene.prompt })
    if (imageResult.error) {
      console.error(`    图像生成失败: ${imageResult.error}`)
      continue
    }

    imagePrompts.push({ sceneId: i + 1, prompt: scene.prompt })

    // 下载图片
    if (imageResult.url) {
      const imgPath = path.join(bookDir, `${i + 1}.png`)
      try {
        await downloadImage(imageResult.url, imgPath)
        console.log(`    ✓ 图片已保存`)
      } catch (err) {
        console.error(`    ✗ 图片下载失败: ${err.message}`)
      }
    }
  }

  // 保存 prompts.json
  fs.writeFileSync(
    path.join(bookDir, 'prompts.json'),
    JSON.stringify(imagePrompts, null, 2)
  )

  // Step 3: 组装 book.json
  const book = {
    id: safeName,
    category,
    sourceText,
    title: sourceText,
    meaning: decomposeResult.meaning || '',
    author: decomposeResult.author,
    dynasty: decomposeResult.dynasty,
    createdAt: new Date().toISOString(),
    scenes: scenes.map((s, i) => ({
      id: i + 1,
      title: s.title || `场景 ${i + 1}`,
      description: s.description || '',
      prompt: imagePrompts[i]?.prompt || s.prompt || '',
      compositionHint: s.compositionHint || '',
      narration: s.narration || '',
      imageUrl: fs.existsSync(path.join(bookDir, `${i + 1}.png`))
        ? `/generated/${category}/${safeName}/${i + 1}.png`
        : undefined,
    })),
  }

  fs.writeFileSync(path.join(bookDir, 'book.json'), JSON.stringify(book, null, 2))

  // Step 4: 更新 index.json
  updateIndex(category, safeName, book)

  console.log(`  ✓ 完成: ${sourceText} (${scenes.length} 场景)`)
}

function updateIndex(category, id, book) {
  const indexPath = path.join(BASE_DIR, 'index.json')
  let index = { version: 2, generatedAt: new Date().toISOString(), categories: {} }

  if (fs.existsSync(indexPath)) {
    try { index = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) }
    catch { /* 忽略损坏 */ }
  }

  if (!index.categories[category]) {
    const labels = { idiom: '成语', poetry: '古诗', 'nursery-rhyme': '儿歌', proverb: '谚语', 'fairy-tale': '童话' }
    const icons = { idiom: '🎭', poetry: '📜', 'nursery-rhyme': '🎵', proverb: '💬', 'fairy-tale': '🏰' }
    index.categories[category] = { label: labels[category] || category, icon: icons[category] || '', count: 0, items: [] }
  }

  const cat = index.categories[category]
  const existing = cat.items.findIndex(i => i.id === id)
  const entry = {
    id,
    title: book.title,
    meaning: book.meaning,
    sceneCount: book.scenes.length,
    author: book.author,
    dynasty: book.dynasty,
  }

  if (existing >= 0) cat.items[existing] = entry
  else cat.items.push(entry)
  cat.count = cat.items.length

  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2))
}

async function main() {
  const args = process.argv.slice(2)
  const categoryArg = args.find(a => a.startsWith('--category='))
  const itemsArg = args.find(a => a.startsWith('--items='))

  const category = categoryArg ? categoryArg.split('=')[1] : 'all'
  const specificItems = itemsArg ? itemsArg.split('=')[1].split(',') : null

  if (specificItems) {
    for (const item of specificItems) {
      try { await generateBook(category === 'all' ? 'idiom' : category, item.trim()) }
      catch (err) { console.error(`[错误] ${item}: ${err.message}`) }
    }
  } else {
    const categories = category === 'all' ? Object.keys(CONTENT_MAP) : [category]
    for (const cat of categories) {
      const items = CONTENT_MAP[cat] || []
      for (const item of items) {
        try { await generateBook(cat, item) }
        catch (err) { console.error(`[错误] ${cat}/${item}: ${err.message}`) }
      }
    }
  }

  console.log('\n=== 批量生成完成 ===')
}

main().catch(console.error)
