// lib/generation/registry.ts
// Provider 注册表 + 工厂：按名称懒加载单例 Provider，支持环境变量切换

import type { ImageProvider, VideoProvider, ImageProviderConfig, VideoProviderConfig } from './types'
import { getImageProviderConfig, getVideoProviderConfig } from './config'
import { AgnesImageProvider, AgnesVideoProvider } from './adapters/agnes'

// ── 内部注册表 ──────────────────────────────────────────────

type ImageProviderFactory = (config: ImageProviderConfig) => ImageProvider
type VideoProviderFactory = (config: VideoProviderConfig) => VideoProvider

const imageRegistry = new Map<string, ImageProviderFactory>()
const videoRegistry = new Map<string, VideoProviderFactory>()

// 单例缓存
let cachedImageProvider: ImageProvider | null = null
let cachedVideoProvider: VideoProvider | null = null

// ── 注册 Agnes 为默认 Provider ──────────────────────────────

registerImage('agnes', (config) => new AgnesImageProvider(config))
registerVideo('agnes', (config) => new AgnesVideoProvider(config))

// ── 公开 API ─────────────────────────────────────────────────

/** 注册一个图像 Provider（供扩展其他模型时调用） */
export function registerImage(name: string, factory: ImageProviderFactory): void {
  imageRegistry.set(name, factory)
  // 清除缓存，下次 getImageProvider 时重新创建
  cachedImageProvider = null
}

/** 注册一个视频 Provider（供扩展其他模型时调用） */
export function registerVideo(name: string, factory: VideoProviderFactory): void {
  videoRegistry.set(name, factory)
  cachedVideoProvider = null
}

/** 获取当前配置的图像 Provider（懒加载单例） */
export function getImageProvider(name?: string): ImageProvider {
  const cfg = getImageProviderConfig()
  const providerName = name || cfg.provider

  if (cachedImageProvider && cachedImageProvider.name === providerName) {
    return cachedImageProvider
  }

  const factory = imageRegistry.get(providerName)
  if (!factory) {
    throw new Error(
      `未知的图像 Provider: "${providerName}"。可用: ${listImageProviders().join(', ')}。` +
        `请先 registerImage('${providerName}', factory) 注册。`
    )
  }

  cachedImageProvider = factory(cfg)
  return cachedImageProvider
}

/** 获取当前配置的视频 Provider（懒加载单例） */
export function getVideoProvider(name?: string): VideoProvider {
  const cfg = getVideoProviderConfig()
  const providerName = name || cfg.provider

  if (cachedVideoProvider && cachedVideoProvider.name === providerName) {
    return cachedVideoProvider
  }

  const factory = videoRegistry.get(providerName)
  if (!factory) {
    throw new Error(
      `未知的视频 Provider: "${providerName}"。可用: ${listVideoProviders().join(', ')}。` +
        `请先 registerVideo('${providerName}', factory) 注册。`
    )
  }

  cachedVideoProvider = factory(cfg)
  return cachedVideoProvider
}

/** 列出所有已注册的图像 Provider 名称 */
export function listImageProviders(): string[] {
  return Array.from(imageRegistry.keys())
}

/** 列出所有已注册的视频 Provider 名称 */
export function listVideoProviders(): string[] {
  return Array.from(videoRegistry.keys())
}
