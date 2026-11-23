import { create } from 'zustand'
import type { ContentCategory } from './types'

/**
 * 全局 UI 状态（已瘦身）：
 * 实际被读取的只有「当前品类」与「当前文本」——生成链路已迁到后端任务队列，
 * 逐场景的临时状态（isGenerating / generatingSceneId / setSceneImage / saveCurrentBook …）
 * 全站零引用，已移除。
 */
interface AppState {
  // 品类选择
  currentCategory: ContentCategory
  setCurrentCategory: (category: ContentCategory) => void

  // 当前选中的内容（点击卡片 → 记录，供首页/任务页展示与提交）
  currentIdiom: string | null
  setCurrentIdiom: (idiom: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  currentCategory: 'idiom',
  setCurrentCategory: (category) => set({ currentCategory: category }),

  currentIdiom: null,
  setCurrentIdiom: (idiom) => set({ currentIdiom: idiom }),
}))
