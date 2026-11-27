import { supabase } from './supabase'
import { prazoDaPeca } from './juridico'

/** Trecho do edital que comprova um item. `conferido`: achado no texto (true), não achado (false), PDF escaneado (null). */
export interface TrechoEdital { texto: string; documento: string; pagina: number | null; conferido: boolean | null }
export type CategoriaHabilitacao = 'juridica' | 'fiscal_trabalhista' | 'economico_financeira' | 'tecnica' | 'declaracoes' | 'outros'
export type TipoData = 'sessao' | 'propostas' | 'impugnacao' | 'esclarecimento' | 'visita' | 'amostra' | 'entrega' | 'validade_proposta' | 'vigencia' | 'outro'
/** Dados oficiais da compra no PNCP (não vêm da IA). */
export interface FichaCompra {
  modalidade: string | null; numero: string | null; processo: string | null; orgao: string | null; unidade: string | null
  municipio: string | null; uf: string | null; objeto: string | null; valor_estimado: number | null; srp: boolean | null
  modo_disputa: string | null; amparo_legal: string | null; situacao: string | null; abertura: string | null; encerramento: string | null; link_origem: string | null
  /** Esfera do órgão (M, E, F…) e IBGE da unidade, para o Termômetro de Pagamento. Leituras antigas não têm. */
  esfera?: string | null; codigo_ibge?: string | null
  /** Código da unidade (UASG); nos órgãos federais é a UG do SIAFI, usada no Termômetro federal. */
  codigo_unidade?: string | null
}
export interface AvaliacaoLeitor { nivel: 'favoravel' | 'atencao' | 'critico'; resumo: string; pontos_decisivos: string[] }
export interface CaracteristicasCompra {
  criterio_julgamento: string; modo_disputa: string; me_epp: 'exclusivo' | 'cota_reservada' | 'ampla' | 'nao_informado'
  registro_precos: 'sim' | 'nao' | 'nao_informado'; prazo_entrega: string; local_entrega: string; vigencia: string; pagamento: string; garantia_contratual: string
}
/** Leituras antigas não têm ficha, avaliação, características, tipo das datas nem orientação nos riscos. */
export interface ResultadoLeitor {
  resumo: string
  ficha?: FichaCompra | null
  avaliacao?: AvaliacaoLeitor
  caracteristicas?: CaracteristicasCompra
  datas: { tipo?: TipoData; evento: string; data: string; trecho: TrechoEdital }[]
  habilitacao: { categoria: CategoriaHabilitacao; exigencia: string; detalhe: string; trecho: TrechoEdital }[]
  proposta: { exigencia: string; detalhe: string; trecho: TrechoEdital }[]
  participacao: { tema: string; situacao: string; trecho: TrechoEdital }[]
  riscos: { nivel: 'alto' | 'medio' | 'baixo'; titulo: string; detalhe: string; orientacao?: string; fundamento?: string; trecho: TrechoEdital }[]
}

export const NOME_ME_EPP = { exclusivo: 'Exclusiva para ME/EPP', cota_reservada: 'Cota reservada para ME/EPP', ampla: 'Ampla concorrência', nao_informado: 'Não informado' } as const
export const NOME_SRP = { sim: 'Sim (ata de registro de preços)', nao: 'Não', nao_informado: 'Não informado' } as const
export const NOME_TIPO_DATA: Record<TipoData, string> = {
  sessao: 'Sessão pública', propostas: 'Propostas', impugnacao: 'Impugnação', esclarecimento: 'Esclarecimento', visita: 'Visita técnica',
  amostra: 'Amostra', entrega: 'Entrega/execução', validade_proposta: 'Validade da proposta', vigencia: 'Vigência', outro: 'Outro',
}
export const AVALIACAO = {
  favoravel: { rotulo: 'Favorável', texto: 'Sem exigências fora do comum.' },
  atencao: { rotulo: 'Exige atenção', texto: 'Há pontos que pedem preparo antes da sessão.' },
  critico: { rotulo: 'Crítico', texto: 'Há risco alto de inabilitação, desclassificação ou prazo apertado.' },
} as const

/** Ficha a partir da consulta pública do PNCP (mesma regra do servidor), para mostrar a compra antes da leitura. */
export function fichaDaCompra(c: any): FichaCompra | null {
  if (!c) return null
  return {
    modalidade: c.modalidadeNome ?? null,
    numero: c.numeroCompra && c.anoCompra ? `${c.numeroCompra}/${c.anoCompra}` : (c.numeroCompra ?? null),
    processo: c.processo ?? null, orgao: c.orgaoEntidade?.razaoSocial ?? null, unidade: c.unidadeOrgao?.nomeUnidade ?? null,
    municipio: c.unidadeOrgao?.municipioNome ?? null, uf: c.unidadeOrgao?.ufSigla ?? null, objeto: c.objetoCompra ?? null,
    valor_estimado: c.valorTotalEstimado ?? null, srp: c.srp ?? null, modo_disputa: c.modoDisputaNome ?? null,
    amparo_legal: c.amparoLegal?.nome ?? null, situacao: c.situacaoCompraNome ?? null,
    abertura: c.dataAberturaProposta ?? null, encerramento: c.dataEncerramentoProposta ?? null,
    link_origem: typeof c.linkSistemaOrigem === 'string' && /^https?:\/\//.test(c.linkSistemaOrigem) ? c.linkSistemaOrigem : null,
    esfera: c.orgaoEntidade?.esferaId ?? null, codigo_ibge: c.unidadeOrgao?.codigoIbge ?? null, codigo_unidade: c.unidadeOrgao?.codigoUnidade ?? null,
  }
}

/** Busca a ficha da compra na consulta pública do PNCP. */
export async function buscarFicha(cnpj: string, ano: string, seq: string, signal?: AbortSignal): Promise<FichaCompra | null> {
  const r = await fetch(`https://pncp.gov.br/api/consulta/v1/orgaos/${encodeURIComponent(cnpj)}/compras/${encodeURIComponent(ano)}/${encodeURIComponent(seq)}`, { signal })
  if (!r.ok) return null
  return fichaDaCompra(await r.json().catch(() => null))
}

/** "2026-12-05T09:00:00" (PNCP, horário de Brasília) → "05/12/2026 09:00". */
export function dataPncp(s: string | null | undefined) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s ?? '')
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : null
}

/**
 * Prazo legal para pedir esclarecimento ou impugnar: até 3 dias úteis antes da abertura (Lei 14.133, art. 164),
 * contando feriados nacionais. `encerramento` vem do PNCP ("2026-12-05T09:00:00", horário de Brasília).
 */
export function prazoImpugnacao(encerramento: string | null | undefined): Date | null {
  return prazoDaPeca('impugnacao', encerramento ?? null)
}

/** Texto simples do checklist, para copiar e mandar à equipe (WhatsApp, e-mail). */
export function textoChecklist(r: ResultadoLeitor, feitos: Set<string> = new Set()): string {
  const f = r.ficha
  const marca = (id: string) => (feitos.has(id) ? '[x]' : '[ ]')
  const linhas: string[] = []
  linhas.push(`CHECKLIST DO EDITAL${f ? ` · ${[f.modalidade, f.numero && `nº ${f.numero}`].filter(Boolean).join(' ')}` : ''}`)
  if (f?.orgao) linhas.push(`${f.orgao}${f.uf ? ` (${f.uf})` : ''}`)
  if (f?.objeto) linhas.push(`Objeto: ${f.objeto}`)
  if (r.avaliacao) linhas.push('', `Avaliação: ${AVALIACAO[r.avaliacao.nivel]?.rotulo ?? r.avaliacao.nivel}. ${r.avaliacao.resumo}`)
  const secao = (titulo: string, itens: { id: string; texto: string }[]) => {
    if (!itens.length) return
    linhas.push('', titulo.toUpperCase())
    for (const i of itens) linhas.push(`${marca(i.id)} ${i.texto}`)
  }
  secao('Datas', r.datas.map((d, i) => ({ id: `datas-${i}`, texto: `${d.evento}: ${d.data}` })))
  secao('Riscos', r.riscos.map((x, i) => ({ id: `riscos-${i}`, texto: `(${x.nivel}) ${x.titulo}${x.orientacao ? ` → ${x.orientacao}` : ''}` })))
  secao('Habilitação', r.habilitacao.map((x, i) => ({ id: `habilitacao-${i}`, texto: `${x.exigencia}${x.detalhe ? ` — ${x.detalhe}` : ''}` })))
  secao('Proposta', r.proposta.map((x, i) => ({ id: `proposta-${i}`, texto: `${x.exigencia}${x.detalhe ? ` — ${x.detalhe}` : ''}` })))
  linhas.push('', 'Gerado pelo Leitor de editais do LicitaForce. Confira sempre no edital.')
  return linhas.join('\n')
}
export interface DocumentoLido { id: string | null; titulo: string; url: string; lido: boolean; escaneado?: boolean; paginas?: number; paginasLidas?: number; aviso?: string }
export interface LeituraEdital { controle: string; objeto: string | null; resultado: ResultadoLeitor; documentos: DocumentoLido[]; modelo: string; created_at: string }
/** limite: número por mês, null = sem limite, 0 = fora do plano. origem: do plano ou exceção do cliente. */
export interface UsoLeitor { usadas: number; limite: number | null; origem?: 'plano' | 'cliente' }
export interface RespostaLeitor { leitura: LeituraEdital | null; uso: UsoLeitor; reaproveitada?: boolean }

export const NOME_CATEGORIA: Record<CategoriaHabilitacao, string> = {
  juridica: 'Habilitação jurídica', fiscal_trabalhista: 'Regularidade fiscal e trabalhista', economico_financeira: 'Qualificação econômico-financeira',
  tecnica: 'Qualificação técnica', declaracoes: 'Declarações', outros: 'Outros documentos',
}
export const NOME_TEMA: Record<string, string> = {
  me_epp: 'ME/EPP', consorcio: 'Consórcio', subcontratacao: 'Subcontratação', visita_tecnica: 'Visita técnica', garantia_proposta: 'Garantia da proposta',
  garantia_contrato: 'Garantia contratual', amostra: 'Amostra', criterio_julgamento: 'Critério de julgamento', modo_disputa: 'Modo de disputa', pagamento: 'Pagamento', outros: 'Outros',
}

/**
 * Número de controle PNCP (CNPJ-1-SEQ/ANO) a partir do que o cliente colar: o próprio número
 * ou o link do edital no PNCP (pncp.gov.br/app/editais/CNPJ/ANO/SEQ). null se não reconhecer.
 */
export function controleDe(entrada: string): string | null {
  const s = entrada.trim()
  const c = /(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})-1-0*(\d{1,9})\/(\d{4})/.exec(s)
  if (c) return `${c[1].replace(/\D/g, '')}-1-${c[2].padStart(6, '0')}/${c[3]}`
  const u = /editais\/(\d{14})\/(\d{4})\/(\d{1,9})/.exec(s)
  if (u) return `${u[1]}-1-${u[3].padStart(6, '0')}/${u[2]}`
  return null
}

/** Partes do número de controle para montar a rota do app. */
export function partesControle(controle: string) {
  const m = /^(\d{14})-1-0*(\d+)\/(\d{4})$/.exec(controle)
  return m ? { cnpj: m[1], seq: m[2], ano: m[3] } : null
}
export const rotaLeitor = (controle: string) => {
  const p = partesControle(controle)
  return p ? `/app/agentes/leitor/${p.cnpj}/${p.ano}/${p.seq}` : '/app/agentes'
}

async function chamar(metodo: 'GET' | 'POST', org: string, controle: string, signal?: AbortSignal): Promise<RespostaLeitor> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('Entre na sua conta para usar o Leitor de editais.')
  const qs = new URLSearchParams({ agente: 'leitor', org, controle })
  const r = await fetch(`/api/agentes?${qs}`, { method: metodo, headers: { Authorization: `Bearer ${data.session.access_token}` }, signal })
  const corpo = await r.json().catch(() => null)
  if (!r.ok) throw Object.assign(new Error(corpo?.error ?? 'Não foi possível ler o edital agora.'), { documentos: corpo?.documentos as DocumentoLido[] | undefined })
  return corpo as RespostaLeitor
}

/** Leitura já guardada deste edital (sem custo) e o consumo do mês. */
export const leituraGuardada = (org: string, controle: string, signal?: AbortSignal) => chamar('GET', org, controle, signal)
/** Lê o edital com a IA (ou reaproveita a leitura guardada). Pode levar alguns minutos. */
export const lerEditalIA = (org: string, controle: string) => chamar('POST', org, controle)
