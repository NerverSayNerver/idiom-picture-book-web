// regenerate-all.ts
// 串行批量重新生成所有品类的绘本数据（清理 DB + 旧数据，逐个生成）
// 用法: npx tsx regenerate-all.ts

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { promises as fs } from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { decomposeSource } from './app/actions/decompose'
import { generateSceneImage, generateSceneImageWithRef } from './app/actions/generate'
import { saveBook } from './lib/save-book'
import { buildEnhancedPrompt } from './lib/prompts'
import {
  IDIOM_LIST,
} from './lib/content-info'
import type { ContentCategory, PictureBook } from './lib/types'

/** generateOneBook 透传给绘本的可选扩展字段 */
type ExtraBookFields = Pick<PictureBook, 'author' | 'dynasty' | 'fullText'>

// ── 清理 ──────────────────────────────────────────────────────

// ── 下载图片到本地 ────────────────────────────────────────────

async function downloadImage(url: string, filePath: string): Promise<void> {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`下载失败: ${resp.status} ${url}`)
  const buf = Buffer.from(await resp.arrayBuffer())
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, buf)
}

// ── 图生图参考图查找（base64 Data URI）────────────────────────

async function findReferenceImage(
  category: string,
  sourceText: string,
  currentSceneId: number
): Promise<string | undefined> {
  for (let i = 1; i < currentSceneId; i++) {
    const refPath = path.join(process.cwd(), 'public', 'generated', category, sourceText, `${i}.png`)
    try {
      const buf = await fs.readFile(refPath)
      const ext = path.extname(refPath).toLowerCase()
      const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png'
      return `data:${mime};base64,${buf.toString('base64')}`
    } catch { /* 不存在 */ }
  }
  return undefined
}

// ── 单本书的完整生成流程（串行）────────────────────────────────

async function generateOneBook(
  sourceText: string,
  category: ContentCategory,
  extraFields: ExtraBookFields = {}
): Promise<void> {
  const bookBaseDir = path.join('public', 'generated', category, sourceText)
  const outDir = path.join(process.cwd(), 'public', 'generated', category, sourceText)

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`📖 开始: ${category} / ${sourceText}`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)

  // Step 1: LLM 分解
  console.log(`  [1/3] LLM 场景分解...`)
  const decomposition = await decomposeSource(sourceText, category)
  console.log(`  → 分解完成: ${decomposition.scenes.length} 个场景`)

  // Step 2: 逐个场景生图（严格串行，带频次间隔）
  const imagePaths: string[] = []
  for (let i = 0; i < decomposition.scenes.length; i++) {
    const scene = decomposition.scenes[i]
    const sceneNum = i + 1
    const pngPath = path.join(outDir, `${sceneNum}.png`)

    console.log(`  [2/${decomposition.scenes.length}] 场景 ${sceneNum}/${decomposition.scenes.length}: ${scene.title}...`)

    // 构建增强版 prompt（与 worker 一致）
    const enhancedPrompt = buildEnhancedPrompt({
      meaning: decomposition.meaning,
      characterDescription: decomposition.characterDescription,
      styleDescription: decomposition.styleDescription,
      sceneId: sceneNum,
      sceneTitle: scene.title,
      sceneDescription: scene.description,
      compositionHint: scene.compositionHint,
      scenePrompt: scene.prompt,
    })

    // 找参考图
    const refBase64 = await findReferenceImage(category, sourceText, sceneNum)

    let imageUrl: string
    if (refBase64) {
      imageUrl = await generateSceneImageWithRef(enhancedPrompt, refBase64)
    } else {
      imageUrl = await generateSceneImage(enhancedPrompt)
    }

    // 下载本地
    await downloadImage(imageUrl, pngPath)
    const localUrl = `/generated/${category}/${sourceText}/${sceneNum}.png`
    imagePaths.push(localUrl)
    console.log(`    ✅ 已保存 ${localUrl}`)

    // 场景之间间隔，避免触发频次限制
    if (i < decomposition.scenes.length - 1) {
      await new Promise((r) => setTimeout(r, 3000))
    }
  }

  // Step 3: 组装 book 并保存
  console.log(`  [3/3] 保存 book.json...`)
  const book: PictureBook = {
    id: uuidv4(),
    category,
    sourceText,
    title: sourceText,
    idiom: sourceText,
    meaning: decomposition.meaning,
    author: extraFields.author,
    dynasty: extraFields.dynasty,
    fullText: extraFields.fullText,
    createdAt: new Date().toISOString(),
    scenes: decomposition.scenes.map((s, i) => ({
      ...s,
      id: i + 1,
      imageUrl: imagePaths[i],
    })),
  }

  await saveBook(book)
  console.log(`  ✅ 完成: ${bookBaseDir}`)
}

// ── 主流程 ────────────────────────────────────────────────────

async function main() {
  // 已清理过旧数据，直接开始生成
  console.log('🚀 跳过清理，直接开始生成绘本...')

  // 只处理成语故事
  const items: Array<{ sourceText: string; category: ContentCategory; extra?: ExtraBookFields }> = []

  for (const item of IDIOM_LIST) {
    items.push({ sourceText: item.sourceText, category: 'idiom' as ContentCategory })
  }

  console.log(`\n📋 共 ${items.length} 本成语绘本待生成`)
  console.log(`⏱ 预计耗时: 每本书 ~${Math.round(items.length * 0.5)} 分钟（串行，受 API 限流影响）`)

  // 串行逐个生成
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    console.log(`\n[${i + 1}/${items.length}] ${item.category} / ${item.sourceText}`)
    try {
      await generateOneBook(item.sourceText, item.category, item.extra || {})
    } catch (err) {
      console.error(`❌ 生成失败: ${item.sourceText} - ${err}`)
      // 继续下一个，不中断
    }
    // 每个书之间稍作间隔，避免触发频次限制
    if (i < items.length - 1) {
      await new Promise((r) => setTimeout(r, 2000))
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`🎉 全部完成！共处理 ${items.length} 本书`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
}

main().catch((err) => {
  console.error('致命错误:', err)
  process.exit(1)
})
