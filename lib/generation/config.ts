// lib/generation/config.ts
// 从环境变量读取 Provider 配置，提供 Agnes 默认值向后兼容

import type { ImageProviderConfig, VideoProviderConfig } from './types'

/** 生图 Provider 配置（含 provider 名称） */
export function getImageProviderConfig(): ImageProviderConfig & { provider: string } {
  return {
    provider: process.env.IMAGE_PROVIDER || 'agnes',
    apiKey: process.env.IMAGE_API_KEY || process.env.AGNES_API_KEY || '',
    baseUrl: process.env.IMAGE_API_BASE || 'https://apihub.agnes-ai.com/v1',
    model: process.env.IMAGE_MODEL || 'agnes-image-2.1-flash',
  }
}

/** 视频 Provider 配置（含 provider 名称） */
export function getVideoProviderConfig(): VideoProviderConfig & { provider: string } {
  return {
    provider: process.env.VIDEO_PROVIDER || 'agnes',
    apiKey: process.env.VIDEO_API_KEY || process.env.AGNES_API_KEY || '',
    baseUrl: process.env.VIDEO_API_BASE || 'https://apihub.agnes-ai.com',
    model: process.env.VIDEO_MODEL || 'agnes-video-v2.0',
    defaultFrames: process.env.VIDEO_FRAMES ? parseInt(process.env.VIDEO_FRAMES, 10) : 241,
    defaultFps: process.env.VIDEO_FPS ? parseInt(process.env.VIDEO_FPS, 10) : 24,
  }
}
