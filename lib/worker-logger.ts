// lib/worker-logger.ts
// Worker 专用日志：stdout 人类可读 + logs/worker-YYYYMMDD.log 落盘双写，便于失败追溯
// 仅服务端（worker.ts）使用，不要在 Next 客户端代码中 import

import { appendFile, mkdir, readdir, unlink } from 'fs/promises'
import path from 'path'

const LOG_DIR = path.join(process.cwd(), 'logs')
/** 日志保留天数，启动时清理更早的日志文件 */
const RETENTION_DAYS = 30

function logFilePath(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return path.join(LOG_DIR, `worker-${y}${m}${d}.log`)
}

let dirReady: Promise<void> | null = null
function ensureLogDir(): Promise<void> {
  if (!dirReady) {
    dirReady = mkdir(LOG_DIR, { recursive: true }).then(() => undefined)
  }
  return dirReady
}

/**
 * 写一行日志：stdout 原样输出（保留 emoji 风格），文件追加 ISO 时间戳前缀。
 * 落盘失败静默忽略，不影响生成主流程。
 */
export function workerLog(message: string): void {
  console.log(message)
  const line = `[${new Date().toISOString()}] ${message}\n`
  ensureLogDir()
    .then(() => appendFile(logFilePath(), line, 'utf8'))
    .catch(() => {})
}

/** 启动时清理超过保留期的旧日志文件（按文件名日期判断，不阻塞主流程） */
export async function pruneOldLogs(days = RETENTION_DAYS): Promise<void> {
  try {
    await ensureLogDir()
    const files = await readdir(LOG_DIR)
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    await Promise.all(
      files
        .filter((f) => /^worker-\d{8}\.log$/.test(f))
        .filter((f) => {
          const dateStr = f.replace(/^worker-/, '').replace(/\.log$/, '')
          const ts = new Date(
            Number(dateStr.slice(0, 4)),
            Number(dateStr.slice(4, 6)) - 1,
            Number(dateStr.slice(6, 8))
          ).getTime()
          return ts < cutoff
        })
        .map((f) => unlink(path.join(LOG_DIR, f)).catch(() => {}))
    )
  } catch {
    // 清理失败不影响运行
  }
}
