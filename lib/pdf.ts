import jsPDF from 'jspdf'
import type { PictureBook } from './types'

export async function generatePDF(book: PictureBook): Promise<void> {
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  // 封面页
  pdf.setFillColor(252, 182, 159) // primary color
  pdf.rect(0, 0, pageWidth, pageHeight, 'F')

  pdf.setFontSize(36)
  pdf.setTextColor(255, 255, 255)
  pdf.text(book.title, pageWidth / 2, pageHeight / 2 - 20, {
    align: 'center',
  })

  pdf.setFontSize(16)
  pdf.text('成语绘本', pageWidth / 2, pageHeight / 2 + 10, {
    align: 'center',
  })

  pdf.setFontSize(12)
  pdf.text(
    `生成时间: ${new Date(book.createdAt).toLocaleDateString('zh-CN')}`,
    pageWidth / 2,
    pageHeight / 2 + 30,
    { align: 'center' }
  )

  // 场景页
  for (const scene of book.scenes) {
    pdf.addPage()

    // 背景色
    pdf.setFillColor(250, 247, 245)
    pdf.rect(0, 0, pageWidth, pageHeight, 'F')

    // 标题
    pdf.setFontSize(24)
    pdf.setTextColor(51, 51, 51)
    pdf.text(scene.title, pageWidth / 2, 20, { align: 'center' })

    // 插图
    if (scene.imageBlob) {
      const imageUrl = URL.createObjectURL(scene.imageBlob)
      const img = new Image()
      await new Promise((resolve) => {
        img.onload = resolve
        img.src = imageUrl
      })

      const imgWidth = 120
      const imgHeight = (img.height / img.width) * imgWidth
      const imgX = (pageWidth - imgWidth) / 2
      const imgY = 30

      pdf.addImage(img, 'PNG', imgX, imgY, imgWidth, imgHeight)
      URL.revokeObjectURL(imageUrl)
    }

    // 旁白
    pdf.setFontSize(14)
    pdf.setTextColor(102, 102, 102)
    const narrationY = 150
    pdf.text(`"${scene.narration}"`, pageWidth / 2, narrationY, {
      align: 'center',
      maxWidth: pageWidth - 40,
    })
  }

  // 封底页
  pdf.addPage()
  pdf.setFillColor(252, 182, 159)
  pdf.rect(0, 0, pageWidth, pageHeight, 'F')

  pdf.setFontSize(20)
  pdf.setTextColor(255, 255, 255)
  pdf.text('💡 成语含义', pageWidth / 2, pageHeight / 2 - 20, {
    align: 'center',
  })

  pdf.setFontSize(16)
  pdf.text(book.meaning, pageWidth / 2, pageHeight / 2 + 10, {
    align: 'center',
    maxWidth: pageWidth - 40,
  })

  // 下载 PDF
  pdf.save(`${book.title}.pdf`)
}
