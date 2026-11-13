/* eslint-disable @typescript-eslint/no-explicit-any -- bentuk JSON Anthropic API dan request body dinamis */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { getApiKey, SKILL_DIR } from './paths.ts'
import { killGroup, type JobCtx } from './job.ts'

export const MODELS = ['claude-sonnet-5-5', 'claude-opus-5-5'] as const
const SCRIPTS = ['scan_clips.py', 'review_bahan.py', 'analyze_clip.py', 'analyze_ref.py', 'font_match.py', 'render.py']
const MAX_STEPS = 40

export type Event = { kind: 'text' | 'tool'; text: string }
export type Session = { messages: any[]; folder: string; cliStarted?: boolean }
type Block = { type: string; [k: string]: any }

const TOOLS = [
  {
    name: 'run_script',
    description: 'Jalankan script skill (scripts/<name>) dengan argumen. cwd = folder skill. Output dipotong bila panjang.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', enum: SCRIPTS },
        args: { type: 'array', items: { type: 'string' } },
      },
      required: ['name', 'args'],
    },
  },
  {
    name: 'view_image',
    description: 'Lihat gambar (jpg/png): grid _scan, _review, frame, cek. Gunakan path absolut.',
    input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
  {
    name: 'read_file',
    description: 'Baca file teks (json, md).',
    input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
  {
    name: 'write_file',
    description: 'Tulis file teks (plan.json, berkas review). Buat folder bila belum ada.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_dir',
    description: 'Daftar isi folder.',
    input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
]

// Folder yang boleh disentuh agent: folder skill dan folder klip yang dipilih klien.
function allowed(p: string, folder: string) {
  const abs = path.resolve(p)
  // folder kosong dibuang: path.resolve('') = cwd, '' + sep = '/' akan membuka semua path.
  return [SKILL_DIR, folder].filter(Boolean).some((root) => abs === root || abs.startsWith(root + path.sep))
}

export function skillPrompt(folder: string, cli = false) {
  const md = readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf8')
    .replace(/SKILL\//g, SKILL_DIR + '/')
    .replace(/`SKILL`/g, '`' + SKILL_DIR + '`')
  const tools = cli
    ? '- Kamu dipakai lewat aplikasi GUI. Klien tidak melihat terminal. Jalankan script dengan Bash `python3 <path script>` atau `bash <path setup.sh>`. Lihat gambar grid dengan Read.'
    : '- Kamu dipakai lewat aplikasi GUI, bukan Claude Code. Tidak ada shell. Pakai tool: run_script, view_image, read_file, write_file, list_dir.'
  return `${md}

# Konteks GUI (wajib)
${tools}
${folder ? `- Folder klip klien: ${folder}. Hasil final simpan di ${folder}/hasil/ (buat bila belum ada).` : '- Belum ada folder klip. Jangan render. Kalau butuh klip, minta klien memilih folder di menu Edit reel.'}
- Klien orang awam. Tulis bahasa Indonesia sederhana. Jangan minta klien menjalankan perintah apa pun. Jangan tampilkan path panjang kecuali perlu.
- Ikuti semua aturan mutlak di atas. Tanya klien lalu berhenti dan tunggu jawabannya. Pertanyaan dengan pilihan jawaban (wajib di mode revisi) kirim lewat blok \`\`\`pertanyaan (format di "Alur: revisi setelah hasil"); GUI menampilkannya sebagai tombol.
- Setiap render: kirim ringkasan singkat + path video final.
`
}

function pruneImages(messages: any[]) {
  // Gambar lama memakan token besar. Buang gambar dari giliran lama, sisakan 6 pesan terakhir.
  messages.slice(0, -6).forEach((m) => {
    if (!Array.isArray(m.content)) return
    m.content.forEach((b: any) => {
      if (b.type === 'tool_result' && Array.isArray(b.content)) {
        b.content = b.content.map((c: any) => (c.type === 'image' ? { type: 'text', text: '[gambar lama dihapus]' } : c))
      }
    })
  })
}

async function callApi(model: string, system: string, messages: any[], signal?: AbortSignal) {
  const key = getApiKey()
  if (!key) throw new Error('API key belum diisi. Isi dulu di bagian atas halaman.')
  pruneImages(messages)
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      tools: TOOLS,
      messages,
    }),
    signal,
  })
  const data: any = await res.json()
  if (!res.ok) throw new Error(`API ${res.status}: ${data?.error?.message ?? 'error'}`)
  return data
}

// ctx (opsional): PROGRES_FILE di env, output dialirkan ke job.log, bisa dibunuh lewat /api/batal.
export function runScript(name: string, args: string[], ctx?: JobCtx) {
  return new Promise<string>((resolve) => {
    if (ctx?.signal.aborted) return resolve('exit null\ndibatalkan')
    const env: NodeJS.ProcessEnv = { ...process.env, ...ctx?.env, PYTHONUNBUFFERED: "1" } // log Python langsung mengalir ke job.log
    const ff = '/opt/homebrew/opt/ffmpeg-full/bin'
    if (existsSync(ff)) env.PATH = `${ff}:${env.PATH}`
    // detached: script jadi pemimpin process group, jadi ffmpeg anaknya ikut terbunuh saat batal.
    const child = spawn('python3', [path.join(SKILL_DIR, 'scripts', name), ...args], { cwd: SKILL_DIR, env, detached: true })
    ctx?.track(child)
    let out = ''
    const tampung = (d: Buffer) => {
      out += d
      ctx?.log(d.toString())
    }
    child.stdout.on('data', tampung)
    child.stderr.on('data', tampung)
    const timer = setTimeout(() => killGroup(child, 'SIGKILL'), 20 * 60_000)
    child.on('close', (code) => {
      clearTimeout(timer)
      const tail = out.length > 6000 ? '...\n' + out.slice(-6000) : out
      resolve(`exit ${code}\n${tail}`)
    })
  })
}

async function execTool(name: string, input: any, folder: string, ctx: JobCtx): Promise<{ content: any; is_error?: boolean }> {
  try {
    if (name === 'run_script') {
      if (!SCRIPTS.includes(input.name)) throw new Error('script tidak diizinkan')
      return { content: await runScript(input.name, input.args.map(String), ctx) }
    }
    const p = String(input.path ?? '')
    if (!allowed(p, folder)) throw new Error(`path di luar folder yang diizinkan: ${p}`)
    if (name === 'view_image') {
      const ext = path.extname(p).toLowerCase()
      if (!['.jpg', '.jpeg', '.png'].includes(ext)) throw new Error('bukan gambar')
      const media = ext === '.png' ? 'image/png' : 'image/jpeg'
      return {
        content: [{ type: 'image', source: { type: 'base64', media_type: media, data: readFileSync(p).toString('base64') } }],
      }
    }
    if (name === 'read_file') return { content: readFileSync(p, 'utf8').slice(0, 60_000) }
    if (name === 'write_file') {
      mkdirSync(path.dirname(p), { recursive: true })
      writeFileSync(p, String(input.content))
      return { content: `ditulis: ${p}` }
    }
    if (name === 'list_dir') {
      return {
        content: readdirSync(p)
          .slice(0, 300)
          .map((f) => `${statSync(path.join(p, f)).isDirectory() ? '[dir] ' : ''}${f}`)
          .join('\n'),
      }
    }
    throw new Error('tool tidak dikenal')
  } catch (e: any) {
    return { content: String(e?.message ?? e), is_error: true }
  }
}

function summarize(name: string, input: any) {
  if (name === 'run_script') return `${input.name} ${(input.args ?? []).map((a: string) => path.basename(a)).join(' ')}`
  return path.basename(String(input.path ?? ''))
}

// Satu giliran chat: user bicara, agent jalan sampai berhenti (tanya klien atau selesai).
// Event dikirim langsung ke job lewat ctx.event, jadi GUI bisa menampilkannya selagi agent jalan.
export async function runTurn(session: Session, model: string, message: string, ctx: JobCtx) {
  const before = session.messages.length
  session.messages.push({ role: 'user', content: [{ type: 'text', text: message }] })
  try {
    const system = skillPrompt(session.folder)
    for (let step = 0; step < MAX_STEPS; step++) {
      if (ctx.signal.aborted) throw new Error('dibatalkan')
      const res = await callApi(model, system, session.messages, ctx.signal)
      const content: Block[] = res.content ?? []
      session.messages.push({ role: 'assistant', content })
      for (const b of content) {
        if (b.type === 'text' && b.text.trim()) ctx.event({ kind: 'text', text: b.text })
      }
      if (res.stop_reason !== 'tool_use') break
      const results: any[] = []
      for (const b of content) {
        if (b.type !== 'tool_use') continue
        if (ctx.signal.aborted) throw new Error('dibatalkan')
        ctx.event({ kind: 'tool', text: `${b.name} ${summarize(b.name, b.input)}` })
        const r = await execTool(b.name, b.input, session.folder, ctx)
        results.push({ type: 'tool_result', tool_use_id: b.id, content: r.content, ...(r.is_error ? { is_error: true } : {}) })
      }
      if (ctx.signal.aborted) throw new Error('dibatalkan')
      session.messages.push({ role: 'user', content: results })
    }
    return { ok: true as const }
  } catch (e: any) {
    if (ctx.signal.aborted) {
      // Batal: giliran sejauh ini disimpan, tapi tool_use tanpa tool_result dibuang supaya history tetap valid.
      const last = session.messages.at(-1)
      if (last?.role === 'assistant' && last.content.some((b: Block) => b.type === 'tool_use')) session.messages.pop()
      return { ok: false as const, error: 'Dibatalkan oleh pengguna.' }
    }
    session.messages.length = before // buang giliran yang gagal supaya history tetap valid
    return { ok: false as const, error: String(e?.message ?? e) }
  }
}

export function listVideos(folder: string) {
  const dir = path.join(folder, 'hasil')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.mp4'))
    .map((f) => ({ path: path.join(dir, f), name: f, mtime: statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
}
