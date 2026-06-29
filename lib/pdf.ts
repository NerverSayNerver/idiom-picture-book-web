import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import type { PictureBook } from './types'
import { getStrategy } from './content-types'

/**
 * S9: 使用 html2canvas 渲染中文文本为图片，解决 jsPDF 默认字体不支持中文的问题。
 * 每一页先生成 HTML 节点，再截图添加到 PDF。
 */
export async function generatePDF(book: PictureBook): Promise<void> {
  const categoryLabel = (() => {
    try { return getStrategy(book.category).label } catch { return '内容' }
  })()

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

    // ── 场景页 ──
    for (const scene of book.scenes) {
      pdf.addPage()

      // 构建场景 HTML
      let imageHtml = ''
      if (scene.imageUrl || scene.imageBlob) {
        const src = scene.imageUrl
          ? (scene.imageUrl.startsWith('/') ? window.location.origin + scene.imageUrl : scene.imageUrl)
          : scene.imageBlob ? URL.createObjectURL(scene.imageBlob) : ''
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
      }
    }

    // ── 封底页 ──
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

  } finally {
    document.body.removeChild(container)
  }

  pdf.save(`${book.title}.pdf`)
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
