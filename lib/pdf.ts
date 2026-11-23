import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import type { PictureBook } from './types'
import { getStrategy } from './content-types'

export interface GeneratePDFOptions {
  /** 每完成一页回调（done 从 1 开始，total = 封面 + 场景页 + 封底） */
  onProgress?: (done: number, total: number) => void
  /**
   * 取消信号：**必须是可写普通对象** `{ cancelled: boolean }`（调用方自己置 true），
   * 不是 `AbortSignal`。误传 AbortSignal 会在入口直接抛 TypeError，不会静默失效。
   */
  signal?: { cancelled: boolean }
}

/**
 * 生成结果。
 *
 * 生命周期契约：**blob URL 的存活期完全由调用方管理**，本模块不自动触发下载、也不自动释放
 * （没有内部定时器、没有"用完即焚"）。持有时机只有三个：
 *   1. 组件卸载 / 页面离开
 *   2. 下一次 generatePDF 开始之前（先 revoke 上一份）
 *   3. 显式丢弃该结果时
 *
 * 两条禁止：
 * - **不要**在 `triggerDownload()` 之后立刻 revoke：下载是异步的，浏览器还没开始读 blob 时
 *   撤销 URL 会得到空文件/失败（Safari、Firefox 上表现最明显，Chrome 读取更早所以看不出来）。
 * - **不要**用 `setTimeout(revoke, N 秒)` 猜时间：慢网/低端机上仍可能没读完，且白白多占一份
 *   10–30MB 内存。让生命周期跟着"谁还在用它"走，而不是跟着时钟走。
 */
export interface PDFResult {
  /** blob URL，可直接用于 `<a href download>` */
  url: string
  /** `${book.title}.pdf` */
  filename: string
  /** 由调用方在卸载 / 重新生成前 / 显式丢弃时调用，释放整份 PDF 的内存 */
  revoke: () => void
}

/**
 * S9: 使用 html2canvas 渲染中文文本为图片，解决 jsPDF 默认字体不支持中文的问题。
 * 每一页先生成 HTML 节点，再截图添加到 PDF。
 *
 * 返回 `PDFResult { url, filename, revoke }`：**不自动触发下载，也不自动释放**（纯函数定位）。
 * iOS Safari 在长异步之后调用下载会被静默拦截（用户手势上下文已过期），调用方需要：
 * - iOS → 把 url 渲染成 `<a download>`，让用户再点一次；
 * - 其它平台 → `triggerDownload(url, filename)` 直接触发，**但不要紧接着 revoke**
 *   （下载是异步的，立刻撤销会得到空文件）；撤销交给卸载 / 下一次生成前。
 *
 * 注意：jspdf / html2canvas 体积较大，请由调用方动态 import 本模块
 * （`const { generatePDF } = await import('@/lib/pdf')`），避免进首屏包。
 */
export async function generatePDF(book: PictureBook, options?: GeneratePDFOptions): Promise<PDFResult> {
  // 运行时守卫：options.signal 必须是 { cancelled: boolean } 的普通对象。
  // 极易误传 AbortController.signal（只有 .aborted）——那样取消会「静默失效」：点了没反应也不报错。
  // 这里直接抛错，把未来的静默 bug 变成立刻可见的崩溃。
  if (options?.signal && typeof (options.signal as { cancelled?: unknown }).cancelled !== 'boolean') {
    throw new TypeError(
      'generatePDF: options.signal 必须是 { cancelled: boolean } 普通对象（不是 AbortSignal）；请自行维护一个可写的 cancelled 标记'
    )
  }

  const categoryLabel = (() => {
    try { return getStrategy(book.category).label } catch { return '内容' }
  })()

  const total = book.scenes.length + 2 // 封面 + 场景页 + 封底
  let done = 0
  const tick = () => {
    done += 1
    options?.onProgress?.(done, total)
  }
  const assertNotCancelled = () => {
    if (options?.signal?.cancelled) throw new Error('CANCELLED')
  }

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  // 创建一个离屏容器用于 HTML 渲染
  const container = document.createElement('div')
  container.style.cssText = `
    position: fixed; left: -9999px; top: 0;
    width: ${pageWidth * 3.78}px; height: ${pageHeight * 3.78}px;
    background: white; z-index: -1; overflow: hidden;
  `
  document.body.appendChild(container)

  const canvasOptions = {
    width: pageWidth * 3.78,
    height: pageHeight * 3.78,
    scale: 2,
    useCORS: true,
    backgroundColor: null as string | null,
  }

  try {
    // ── 封面页 ──
    assertNotCancelled()
    container.innerHTML = `
      <div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgb(252,182,159);font-family:sans-serif;">
        <h1 style="font-size:48px;color:white;margin:0 0 16px;">${escapeHtml(book.title)}</h1>
        <p style="font-size:20px;color:white;margin:0 0 12px;">${escapeHtml(categoryLabel)}绘本</p>
        <p style="font-size:14px;color:rgba(255,255,255,0.8);margin:0;">
          生成时间: ${new Date(book.createdAt).toLocaleDateString('zh-CN')}
        </p>
      </div>
    `
    const coverCanvas = await html2canvas(container, canvasOptions)
    pdf.addImage(coverCanvas.toDataURL('image/png'), 'PNG', 0, 0, pageWidth, pageHeight)
    tick()
    // 让出主线程：否则 onProgress 重绘被同步循环吞掉，UI 看起来像卡死
    await new Promise(r => setTimeout(r, 0))

    // ── 场景页 ──
    for (const scene of book.scenes) {
      assertNotCancelled()
      pdf.addPage()

      // 构建场景 HTML
      let imageHtml = ''
      let objectUrl: string | null = null
      if (scene.imageUrl || scene.imageBlob) {
        const src = scene.imageUrl
          ? (scene.imageUrl.startsWith('/') ? window.location.origin + scene.imageUrl : scene.imageUrl)
          : scene.imageBlob ? (objectUrl = URL.createObjectURL(scene.imageBlob)) : ''
        if (src) {
          imageHtml = `<img src="${escapeHtml(src)}" style="max-width:480px;max-height:320px;border-radius:8px;margin:12px auto;display:block;" crossorigin="anonymous" />`
        }
      }

      container.innerHTML = `
        <div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;padding:32px;box-sizing:border-box;background:rgb(250,247,245);font-family:sans-serif;">
          <h2 style="font-size:28px;color:rgb(51,51,51);margin:0 0 8px;">${escapeHtml(scene.title)}</h2>
          ${imageHtml}
          <p style="font-size:16px;color:rgb(102,102,102);text-align:center;max-width:600px;line-height:1.6;margin-top:auto;">
            "${escapeHtml(scene.narration)}"
          </p>
        </div>
      `

      try {
        const sceneCanvas = await html2canvas(container, canvasOptions)
        pdf.addImage(sceneCanvas.toDataURL('image/png'), 'PNG', 0, 0, pageWidth, pageHeight)
      } catch (err) {
        console.warn(`PDF 场景页渲染失败: ${scene.title}`, err)
        // 回退：空白页 + 标题
        pdf.setFontSize(24)
        pdf.setTextColor(51, 51, 51)
        pdf.text(scene.title, pageWidth / 2, 20, { align: 'center' })
      } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl)
      }
      tick()
      // 让出主线程，保证 loading / 进度能绘制
      await new Promise(r => setTimeout(r, 0))
    }

    // ── 封底页 ──
    assertNotCancelled()
    pdf.addPage()
    container.innerHTML = `
      <div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgb(252,182,159);font-family:sans-serif;">
        <h2 style="font-size:28px;color:white;margin:0 0 16px;">${escapeHtml(categoryLabel)}含义</h2>
        <p style="font-size:18px;color:white;text-align:center;max-width:600px;line-height:1.6;margin:0;">
          ${escapeHtml(book.meaning)}
        </p>
      </div>
    `
    const backCanvas = await html2canvas(container, canvasOptions)
    pdf.addImage(backCanvas.toDataURL('image/png'), 'PNG', 0, 0, pageWidth, pageHeight)
    tick()

  } finally {
    document.body.removeChild(container)
  }

  // iOS Safari 在异步（html2canvas 30s+）之后再触发下载会被静默拦掉：用户手势上下文已过期。
  // 所以这里**不直接保存**，只产出 blob URL 交回调用方：
  // - iOS：把 url 渲染成 <a download>，让用户再点一次（新鲜手势必定放行）
  // - 其它：调用方用 triggerDownload() 立即触发；**不要紧接着 revoke**（下载是异步的，
  //   立刻撤销会得到空文件），撤销交给卸载 / 下一次生成前。
  // 本函数不设任何自动回收定时器：生命周期归调用方（见 PDFResult 的契约说明）。
  // 用 output('blob') 而非 output('bloburl')：后者不给句柄，事后无法 revoke，整份 PDF 的内存会泄漏。
  const blob = pdf.output('blob')
  const url = URL.createObjectURL(blob)
  return {
    url,
    filename: `${book.title}.pdf`,
    revoke: () => URL.revokeObjectURL(url),
  }
}

/**
 * 用一次"新鲜手势"触发下载。
 * iOS Safari 必须由用户点击回调同步调用，不能在 await 之后调用（popup/download 会被拦）。
 */
export function triggerDownload(url: string, filename: string): void {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** 是否是 iOS / iPadOS 上的浏览器（iPadOS 13+ 的 UA 伪装成 MacIntel，靠 maxTouchPoints 识别） */
export function isIOSSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
