/* eslint-disable @typescript-eslint/no-explicit-any -- bentuk JSON stream Claude CLI dinamis */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { SKILL_DIR } from './paths.ts'
import type { Session } from './agent.ts'
import { killGroup, type JobCtx } from './job.ts'

// Mesin "cli": pakai Claude Code (`claude -p`) dengan login langganan, bukan saldo API.
const CANDIDATES = [path.join(process.env.HOME ?? '', '.local/bin/claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude']
export const CLAUDE_BIN = CANDIDATES.find(existsSync) ?? 'claude'

export const cliAvailable = () => spawnSync(CLAUDE_BIN, ['--version']).status === 0

const ALLOWED = ['Bash(python3:*)', 'Bash(bash:*)', 'Bash(ls:*)', 'Bash(mkdir:*)', 'Read', 'Write', 'Edit', 'Glob', 'Grep']
const TIMEOUT = 30 * 60_000

function summarize(name: string, input: any) {
  if (name === 'Bash') {
    const cmd = String(input.command ?? '')
    const m = cmd.match(/scripts\/(\w+\.py)/)
    return m ? m[1] : cmd.slice(0, 60)
  }
  return `${name} ${path.basename(String(input.file_path ?? input.path ?? input.pattern ?? ''))}`
}

// Teks hasil tool (output script, dsb.) untuk job.log.
function toolText(c: any): string {
  if (typeof c === 'string') return c
  if (Array.isArray(c)) return c.map((x) => (x?.type === 'text' ? x.text : '')).join('\n')
  return ''
}

export async function runTurnCli(session: Session, sessionId: string, model: string, message: string, system: string, ctx: JobCtx) {
  const out = await runOnce(session, sessionId, model, message, system, ctx)
  // Server restart menghapus daftar sesi di memory, padahal sesi CLI sudah ada: lanjutkan dengan --resume.
  if (!out.ok && !session.cliStarted && !ctx.signal.aborted && out.error?.includes('already in use')) {
    session.cliStarted = true
    return runOnce(session, sessionId, model, message, system, ctx)
  }
  return out
}

function runOnce(session: Session, sessionId: string, model: string, message: string, system: string, ctx: JobCtx) {
  return new Promise<{ ok: boolean; error?: string }>((resolve) => {
    if (ctx.signal.aborted) return resolve({ ok: false, error: 'Dibatalkan oleh pengguna.' })
    const dirs = [SKILL_DIR, session.folder].filter(Boolean)
    const args = [
      '-p', message,
      '--output-format', 'stream-json', '--verbose',
      '--model', model,
      session.cliStarted ? '--resume' : '--session-id', sessionId,
      '--append-system-prompt', system,
      // Default CLI menyimpan system prompt pesan pertama. Folder bisa dipilih belakangan, jadi render ulang tiap giliran.
      '--system-prompt-snapshot', 'off',
      '--add-dir', ...dirs,
      '--allowedTools', ...ALLOWED,
      '--permission-mode', 'acceptEdits',
      '--setting-sources', 'project',
      '--strict-mcp-config',
    ]
    // PROGRES_FILE ikut diwariskan ke proses Bash yang dijalankan claude.
    const env: NodeJS.ProcessEnv = { ...process.env, ...ctx.env, PYTHONUNBUFFERED: "1" }
    delete env.ANTHROPIC_API_KEY // pakai login Claude Code, bukan key API
    const ff = '/opt/homebrew/opt/ffmpeg-full/bin'
    if (existsSync(ff)) env.PATH = `${ff}:${env.PATH}`

    // detached: claude jadi pemimpin process group, /api/batal membunuh claude beserta script anaknya.
    const child = spawn(CLAUDE_BIN, args, { cwd: session.folder || SKILL_DIR, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    ctx.track(child)
    let buf = ''
    let err = ''
    let result: any = null
    child.stdout.on('data', (d) => {
      buf += d
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        let m: any
        try { m = JSON.parse(line) } catch { continue }
        if (m.type === 'assistant') {
          for (const b of m.message?.content ?? []) {
            if (b.type === 'text' && b.text.trim()) ctx.event({ kind: 'text', text: b.text })
            if (b.type === 'tool_use') ctx.event({ kind: 'tool', text: summarize(b.name, b.input) })
          }
        }
        if (m.type === 'user') {
          for (const b of m.message?.content ?? []) {
            if (b.type === 'tool_result') ctx.log(toolText(b.content).slice(-4000) + '\n')
          }
        }
        if (m.type === 'result') result = m
      }
    })
    child.stderr.on('data', (d) => (err += d))
    const timer = setTimeout(() => killGroup(child, 'SIGKILL'), TIMEOUT)
    child.on('close', (code) => {
      clearTimeout(timer)
      if (ctx.signal.aborted) {
        // Sesi tetap bisa dilanjutkan (--resume) setelah batal.
        session.cliStarted = true
        return resolve({ ok: false, error: 'Dibatalkan oleh pengguna.' })
      }
      if (result && !result.is_error) {
        session.cliStarted = true
        return resolve({ ok: true })
      }
      // Sesi sudah tercatat di CLI walau gagal di tengah: giliran berikut harus --resume.
      if (result) session.cliStarted = true
      const msg = result?.result || err.trim().split('\n').pop() || `claude keluar dengan kode ${code}`
      resolve({ ok: false, error: `Claude CLI: ${msg}` })
    })
  })
}
