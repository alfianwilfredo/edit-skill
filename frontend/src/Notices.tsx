import { useState } from 'react'
import { api } from './api'
import { Icon } from './icons'
import { msgOf } from './util'

type Props = {
  status: { engine: 'cli' | 'api'; ffmpeg: boolean; python: boolean; key: boolean } | null
  error: string
  onError: (e: string) => void
  onKeySaved: () => void
}

export default function Notices({ status, error, onError, onKeySaved }: Props) {
  const [keyInput, setKeyInput] = useState('')
  async function saveKey() {
    try {
      await api('/api/key', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: keyInput }) })
      setKeyInput('')
      onKeySaved()
    } catch (e) { onError(msgOf(e)) }
  }
  return (
    <>
      {!status?.key && status?.engine === 'cli' && (
        <div className="notice" id="notice-cli">
          <Icon name="key" />
          <div className="notice-body">Asisten memakai Claude Code. Pasang dan login dulu di Terminal: <code>curl -fsSL https://claude.ai/install.sh | bash</code>, lalu jalankan <code>claude</code> sekali untuk login.</div>
        </div>
      )}
      {!status?.key && status?.engine === 'api' && (
        <div className="notice" id="notice-key">
          <Icon name="key" />
          <div className="notice-body">
            <p>Isi Claude API key (diawali <code>sk-ant-</code>) untuk mengaktifkan asisten. Key disimpan di laptop ini saja.</p>
            <div className="row">
              <input id="key-input-api" type="password" placeholder="sk-ant-..." value={keyInput} onChange={(e) => setKeyInput(e.target.value)} />
              <button id="key-btn-save" className="btn primary" onClick={saveKey} disabled={!keyInput.startsWith('sk-ant-')}>Simpan</button>
            </div>
          </div>
        </div>
      )}
      {status && (!status.ffmpeg || !status.python) && (
        <div className="notice" id="notice-tools"><Icon name="alert" /><div className="notice-body">Pasang dulu: <code>brew install ffmpeg-full python</code>, lalu buka ulang aplikasi.</div></div>
      )}
      {error && <div className="notice err" id="notice-error" role="alert"><Icon name="alert" /><div className="notice-body">{error}</div></div>}
    </>
  )
}
