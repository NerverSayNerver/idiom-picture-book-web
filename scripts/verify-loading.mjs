/**
 * 加载体验验收：机械核对 docs/superpowers/specs/2026-11-23-loading-ux-spec.md §8.5
 * 的 M-01..M-21。P0 任一失败 → 退出码 1；OBS 只记录不参与判定。
 *
 * 用法：
 *   npm run verify                 # 全量 21 条
 *   npm run verify:quick           # 核心回归（M-03/04a/07/12/13）
 *   VERIFY_BASE=http://localhost:3000 npm run verify
 *   VERIFY_JSON=report.json npm run verify
 *
 * 口径说明：
 * - 字节统计用 CDP Network.loadingFinished.encodedDataLength（≈ transferSize，含响应头），
 *   比 performance.transferSize 在本地服务上稳定。
 * - CDP 限速不会改 navigator.connection，弱网条目用 addInitScript 伪造后再限速。
 * - 图片失败用 route.abort 模拟（页面 JS/CSS 仍正常），比整页 offline 更贴近"图挂了"。
 */
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const BASE = process.env.VERIFY_BASE || 'http://localhost:3211'
const BOOK = process.env.VERIFY_BOOK || 'idiom:%E7%94%BB%E8%9B%87%E6%B7%BB%E8%B6%B3'
const READ_URL = `${BASE}/read/${BOOK}`
const QUICK = process.argv.includes('--quick')
const THROTTLE_4G = { offline: false, latency: 150, downloadThroughput: 524288, uploadThroughput: 131072 }
const THROTTLE_2G = { offline: false, latency: 300, downloadThroughput: 196608, uploadThroughput: 65536 }

const results = []
const check = (id, priority, label, value, threshold, pass, detail = '') => {
  results.push({ id, priority, label, value, threshold, pass: Boolean(pass), detail })
  const mark = pass ? 'PASS' : 'FAIL'
  console.log(
    `${id.padEnd(6)} ${priority.padEnd(3)} ${label.padEnd(24)} ` +
      `${String(value).padEnd(14)} ${String(threshold).padEnd(14)} ${mark}` +
      (detail ? `  ${detail}` : ''),
  )
}
const unverifiable = (id, priority, label, why) => {
  results.push({ id, priority, label, value: 'unverifiable', threshold: '', pass: false, detail: why })
  console.log(`${id.padEnd(6)} ${priority.padEnd(3)} ${label.padEnd(24)} ${'unverifiable'.padEnd(14)} ${''.padEnd(14)} FAIL  ${why}`)
}
const kb = (bytes) => `${Math.round(bytes / 1024)}KB`

async function newCtx(browser, opts = {}) {
  const {
    width = 390, height = 844, mobile = true, dpr = 3, reducedMotion,
    throttle, cdpOnly, connection, scripts = [],
  } = opts
  const ctx = await browser.newContext({
    viewport: { width, height }, isMobile: mobile, hasTouch: mobile,
    deviceScaleFactor: dpr, reducedMotion,
  })
  if (connection) {
    await ctx.addInitScript((c) => {
      Object.defineProperty(navigator, 'connection', {
        configurable: true,
        value: {
          effectiveType: c.effectiveType, saveData: c.saveData, downlink: c.downlink, rtt: c.rtt,
          onchange: null, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false },
        },
      })
    }, connection)
  }
  const page = await ctx.newPage()
  let cdp
  if (throttle || cdpOnly) {
    cdp = await ctx.newCDPSession(page)
    await cdp.send('Network.enable')
    if (throttle) {
      await cdp.send('Network.emulateNetworkConditions', throttle)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    }
  }
  for (const s of scripts) await page.addInitScript(s)
  return { ctx, page, cdp }
}

/** CDP 图片字节采集。注意 CDP 的 request.type 是首字母大写 'Image'。 */
function watchImages(cdp) {
  const requests = new Map()
  const imgs = []
  // 资源类型在事件的 type 字段（'Image'），不在 request.type —— 取错字段会静默统计成 0
  cdp.on('Network.requestWillBeSent', (e) => requests.set(e.requestId, { url: e.request.url, type: e.type }))
  cdp.on('Network.loadingFinished', (e) => {
    const r = requests.get(e.requestId)
    if (r && r.type === 'Image') imgs.push({ url: r.url, bytes: e.encodedDataLength })
  })
  return imgs
}

/**
 * 注入：记录 aria-live 文本写入次数。
 * 只盯 sr-only 播报区，且在 DOMContentLoaded 后挂载——观察整个 document 的
 * characterData 会把一次文本更新拆成多个 mutation，在 CPU4x 下还会拖慢页面 30s。
 */
const INJECT_LIVE = () => {
  window.__live = []
  const attach = () => {
    const el = [...document.querySelectorAll('[aria-live="polite"]')].find((n) => n.classList.contains('sr-only'))
    if (!el) return
    let last = el.textContent || ''
    new MutationObserver(() => {
      const text = el.textContent || ''
      if (text !== last) { last = text; window.__live.push({ t: performance.now(), text }) }
    }).observe(el, { subtree: true, childList: true, characterData: true })
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true })
  else attach()
}

/**
 * 占位观测：不在页面生命周期里全局挂 MutationObserver。
 * 全局观察会在 React hydration 时对每个节点做 querySelector，CPU4x 下把首屏饿死 30s。
 * 只在每次翻页的 450ms 窗口内开 8ms 轮询，见 placeholderDuration()。
 */
const INJECT_PLACEHOLDER = () => { window.__ph = [] }

/** 注入：speak 调用时刻 + CLS */
const INJECT_SPEAK_CLS = () => {
  window.__speak = []
  const orig = window.speechSynthesis?.speak
  if (orig) {
    window.speechSynthesis.speak = function (u) {
      window.__speak.push(performance.now())
      return orig.call(this, u)
    }
  }
  window.__cls = 0
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value
  }).observe({ type: 'layout-shift', buffered: true })
}

// 点阵按钮的 aria-label 也是「第 N 页」，只匹配缩略图要用「，打开」后缀
const thumbButtons = (page) => page.locator('button[aria-label$="，打开"]')
const visibleNext = (page) => page.locator('[aria-label="下一页"]:visible').first()
const pageNumber = async (page) => Number(await page.locator('input[aria-label="阅读进度"]').inputValue())
const settle = (page, ms = 450) => page.waitForTimeout(ms)

/** 回封面（逐页退回，遵守 300ms 冷却） */
async function jumpHome(page) {
  const prev = page.locator('[aria-label="上一页"]:visible').first()
  for (let k = 0; k < 12 && (await pageNumber(page)) > 1; k++) {
    await prev.click(); await settle(page, 320)
  }
}

/** 进入指定页（从封面逐页点，遵守 300ms 冷却） */
async function goToPageByClicks(page, target) {
  for (let i = 0; i < target; i++) {
    const btn = visibleNext(page)
    if (await btn.isDisabled()) break
    await btn.click()
    await settle(page)
  }
}

/** M-03 的严格测法：一次翻页的占位可见时长（末页自动回封面） */
async function placeholderDuration(page) {
  if (await visibleNext(page).isDisabled()) await jumpHome(page)
  await page.evaluate(() => {
    window.__ph = []
    window.__phTimer = setInterval(() => {
      window.__ph.push({ t: performance.now(), on: Boolean(document.querySelector('[data-img-placeholder]')) })
    }, 8)
  })
  await visibleNext(page).click({ timeout: 8000 })
  await page.waitForTimeout(450)
  return page.evaluate(() => {
    clearInterval(window.__phTimer)
    let max = 0, start = null
    for (const s of window.__ph) {
      if (s.on && start === null) start = s.t
      else if (!s.on && start !== null) { max = Math.max(max, s.t - start); start = null }
    }
    if (start !== null) max = Math.max(max, performance.now() - start)
    return { d: max, events: window.__ph.filter((s) => s.on).length }
  })
}

/** 封面稳定：6 格全部落定（error 也算落定） */
async function waitCoverSettled(page, timeout = 30000) {
  await page.waitForFunction(
    () => {
      const els = [...document.querySelectorAll('[data-thumb-status]')]
      return els.length === 6 && els.every((e) => e.dataset.thumbStatus !== 'pending')
    },
    null,
    { timeout },
  ).catch(() => {})
}

async function suiteReader(browser) {
  // ── 轮 A：里程碑 + 字节 + 翻页。一轮只注入一个 observer，避免 CPU4x 下互相饿死 ──
  {
    const { ctx, page, cdp } = await newCtx(browser, {
      throttle: THROTTLE_4G, scripts: [INJECT_PLACEHOLDER],
    })
    const imgs = watchImages(cdp)
    await page.goto(READ_URL, { waitUntil: 'load' })

    await page.waitForFunction(() => {
      const el = document.querySelector('h1')
      return Boolean(el && el.getBoundingClientRect().height > 0)
    }, null, { timeout: 5000 }).catch(() => {})
    const h1At = await page.evaluate(() => {
      const el = document.querySelector('h1')
      if (!el) return -1
      const r = el.getBoundingClientRect()
      return r.height > 0 ? performance.now() : -1
    })
    if (h1At >= 0) check('M-05a', 'P0', '封面文字可读', `${Math.round(h1At)}ms`, '≤1200ms', h1At <= 1200)
    else unverifiable('M-05a', 'P0', '封面文字可读', '未找到可见 h1')

    await page.waitForFunction(() => document.querySelectorAll('button[aria-label$="，打开"]').length === 6, null, { timeout: 15000 }).catch(() => {})
    const wallAt = await page.evaluate(() => {
      const bs = [...document.querySelectorAll('button[aria-label$="，打开"]')]
      return bs.length === 6 && bs.every((b) => !b.disabled && b.getBoundingClientRect().height > 0)
        ? performance.now() : -1
    })
    if (wallAt >= 0) check('M-05b', 'P0', '缩略图墙可点', `${Math.round(wallAt)}ms`, '≤1500ms', wallAt <= 1500)
    else unverifiable('M-05b', 'P0', '缩略图墙可点', '6 个按钮未到齐')

    await page.waitForFunction(
      () => document.querySelector('[data-thumb-status="loaded"]') !== null,
      null, { timeout: 8000 },
    ).catch(() => {})
    const firstImgAt = await page.evaluate(() => {
      const el = document.querySelector('[data-thumb-status="loaded"]')
      return el ? performance.now() : -1
    })
    if (firstImgAt >= 0) check('M-06a', 'P0', '墙首格有图', `${Math.round(firstImgAt)}ms`, '≤2200ms', firstImgAt <= 2200)
    else unverifiable('M-06a', 'P0', '墙首格有图', '等待超时')
    await waitCoverSettled(page)
    const allImgAt = await page.evaluate(() =>
      document.querySelectorAll('[data-thumb-status="loaded"]').length === 6 ? performance.now() : -1)
    results.push({
      id: 'M-06b', priority: 'OBS', label: '墙 6 格全有图',
      value: allImgAt >= 0 ? `${Math.round(allImgAt)}ms` : 'unverifiable', threshold: '≤3000ms(仅记录)', pass: true, detail: '',
    })
    console.log(`M-06b OBS  墙 6 格全有图             ${allImgAt >= 0 ? Math.round(allImgAt) + 'ms' : 'unverifiable'}`)

    // 缩略图 URL 从 DOM currentSrc 取，避免把第 1 页预取的 768 误判进来
    const thumbUrls = await page.evaluate(() =>
      [...document.querySelectorAll('[data-thumb-status]')].map((i) => i.currentSrc || i.src))
    const wantTier = 320
    const badTiers = thumbUrls.filter((u) => !new RegExp(`\\.w${wantTier}\\.webp`).test(u) || /\\.w(768|1024)\\.webp/.test(u))
    check('M-07', 'P0', '缩略图档位正确', `${thumbUrls.length} 张/${badTiers.length} 错`,
      `100% w${wantTier}`, badTiers.length === 0 && thumbUrls.length === 6,
      badTiers.length ? badTiers.map((u) => decodeURIComponent(u).split('/').pop()).join(',') : '')

    await page.waitForTimeout(1600)
    const coverBytes = imgs.reduce((s, i) => s + i.bytes, 0)
    check('M-04a', 'P0', '只看封面图片字节', kb(coverBytes), '≤180KB', coverBytes <= 184320, `${imgs.length} 张`)

    const flips = []
    for (let i = 0; i < 10; i++) flips.push(await placeholderDuration(page))
    const hits = flips.filter((f) => f.d <= 16).length
    check('M-03', 'P0', '翻页占位不出现', `${hits}/10`, '≥80%', hits >= 8,
      `maxD=${Math.round(Math.max(...flips.map((f) => f.d)))}ms`)

    for (let i = 0; i < 10 && !(await visibleNext(page).isDisabled()); i++) {
      await visibleNext(page).click(); await settle(page)
    }
    await page.waitForTimeout(900)
    const allBytes = imgs.reduce((s, i) => s + i.bytes, 0)
    check('M-04b', 'P0', '读完6页图片字节', kb(allBytes), '≤900KB', allBytes <= 921600, `${imgs.length} 张`)
    await ctx.close()
  }

  // ── 轮 B：播报（只注入 live observer）──
  {
    const { ctx, page } = await newCtx(browser, { throttle: THROTTLE_4G, scripts: [INJECT_LIVE] })
    await page.goto(READ_URL, { waitUntil: 'load' })
    await waitCoverSettled(page)
    const liveAtCover = await page.evaluate(() => (window.__live || []).length)
    check('M-10', 'P0', '进页5s播报不刷屏', `${liveAtCover} 次`, '≤2', liveAtCover <= 2)
    await goToPageByClicks(page, 1)
    await page.evaluate(() => { window.__live = [] })
    for (let i = 0; i < 5; i++) {
      await visibleNext(page).click({ force: true })
      await page.waitForTimeout(300)
    }
    await page.waitForTimeout(600)
    const liveBurst = await page.evaluate(() => (window.__live || []).length)
    check('M-11', 'P0', '连翻5页播报不刷屏', `${liveBurst} 次`, '≤2', liveBurst <= 2)
    await ctx.close()
  }

  // ── 轮 C：朗读 + CLS（只注入 speak/cls）──
  {
    const { ctx, page } = await newCtx(browser, { throttle: THROTTLE_4G, scripts: [INJECT_SPEAK_CLS] })
    await page.goto(READ_URL, { waitUntil: 'load' })
    await page.locator('[aria-label="开始朗读"]:visible').first().click()
    await page.waitForFunction(() => (window.__speak || []).length > 0, null, { timeout: 6000 }).catch(() => {})
    const speakAt = await page.evaluate(() => (window.__speak || [])[0] ?? -1)
    if (speakAt >= 0) check('M-01', 'P0', '朗读立即出声', `${Math.round(speakAt)}ms`, '≤1800ms', speakAt <= 1800)
    else unverifiable('M-01', 'P0', '朗读立即出声', 'speak 未被调用')

    const seq = await page.evaluate(async () => {
      const out = []
      for (let i = 0; i < 30; i++) {
        const spans = [...document.querySelectorAll('p span.inline-block')]
        out.push(spans.findIndex((s) => s.className.includes('bg-warn')))
        await new Promise((r) => setTimeout(r, 50))
      }
      return out
    })
    const seqValid = seq.filter((v) => v >= 0)
    let mono = true
    for (let i = 1; i < seq.length; i++) {
      if (seq[i] >= 0 && seq[i - 1] >= 0 && seq[i] < seq[i - 1]) mono = false
    }
    if (seqValid.length >= 2) check('M-18', 'P0', '逐字高亮单调', `${seqValid.length} 样本`, '无回跳', mono)
    else unverifiable('M-18', 'P0', '逐字高亮单调', `有效样本不足(${seqValid.length})`)

    const cls = await page.evaluate(() => window.__cls || 0)
    check('M-17', 'P0', '加载无布局跳动', cls.toFixed(4), '<0.01', cls < 0.01)
    await ctx.close()
  }


  // ── 轮 D：M-02 独立计时。不能复用轮 A —— 那里的 1.6s 字节窗口会算进里程碑 ──
  {
    const { ctx, page } = await newCtx(browser, { throttle: THROTTLE_4G })
    await page.goto(READ_URL, { waitUntil: 'load' })
    await page.waitForFunction(
      () => document.querySelector('[data-thumb-status]:not([data-thumb-status="pending"])') !== null,
      null, { timeout: 8000 },
    ).catch(() => {})
    await visibleNext(page).click()
    await page.waitForSelector('[data-img-status="decoded"]', { timeout: 15000 }).catch(() => {})
    const decodedAt = await page.evaluate(() => {
      const el = document.querySelector('[data-img-status="decoded"]')
      return el ? performance.now() : -1
    })
    if (decodedAt >= 0) check('M-02', 'P0', '第1页插图可上屏', `${Math.round(decodedAt)}ms`, '≤2500ms', decodedAt <= 2500)
    else unverifiable('M-02', 'P0', '第1页插图可上屏', '未见到 decoded')
    await ctx.close()
  }

  // ── reduced-motion 单轮：M-03 ──────────────────────────────────
  if (!QUICK) {
    const rm = await newCtx(browser, { reducedMotion: 'reduce', scripts: [INJECT_PLACEHOLDER] })
    await rm.page.goto(READ_URL, { waitUntil: 'load' })
    await rm.page.waitForTimeout(1800)
    await goToPageByClicks(rm.page, 1)
    const rmFlips = []
    for (let i = 0; i < 10; i++) rmFlips.push((await placeholderDuration(rm.page)).d)
    const rmHits = rmFlips.filter((d) => d <= 16).length
    check('M-03r', 'P0', '减少动效翻页命中', `${rmHits}/10`, '≥70%', rmHits >= 7)
    await rm.ctx.close()

    // ── 桌面单轮：M-03 / M-19 ────────────────────────────────────
    const dt = await newCtx(browser, { width: 1440, height: 900, mobile: false, dpr: 1, scripts: [INJECT_PLACEHOLDER] })
    await dt.page.goto(READ_URL, { waitUntil: 'load' })
    await dt.page.waitForTimeout(1600)
    await goToPageByClicks(dt.page, 1)
    const dtFlips = []
    for (let i = 0; i < 10; i++) dtFlips.push((await placeholderDuration(dt.page)).d)
    const dtHits = dtFlips.filter((d) => d <= 16).length
    check('M-03d', 'P0', '桌面翻页占位命中', `${dtHits}/10`, '≥90%', dtHits >= 9)

    await dt.page.evaluate(() => { window.__ph = [] })
    const nextBtn = visibleNext(dt.page)
    await nextBtn.click()
    const inFlip = await dt.page.evaluate(() => ({
      flipping: Boolean(document.querySelector('[data-flipping="true"]')),
      inside: document.querySelector('.flip-leaf [data-img-placeholder]')?.outerHTML ?? null,
    }))
    if (inFlip.flipping) check('M-19', 'P0', '占位不进3D翻转层', String(inFlip.inside), '= null', inFlip.inside === null)
    else unverifiable('M-19', 'P0', '占位不进3D翻转层', '未捕捉到动画中的 data-flipping 状态')
    await dt.ctx.close()
  }
}

async function suiteNetwork(browser) {
  // M-08 弱网全书字节
  {
    const { ctx, page, cdp } = await newCtx(browser, {
      throttle: THROTTLE_2G,
      connection: { effectiveType: '2g', saveData: false, downlink: 0.4, rtt: 400 },
    })
    const imgs = watchImages(cdp)
    await page.goto(READ_URL, { waitUntil: 'load' })
    await waitCoverSettled(page)
    for (let i = 0; i < 10 && !(await visibleNext(page).isDisabled()); i++) {
      await visibleNext(page).click(); await settle(page)
    }
    await page.waitForTimeout(800)
    const bytes = imgs.reduce((s, i) => s + i.bytes, 0)
    check('M-08', 'P1', '弱网全书字节', kb(bytes), '≤500KB', bytes <= 512000, `${imgs.length} 张`)
    await ctx.close()
  }

  // M-09 saveData 下非当前页零请求
  {
    const { ctx, page, cdp } = await newCtx(browser, {
      cdpOnly: true,
      connection: { effectiveType: '4g', saveData: true, downlink: 10, rtt: 50 },
    })
    const imgs = watchImages(cdp)
    await page.goto(READ_URL, { waitUntil: 'load' })
    await waitCoverSettled(page)
    imgs.length = 0
    await visibleNext(page).click()
    await settle(page, 600)
    await page.waitForTimeout(3000)
    const currentSrc = await page.evaluate(() =>
      [...document.querySelectorAll('[data-img-status]')].map((i) => i.currentSrc || i.src))
    const extra = imgs.filter((i) => !currentSrc.includes(i.url)).length
    check('M-09', 'P0', '省流下零额外图片请求', `${extra} 个`, '=0', extra === 0,
      `总 ${imgs.length} / 当前页 ${currentSrc.length}`)
    await ctx.close()
  }
}

async function suiteA11y(browser) {
  for (const width of [390, 768, 1440]) {
    const { ctx, page } = await newCtx(browser, {
      width, height: 900, mobile: width < 768, dpr: width < 768 ? 3 : 1, hasTouch: true,
    })
    await page.goto(`${BASE}/`, { waitUntil: 'load' })
    await page.waitForTimeout(500)
    const r = await page.evaluate(() => {
      const anon = [...document.querySelectorAll('button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')]
        .filter((el) => !(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') ||
          (el.innerText || '').trim() || el.getAttribute('title'))).length
      const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth
      // 横向滚动容器内的子项（如分类 tab 的 snap-start 末项）是有意的溢出，不算布局溢出
      const inScroller = (el) => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          const ox = getComputedStyle(p).overflowX
          if (ox === 'auto' || ox === 'scroll') return true
        }
        return false
      }
      const wide = [...document.querySelectorAll('body *')].filter((el) => {
        const s = getComputedStyle(el)
        if (s.display === 'none' || s.visibility === 'hidden' || inScroller(el)) return false
        return el.getBoundingClientRect().right > innerWidth + 1
      }).length
      return { anon, overflow, wide }
    })
    check(`M-12@${width}`, 'P0', `无匿名可交互@${width}`, `${r.anon} 个`, '=0', r.anon === 0)
    check(`M-13@${width}`, 'P0', `横向溢出@${width}`, `${r.overflow}/${r.wide}`, '=0/0', r.overflow === 0 && r.wide === 0)
    await ctx.close()
  }

  // M-14 触控热区四角（hasTouch 下 ::after 才存在）
  {
    const { ctx, page } = await newCtx(browser, { width: 390, height: 844, mobile: true, dpr: 3 })
    await page.goto(READ_URL, { waitUntil: 'load' })
    await page.waitForTimeout(500)
    const r = await page.evaluate(() => {
      const sels = 'button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
      const els = [...document.querySelectorAll(sels)].filter((el) => {
        if (el.closest('.sr-only,[hidden],[aria-hidden="true"]')) return false
        const b = el.getBoundingClientRect()
        return b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth
      })
      let bad = 0, unver = 0
      for (const el of els) {
        const b = el.getBoundingClientRect()
        const cx = b.left + b.width / 2, cy = b.top + b.height / 2
        for (const [dx, dy] of [[-21, -21], [21, -21], [-21, 21], [21, 21]]) {
          const x = cx + dx, y = cy + dy
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) { unver++; continue }
          const hit = document.elementFromPoint(x, y)
          if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) bad++
        }
      }
      return { total: els.length, bad, unver }
    })
    if (r.bad === 0 && r.unver === 0) check('M-14', 'P0', '触控热区四角', `${r.total} 控件`, '4/4 角', true)
    else unverifiable('M-14', 'P0', '触控热区四角', `${r.bad} 角未命中 / ${r.unver} 角越界`)
    await ctx.close()
  }
}

async function suiteFailure(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 })
  const page = await ctx.newPage()
  await page.addInitScript(INJECT_SPEAK_CLS)
  // 只拦图片：book.json 也位于 /generated/ 下，一起拦会让页面停在错误页（空真通过）
  await page.route('**/generated/**', (route) => {
    if (/\.(png|webp)(\?|$)/i.test(route.request().url())) return route.abort('failed')
    return route.continue()
  })
  await page.goto(READ_URL, { waitUntil: 'load' })
  await waitCoverSettled(page)

  // M-16 缩略图单格失败静默
  const m16 = await page.evaluate(() => ({
    errors: document.querySelectorAll('[data-thumb-status="error"]').length,
    alerts: document.querySelectorAll('[role="alert"]').length,
    text: document.body.innerText,
  }))
  check('M-16', 'P0', '缩略图失败静默', `${m16.errors} 错/${m16.alerts} alert`, 'alert=0',
    m16.alerts === 0 && !/[✕]|(加载失败)/.test(m16.text))

  // M-15 断图后格子仍是有名可交互元素，且 Enter 能跳页
  let ok = 0
  for (let i = 0; i < 6; i++) {
    // 每格重载一次；必须先清阅读进度，否则「恢复上次阅读位置」会把页面带回场景页
    await page.evaluate(() => localStorage.removeItem('pb-reading-progress'))
    await page.reload({ waitUntil: 'load' })
    await waitCoverSettled(page)
    const btn = thumbButtons(page).nth(i)
    const before = await pageNumber(page)
    const label = await btn.getAttribute('aria-label')
    await btn.focus()
    const focused = await page.evaluate((el) => document.activeElement === el, await btn.elementHandle())
    await btn.press('Enter')
    await settle(page, 420)
    const after = await pageNumber(page)
    if (label && focused && after !== before) ok++
    // 回封面
    const prev = page.locator('[aria-label="上一页"]:visible').first()
    for (let k = 0; k < 8 && (await pageNumber(page)) > 1; k++) { await prev.click(); await settle(page, 340) }
  }
  check('M-15', 'P0', '断图格子仍可操作', `${ok}/6`, '6/6', ok === 6)

  // 进入第 1 页，等失败态
  await visibleNext(page).click()
  await page.waitForSelector('[role="alert"] button', { timeout: 12000 }).catch(() => {})

  // M-20 图失败不影响朗读与翻页
  await page.locator('[aria-label="开始朗读"]:visible').first().click()
  await page.waitForTimeout(350)
  const spoke = await page.evaluate(() => (window.__speak || []).length > 0)
  const before = await pageNumber(page)
  const nextEnabled = await visibleNext(page).isEnabled()
  if (nextEnabled) { await visibleNext(page).click(); await settle(page) }
  const after = await pageNumber(page)
  check('M-20', 'P0', '图失败不影响朗读翻页', `${spoke ? 'speak✓' : 'speak✗'}/${after !== before ? '翻页✓' : '翻页✗'}`,
    '两项成立', spoke && after !== before)

  // M-21 失败态重试按钮可触达且够大。M-15 的连续跳转会触发 skimMode（失败态不显示），
  // 先等它退出；仍没有则重新进入第 1 页走一次全新的失败路径。
  await page.waitForTimeout(1500)
  if (!(await page.locator('[role="alert"] button').count())) {
    await jumpHome(page)
    await visibleNext(page).click()
    await page.waitForSelector('[role="alert"] button', { timeout: 12000 }).catch(() => {})
  }
  const retry = page.locator('[role="alert"] button').first()
  if (await retry.count()) {
    const box = await retry.boundingBox()
    const enabled = await retry.isEnabled()
    let fired = false
    await retry.focus()
    page.once('request', (r) => { if (r.url().includes('/generated/')) fired = true })
    await retry.press('Enter')
    await page.waitForTimeout(300)
    const h = box?.height ?? 0
    check('M-21', 'P0', '失败态重试按钮', `${Math.round(h)}px/${fired ? '已触发' : '未触发'}`,
      '≥44px 且可触发', h >= 44 && enabled && fired)
  } else {
    unverifiable('M-21', 'P0', '失败态重试按钮', '未出现失败态按钮')
  }
  await ctx.close()
}

;(async () => {
  const browser = await chromium.launch()
  try {
    console.log(`验收地址 ${READ_URL}  模式 ${QUICK ? 'quick' : 'full'}\n`)
    if (QUICK) {
      // quick 复用 reader 的前半段不现实，单独跑四个快速项
      const { ctx, page, cdp } = await newCtx(browser, { throttle: THROTTLE_4G, scripts: [INJECT_PLACEHOLDER] })
      const imgs = watchImages(cdp)
      await page.goto(READ_URL, { waitUntil: 'load' })
      await waitCoverSettled(page)
      await page.waitForTimeout(1600)
      const bytes = imgs.reduce((s, i) => s + i.bytes, 0)
      check('M-04a', 'P0', '只看封面图片字节', kb(bytes), '≤180KB', bytes <= 184320)
      const urls = await page.evaluate(() => [...document.querySelectorAll('[data-thumb-status]')].map((i) => i.currentSrc || i.src))
      const bad = urls.filter((u) => !/\.w320\.webp/.test(u) || /\.w(768|1024)\.webp/.test(u))
      check('M-07', 'P0', '缩略图档位正确', `${urls.length} 张/${bad.length} 错`, '100% w320', bad.length === 0 && urls.length === 6)
      await goToPageByClicks(page, 1)
      const flips = []
      for (let i = 0; i < 10; i++) flips.push((await placeholderDuration(page)).d)
      const hits = flips.filter((d) => d <= 16).length
      check('M-03', 'P0', '翻页占位不出现', `${hits}/10`, '≥80%', hits >= 8)
      await ctx.close()
      await suiteA11y(browser)
    } else {
      await suiteReader(browser)
      await suiteNetwork(browser)
      await suiteA11y(browser)
      await suiteFailure(browser)
    }
  } finally {
    await browser.close()
  }

  const p0 = results.filter((r) => r.priority === 'P0')
  const failed = p0.filter((r) => !r.pass)
  console.log(`\nP0: ${p0.length - failed.length}/${p0.length} 通过`)
  if (failed.length) console.log('失败项: ' + failed.map((r) => `${r.id}(${r.value})`).join(', '))
  if (process.env.VERIFY_JSON) {
    writeFileSync(process.env.VERIFY_JSON, JSON.stringify(results, null, 2))
    console.log(`报告: ${process.env.VERIFY_JSON}`)
  }
  process.exitCode = failed.length ? 1 : 0
})().catch((e) => { console.error(e); process.exitCode = 1 })
