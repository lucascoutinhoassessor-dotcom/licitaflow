import { useState } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { HOST_MASTER, URL_SITE, appAntigo } from '@/lib/pwa'

const CHAVE = 'lf-aviso-app-antigo'

/**
 * App instalado pelo endereço antigo (LicitaFlow). Ele continua funcionando sem a barra do navegador,
 * mas o certo é instalar o app pelo endereço novo. "Depois" esconde o aviso até o app ser aberto de novo.
 */
export default function AvisoAppAntigo({ master = false }: { master?: boolean }) {
  const [visivel, setVisivel] = useState(() => appAntigo() && sessionStorage.getItem(CHAVE) !== '1')
  if (!visivel) return null
  const destino = master ? `https://${HOST_MASTER}/master` : URL_SITE
  const fechar = () => { sessionStorage.setItem(CHAVE, '1'); setVisivel(false) }
  return (
    <div role="status" className="border-b border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100">
      <div className="mx-auto flex w-full max-w-6xl items-start gap-3 px-4 py-3 text-sm lg:px-8">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-amber-950 dark:text-amber-50">Instale o app novo do LicitaForce</p>
          <p className="mt-0.5 text-amber-900/80 dark:text-amber-100/80">Este app foi instalado pelo endereço antigo. Abra o endereço novo, toque em "Instalar app" e depois desinstale este.</p>
          <a href={destino} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full bg-amber-400 px-3 text-xs font-semibold text-zinc-950 hover:bg-amber-300">
            <ExternalLink className="h-3.5 w-3.5" />Abrir endereço novo
          </a>
        </div>
        <button type="button" onClick={fechar} className="rounded-md p-1 text-amber-900/70 hover:bg-black/5 dark:text-amber-100/70 dark:hover:bg-white/10" aria-label="Fechar aviso (volta na próxima abertura)">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
