import { useCallback, useRef, useState } from 'react'
import { Modal, type Tanya } from './Modal'

// tanya(...) membuka modal dan menunggu jawaban (true = ok). elemen dirender sekali di root.
export function useKonfirmasi() {
  const [aktif, setAktif] = useState<Tanya | null>(null)
  const jawabRef = useRef<((ok: boolean) => void) | null>(null)
  const tanya = useCallback((t: Tanya) => new Promise<boolean>((jawab) => {
    jawabRef.current?.(false) // modal lama tertimpa: anggap batal
    jawabRef.current = jawab
    setAktif(t)
  }), [])
  const onJawab = useCallback((ok: boolean) => {
    const j = jawabRef.current
    jawabRef.current = null
    setAktif(null)
    j?.(ok)
  }, [])
  return { tanya, elemen: aktif ? <Modal {...aktif} onJawab={onJawab} /> : null }
}
