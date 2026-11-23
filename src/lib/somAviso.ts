import { supabase } from '@/lib/supabase'

// Som do aviso por push com o app aberto. O master pode enviar um áudio próprio pelo console
// (/master/som-aviso): ele fica no bucket público "site", sempre no mesmo caminho. Sem arquivo lá,
// vale o som padrão do app (vinheta + voz dizendo "licitaforce!").
export const SOM_PADRAO = '/sons/licitaforce.mp3'
export const CAMINHO_SOM_PERSONALIZADO = 'sons/aviso'
export const LIMITE_BYTES = 1024 * 1024
export const LIMITE_SEGUNDOS = 6

/** Sons que cada aviso pode escolher (coluna plataforma_avisos.som). */
export const SONS_AVISO = [
  { valor: 'principal', rotulo: 'Som principal', ajuda: 'O som configurado em Som do aviso (seu áudio, se enviou)' },
  { valor: 'licitaforce', rotulo: 'Licitaforce!', ajuda: 'Sempre a vinheta + voz padrão' },
  { valor: 'ping', rotulo: 'Plim simples', ajuda: 'Duas notas curtas' },
  { valor: 'silencio', rotulo: 'Sem som', ajuda: 'A notificação aparece sem tocar nada no app' },
] as const
export type SomAviso = (typeof SONS_AVISO)[number]['valor']

/** Endereço público do áudio enviado pelo master. `versao` evita pegar uma cópia antiga do CDN. */
export function urlSomPersonalizado(versao: string | number = Math.floor(Date.now() / 300_000)) {
  return `${supabase.storage.from('site').getPublicUrl(CAMINHO_SOM_PERSONALIZADO).data.publicUrl}?v=${versao}`
}

/** Baixa o som em uso: o personalizado, se existir; senão o padrão. */
export async function baixarSomAviso(versao?: string | number): Promise<{ dados: ArrayBuffer; personalizado: boolean }> {
  try {
    const r = await fetch(urlSomPersonalizado(versao), { cache: 'no-cache' })
    if (r.ok && (r.headers.get('content-type') ?? '').startsWith('audio/')) return { dados: await r.arrayBuffer(), personalizado: true }
  } catch { /* cai no padrão */ }
  const r = await fetch(SOM_PADRAO)
  if (!r.ok) throw new Error('Som padrão indisponível')
  return { dados: await r.arrayBuffer(), personalizado: false }
}
