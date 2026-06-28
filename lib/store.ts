import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { PictureBook, Scene, SceneTemplate } from './types'

interface AppState {
  // 当前生成中的绘本
  currentIdiom: string | null
  currentMeaning: string | null
  currentScenes: Scene[]
  characterDescription: string | null
  styleDescription: string | null
  isDecomposing: boolean
  isGenerating: boolean
  generatingSceneId: number | null
  error: string | null

  // 已保存的绘本
  pictureBooks: PictureBook[]

  // Actions
  setCurrentIdiom: (idiom: string) => void
  setDecomposition: (meaning: string, scenes: SceneTemplate[], characterDescription?: string, styleDescription?: string) => void
  setSceneImage: (sceneId: number, imageUrl: string, imageBlob: Blob) => void
  setGeneratingScene: (sceneId: number | null) => void
  setDecomposing: (isDecomposing: boolean) => void
  setGenerating: (isGenerating: boolean) => void
  setError: (error: string | null) => void
  saveCurrentBook: (existingId?: string) => PictureBook
  reset: () => void
  loadBooks: (books: PictureBook[]) => void
  deleteBook: (id: string) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  currentIdiom: null,
  currentMeaning: null,
  currentScenes: [],
  characterDescription: null,
  styleDescription: null,
  isDecomposing: false,
  isGenerating: false,
  generatingSceneId: null,
  error: null,
  pictureBooks: [],

  setCurrentIdiom: (idiom) => set({ currentIdiom: idiom, error: null }),

  setDecomposition: (meaning, scenes, characterDescription, styleDescription) =>
    set({
      currentMeaning: meaning,
      currentScenes: scenes.map((s, i) => ({
        ...s,
        id: i + 1,
      })),
      characterDescription: characterDescription ?? null,
      styleDescription: styleDescription ?? null,
    }),

  setSceneImage: (sceneId, imageUrl, imageBlob) =>
    set((state) => ({
      currentScenes: state.currentScenes.map((s) =>
        s.id === sceneId ? { ...s, imageUrl, imageBlob } : s
      ),
    })),

  setGeneratingScene: (sceneId) => set({ generatingSceneId: sceneId }),
  setDecomposing: (isDecomposing) => set({ isDecomposing }),
  setGenerating: (isGenerating) => set({ isGenerating }),
  setError: (error) => set({ error }),

  saveCurrentBook: (existingId?: string) => {
    const state = get()
    // 守卫：确保当前成语和含义非空，避免保存损坏的绘本
    if (!state.currentIdiom || !state.currentMeaning) {
      console.warn('saveCurrentBook: currentIdiom 或 currentMeaning 为空，放弃保存')
      throw new Error('无法保存：成语或含义缺失')
    }

    // 如果已有同名绘本且传入 existingId，用旧 id 覆盖（防止 retry 创建重复）
    const existingBook = existingId
      ? state.pictureBooks.find(b => b.id === existingId)
      : state.pictureBooks.find(b => b.idiom === state.currentIdiom)

    const book: PictureBook = {
      id: existingBook?.id ?? uuidv4(),
      title: state.currentIdiom,
      idiom: state.currentIdiom,
      meaning: state.currentMeaning,
      createdAt: existingBook?.createdAt ?? new Date().toISOString(),
      scenes: state.currentScenes,
    }
    set((state) => ({
      pictureBooks: existingBook
        ? state.pictureBooks.map(b => b.id === existingBook.id ? book : b)
        : [...state.pictureBooks, book],
    }))
    return book
  },

  reset: () =>
    set({
      currentIdiom: null,
      currentMeaning: null,
      currentScenes: [],
      characterDescription: null,
      styleDescription: null,
      isDecomposing: false,
      isGenerating: false,
      generatingSceneId: null,
      error: null,
    }),

  loadBooks: (books) => set({ pictureBooks: books }),

  deleteBook: (id) =>
    set((state) => ({
      pictureBooks: state.pictureBooks.filter((b) => b.id !== id),
    })),
}))
