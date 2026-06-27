import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { PictureBook, Scene, SceneTemplate } from './types'

interface AppState {
  // 当前生成中的绘本
  currentIdiom: string | null
  currentMeaning: string | null
  currentScenes: Scene[]
  isDecomposing: boolean
  isGenerating: boolean
  generatingSceneId: number | null
  error: string | null

  // 已保存的绘本
  pictureBooks: PictureBook[]

  // Actions
  setCurrentIdiom: (idiom: string) => void
  setDecomposition: (meaning: string, scenes: SceneTemplate[]) => void
  setSceneImage: (sceneId: number, imageUrl: string, imageBlob: Blob) => void
  setGeneratingScene: (sceneId: number | null) => void
  setDecomposing: (isDecomposing: boolean) => void
  setGenerating: (isGenerating: boolean) => void
  setError: (error: string | null) => void
  saveCurrentBook: () => PictureBook
  reset: () => void
  loadBooks: (books: PictureBook[]) => void
  deleteBook: (id: string) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  currentIdiom: null,
  currentMeaning: null,
  currentScenes: [],
  isDecomposing: false,
  isGenerating: false,
  generatingSceneId: null,
  error: null,
  pictureBooks: [],

  setCurrentIdiom: (idiom) => set({ currentIdiom: idiom, error: null }),

  setDecomposition: (meaning, scenes) =>
    set({
      currentMeaning: meaning,
      currentScenes: scenes.map((s, i) => ({
        ...s,
        id: i + 1,
      })),
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

  saveCurrentBook: () => {
    const state = get()
    const book: PictureBook = {
      id: uuidv4(),
      title: state.currentIdiom!,
      idiom: state.currentIdiom!,
      meaning: state.currentMeaning!,
      createdAt: new Date().toISOString(),
      scenes: state.currentScenes,
    }
    set((state) => ({
      pictureBooks: [...state.pictureBooks, book],
    }))
    return book
  },

  reset: () =>
    set({
      currentIdiom: null,
      currentMeaning: null,
      currentScenes: [],
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
