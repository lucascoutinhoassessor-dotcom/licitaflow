import { useState } from 'react'
import { cn } from '@/lib/utils'
import { iconesPortal } from '@/lib/portais'

/**
 * Ícone (favicon) do portal de compras. Tenta os endereços conhecidos em ordem e, se nenhum
 * carregar, mostra as iniciais do portal. Nenhum dado do usuário é enviado (sem referência).
 */
export default function IconePortal({ id, nome, className }: { id: string; nome: string; className?: string }) {
  const urls = iconesPortal(id)
  const [tentativa, setTentativa] = useState(0)
  const iniciais = nome.replace(/[^A-Za-zÀ-ú ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
  if (tentativa >= urls.length) {
    return <span aria-hidden className={cn('inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-[8px] font-bold text-sky-700 dark:text-sky-300', className)}>{iniciais || '?'}</span>
  }
  return (
    <img
      src={urls[tentativa]}
      alt=""
      aria-hidden
      loading="lazy"
      referrerPolicy="no-referrer"
      className={cn('h-4 w-4 shrink-0 rounded-sm bg-white object-contain', className)}
      onError={() => setTentativa((t) => t + 1)}
    />
  )
}
