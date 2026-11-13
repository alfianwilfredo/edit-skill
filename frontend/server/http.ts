import type { IncomingMessage, ServerResponse } from 'node:http'
import { existsSync } from 'node:fs'
import path from 'node:path'

export type Route = (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<void>

export const fileUrl = (p: string) => `/api/file?p=${encodeURIComponent(p)}`

// Folder klip harus ada dan berada di bawah HOME.
export function klipDir(folder: unknown) {
  if (typeof folder !== 'string' || !folder) return null
  const f = path.resolve(folder)
  if (!f.startsWith(process.env.HOME ?? '/') || !existsSync(f)) return null
  return f
}

// overlay.json, plan.json, dan klip.json ada di <folder>/_edit/.
export function editDir(folder: unknown) {
  const f = klipDir(folder)
  return f ? path.join(f, '_edit') : null
}

export function body(req: IncomingMessage, max = 10 << 20): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > max) reject(new Error('payload terlalu besar'))
      else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export const json = (res: ServerResponse, code: number, data: unknown) => {
  res.statusCode = code
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(data))
}
