import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { CONTOH_DIR, SKILL_DIR } from './paths.ts'
import { fileUrl, json, klipDir, type Route } from './http.ts'

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

function bacaJson(f: string) {
  try {
    const d = JSON.parse(readFileSync(f, 'utf8'))
    return d && typeof d === 'object' && !Array.isArray(d) ? d : null
  } catch {
    return null
  }
}

// File hasil training hanya ditampilkan kalau ada dan berada di <folder>/_training/.
function fileTraining(p: unknown, root: string) {
  if (typeof p !== 'string' || !p) return null
  const abs = path.resolve(p)
  return abs.startsWith(root + path.sep) && existsSync(abs) ? fileUrl(abs) : null
}

export const trainingRoutes: Record<string, Route> = {
  // Tab "Training gaya": video contoh pattern + laporan putaran terakhir (<folder>/_training/<pattern>/laporan.json).
  'GET /training': async (_req, res, url) => {
    const pattern = url.searchParams.get('pattern') ?? ''
    if (!SLUG.test(pattern)) return json(res, 400, { error: 'Nama pattern tidak valid.' })
    const pf = path.join(SKILL_DIR, 'patterns', `${pattern}.json`)
    if (!existsSync(pf)) return json(res, 404, { error: 'Pattern tidak ditemukan.' })
    const pat = bacaJson(pf)
    const vc = typeof pat?.video_contoh === 'string' && pat.video_contoh ? path.join(CONTOH_DIR, path.basename(pat.video_contoh)) : ''
    const ref = vc && existsSync(vc) ? fileUrl(vc) : null
    const folder = klipDir(url.searchParams.get('folder'))
    if (!folder) return json(res, 200, { ref, laporan: null, video: null, banding: null })
    const root = path.join(folder, '_training')
    const lf = path.join(root, pattern, 'laporan.json')
    const laporan = existsSync(lf) ? bacaJson(lf) : null
    json(res, 200, {
      ref,
      laporan,
      video: fileTraining(laporan?.video, root),
      banding: fileTraining(laporan?.banding, root),
    })
  },
}
