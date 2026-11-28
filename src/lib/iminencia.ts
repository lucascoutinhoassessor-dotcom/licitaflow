import { supabase } from './supabase'

/** Processo do Portal de Compras Públicas ainda aberto e sem nenhuma proposta ("iminência de deserto"). */
export interface ProcessoIminencia {
  numero: string; situacao: string | null; objeto: string | null; abertura: string | null
  modalidade: string | null; comprador: string | null; uf: string | null; link: string
}
export interface ResultadoIminencia { processos: ProcessoIminencia[]; lidoEm: string | null }

export async function buscarIminencia(signal?: AbortSignal): Promise<ResultadoIminencia> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('Entre na sua conta.')
  const r = await fetch('/api/oportunidades?acao=turso-pcp-iminencia', { headers: { Authorization: `Bearer ${data.session.access_token}` }, signal })
  const corpo = await r.json().catch(() => null)
  if (!r.ok) throw new Error(corpo?.error ?? 'Não foi possível carregar a lista agora.')
  return corpo as ResultadoIminencia
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
/** Filtro da tela: palavras do objeto/comprador (separadas por ";" valem como alternativas), UF e modalidade. */
export function filtrarIminencia(lista: ProcessoIminencia[], f: { busca: string; uf: string; modalidade: string }) {
  const termos = f.busca.split(';').map((t) => semAcento(t.trim())).filter(Boolean)
  return lista.filter((p) => {
    if (f.uf && p.uf !== f.uf) return false
    if (f.modalidade && grupoModalidade(p.modalidade) !== f.modalidade) return false
    if (!termos.length) return true
    const texto = semAcento(`${p.objeto ?? ''} ${p.comprador ?? ''} ${p.numero}`)
    return termos.some((t) => t.split(/\s+/).every((palavra) => texto.includes(palavra)))
  })
}

/** Modalidades do PCP agrupadas como o cliente pensa (pregão com e sem registro de preço juntos). */
export function grupoModalidade(m: string | null) {
  const s = semAcento(m ?? '')
  if (s.includes('pregao')) return 'Pregão'
  if (s.includes('dispensa')) return 'Dispensa'
  if (s.includes('concorrencia')) return 'Concorrência'
  if (s.includes('credenciamento')) return 'Credenciamento'
  if (s.includes('leilao')) return 'Leilão'
  return 'Outras'
}
