import { useEffect, useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Menu, X } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'

/** Barra fixa em desktops; gaveta acessível com foco contido em celulares/tablets. */
export function MenuLateral({ titulo, children, console: master = false }: { titulo: string; children: ReactNode; console?: boolean }) {
  const [aberto, setAberto] = useState(false)
  const { pathname, search } = useLocation()
  useEffect(() => setAberto(false), [pathname, search])
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1280px)')
    const ajustar = () => { if (media.matches) setAberto(false) }
    media.addEventListener('change', ajustar)
    return () => media.removeEventListener('change', ajustar)
  }, [])
  const estilo = master ? 'dark console border-zinc-800 bg-zinc-950 text-zinc-100' : 'border-sidebar-border bg-sidebar text-sidebar-foreground'
  const cabecalho = <div className="flex h-16 shrink-0 items-center border-b border-inherit px-5 font-semibold">{titulo}</div>
  return <>
    <aside aria-label={titulo} className={cn('fixed inset-y-0 left-0 z-40 hidden h-dvh w-72 flex-col border-r pb-[env(safe-area-inset-bottom)] xl:flex', estilo)}>
      {cabecalho}{children}
    </aside>
    <Dialog.Root open={aberto} onOpenChange={setAberto}>
      <Dialog.Trigger asChild>
        <button className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:hidden" aria-label={`Abrir ${titulo.toLowerCase()}`}>
          <Menu className="h-5 w-5" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay onClick={() => setAberto(false)} className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content aria-describedby={undefined} className={cn('fixed inset-y-0 left-0 z-50 flex h-dvh w-72 max-w-[calc(100vw-2rem)] flex-col border-r pb-[env(safe-area-inset-bottom)] shadow-xl focus:outline-none', estilo)}>
          <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-inherit px-4">
            <Dialog.Title className="font-semibold">{titulo}</Dialog.Title>
            <Dialog.Close asChild><button className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Fechar menu"><X className="h-5 w-5" /></button></Dialog.Close>
          </div>
          <div className="flex min-h-0 flex-1 flex-col" onClick={e => { if ((e.target as HTMLElement).closest('a[href]')) setAberto(false) }}>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>
}
