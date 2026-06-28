import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { PictureBook, Scene, SceneTemplate, ContentCategory } from './types'

interface AppState {
  // 品类选择
  currentCategory: ContentCategory
  setCurrentCategory: (category: ContentCategory) => void

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
}

export const useAppStore = create<AppState>((set, get) => ({
  currentCategory: 'idiom',
  setCurrentCategory: (category) => set({ currentCategory: category }),

  currentIdiom: null,
  currentMeaning: null,
  currentScenes: [],
  characterDescription: null,
  styleDescription: null,
  isDecomposing: false,
  isGenerating: false,
  generatingSceneId: null,
  error: null,

  setCurrentIdiom: (idiom) => set({ currentIdiom: idiom, error: null }),

  setDecomposition: (meaning, scenes, characterDescription, styleDescription) =>
    set({
      currentMeaning: meaning,
      currentScenes: scenes.map((s, i) => ({ ...s, id: i + 1 })),
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
    if (!state.currentIdiom || !state.currentMeaning) {
      throw new Error('无法保存：内容或含义缺失')
    }
    const book: PictureBook = {
      id: existingId ?? uuidv4(),
      category: state.currentCategory,
      sourceText: state.currentIdiom,
      title: state.currentIdiom,
      idiom: state.currentIdiom,
      meaning: state.currentMeaning,
      createdAt: new Date().toISOString(),
      scenes: state.currentScenes,
    }
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
}))
