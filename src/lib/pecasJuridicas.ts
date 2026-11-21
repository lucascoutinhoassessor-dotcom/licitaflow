// Busca nas peças jurídicas publicadas nos portais (índice pecas_juridicas, RPC buscar_pecas)
// e leitura do texto do PDF pela função /api/juridico. Fonte e cobertura: docs/pecas-juridicas.md.
import { supabase } from './supabase'
import type { TipoPeca } from './juridico'

export interface ProcessoPeca {
  codigo: number; orgao: string; municipio: string | null; uf: string | null; modalidade: string | null
  numero: string | null; objeto: string; lei14133: boolean | null; sessao: string | null; url: string | null
}
export interface PecaPublicada {
  id: number; tipo: TipoPeca; papel: 'pedido' | 'resposta'; titulo: string; empresa: string | null; item: string | null
  arquivoUrl: string | null; trecho: string | null; data: string | null; processo: ProcessoPeca
}
export interface FiltrosPecas { busca: string; tipos: TipoPeca[]; uf: string; orgao: string; novaLei: boolean }
export interface ResultadoPecas { total: number; porTipo: Partial<Record<TipoPeca, number>>; data: PecaPublicada[] }
export interface StatusPecas { pecas: number; processos: number; desde: string | null; ate: string | null; ultimaColeta: string | null; diasPendentes: number; diasConcluidos: number }
export interface TextoPeca { texto: string | null; motivo?: string; paginas?: number; cortado?: boolean }

export const TAMANHO_PAGINA = 20
export const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')

/** Rótulo curto do papel da peça no cartão. */
export function rotuloPapel(p: Pick<PecaPublicada, 'tipo' | 'papel'>) {
  if (p.papel === 'pedido') return p.tipo === 'esclarecimento' ? 'Pergunta da empresa' : 'Peça da empresa'
  return p.tipo === 'esclarecimento' ? 'Resposta do órgão' : 'Decisão do órgão'
}

/** Normaliza os filtros antes de mandar ao banco (UF em maiúsculas, textos aparados). */
export function filtrosParaBanco(f: FiltrosPecas) {
  const busca = f.busca.trim()
  if (busca.length > 300) throw new Error('Use no máximo 300 caracteres nos termos da pesquisa.')
  if (!f.tipos.length) throw new Error('Marque ao menos um tipo de peça.')
  return { busca, tipos: f.tipos, uf: f.uf.trim().toUpperCase(), orgao: f.orgao.trim().slice(0, 120), novaLei: f.novaLei }
}

export async function pesquisarPecas(f: FiltrosPecas, pagina: number, signal?: AbortSignal): Promise<ResultadoPecas> {
  const pedido = supabase.rpc('buscar_pecas', { p_filtros: filtrosParaBanco(f), p_pagina: pagina })
  const { data, error } = await (signal ? pedido.abortSignal(signal) : pedido)
  if (error) {
    if (signal?.aborted) throw signal.reason
    if (['PGRST202', 'PGRST205', '42883'].includes(error.code)) throw new Error('A busca de peças está sendo preparada. Tente novamente em instantes.')
    if (error.message?.includes('palavra-chave')) throw new Error('Informe uma palavra-chave para pesquisar.')
    if (error.message?.includes('tipo de peça')) throw new Error('Marque ao menos um tipo de peça.')
    throw new Error('Não foi possível pesquisar as peças. Tente novamente.')
  }
  if (!data || !Array.isArray(data.data) || typeof data.total !== 'number') throw new Error('A pesquisa retornou uma resposta inesperada.')
  return data as ResultadoPecas
}

export async function statusPecas(): Promise<StatusPecas | null> {
  const { data, error } = await supabase.rpc('pecas_status')
  if (error || !data) return null
  return data as StatusPecas
}

/** Texto do PDF da peça, lido na hora no portal (nada fica guardado). */
export async function lerPeca(url: string, signal?: AbortSignal): Promise<TextoPeca> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('Entre na sua conta para ler a peça.')
  const r = await fetch(`/api/juridico?${new URLSearchParams({ acao: 'ler', url })}`, { headers: { Authorization: `Bearer ${data.session.access_token}` }, signal })
  const corpo = await r.json().catch(() => null)
  if (!r.ok) throw new Error(corpo?.error ?? 'Não foi possível abrir a peça agora.')
  return corpo as TextoPeca
}

/** Texto que vai para a minuta ao usar uma peça como modelo: cabeçalho de referência + conteúdo. */
export function textoDoModelo(p: PecaPublicada, conteudo: string) {
  const ref = [p.processo.modalidade, p.processo.numero && `nº ${p.processo.numero}`, p.processo.orgao, p.processo.uf].filter(Boolean).join(' · ')
  return `[MODELO DE REFERÊNCIA: ${p.titulo}${p.empresa ? ` de ${p.empresa}` : ''} (${ref}). Troque os dados da outra empresa e do outro processo pelos seus antes de protocolar.]\n\n${conteudo.trim()}`
}
