import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const FRONTEND_DIR = fileURLToPath(new URL('..', import.meta.url))
export const SKILL_DIR = path.resolve(FRONTEND_DIR, '../skill/interior-reels')
// Sumber key utama: frontend/.env, variabel CLAUDE. Ganti nilainya saja saat install di laptop klien.
export const ENV_FILE = path.join(FRONTEND_DIR, '.env')
const KEY_VAR = 'CLAUDE'

function readEnvVar(name: string): string | undefined {
  if (!existsSync(ENV_FILE)) return undefined
  const m = readFileSync(ENV_FILE, 'utf8').match(new RegExp(`^${name}=(.+)$`, 'm'))
  return m?.[1].trim() || undefined
}

// Mesin asisten: "cli" (Claude Code, pakai langganan) atau "api" (pakai saldo API). Default cli.
export function getEngine(): 'cli' | 'api' {
  return readEnvVar('ENGINE') === 'api' ? 'api' : 'cli'
}

// Key dibaca tiap request supaya perubahan di .env langsung dipakai tanpa restart.
export function getApiKey(): string | undefined {
  return readEnvVar(KEY_VAR) ?? process.env.ANTHROPIC_API_KEY
}

// Dipakai dari GUI: menulis ke .env yang sama, variabel CLAUDE.
export function setApiKey(key: string) {
  const line = `${KEY_VAR}=${key}`
  const old = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : ''
  const next = old.match(new RegExp(`^${KEY_VAR}=.*$`, 'm'))
    ? old.replace(new RegExp(`^${KEY_VAR}=.*$`, 'm'), line)
    : `${line}\n${old}`
  writeFileSync(ENV_FILE, next, { mode: 0o600 })
}
