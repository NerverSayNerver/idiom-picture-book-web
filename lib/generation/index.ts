// lib/generation/index.ts
// 通用多媒体生成抽象层 — 统一导出

// 类型
export type {
  ImageProvider,
  VideoProvider,
  ImageResult,
  VideoTask,
  VideoResult,
  ImageGenerateParams,
  ImageGenerateWithRefParams,
  VideoSubmitParams,
  ImageProviderConfig,
  VideoProviderConfig,
} from './types'

// 实例获取
export {
  getImageProvider,
  getVideoProvider,
  listImageProviders,
  listVideoProviders,
  registerImage,
  registerVideo,
} from './registry'

// 配置读取（高级用法）
export { getImageProviderConfig, getVideoProviderConfig } from './config'

// 适配器（需直接使用 Agnes 适配器时引用）
export { AgnesImageProvider, AgnesVideoProvider } from './adapters/agnes'
