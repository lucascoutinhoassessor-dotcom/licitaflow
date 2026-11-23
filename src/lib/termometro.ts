/** Nota CAPAG do Tesouro Nacional de um estado ou município (tabela public.capag). */
export interface CapagEnte {
  chave: string; esfera: 'M' | 'E'; ibge: string | null; uf: string; nome: string; nota: string | null
  indicador1: number | null; nota1: string | null; indicador2: number | null; nota2: string | null; indicador3: number | null; nota3: string | null
  icf: string | null; observacao: string | null; posicao: string | null; fonte: string | null; atualizado_em: string
}

export type NivelTermometro = 'bom' | 'regular' | 'risco' | 'sem_nota' | 'federal'
export interface Classificacao { nivel: NivelTermometro; rotulo: string; cor: 'verde' | 'amarelo' | 'vermelho' | 'neutro' | 'azul'; texto: string }

/** Selo a partir da nota CAPAG: A+/A boa saúde, B+/B regular, C/D risco de atraso. */
export function classificar(nota: string | null | undefined): Classificacao {
  const n = String(nota ?? '').trim().toUpperCase()
  if (n === 'A+' || n === 'A') return { nivel: 'bom', rotulo: 'Boa saúde financeira', cor: 'verde', texto: 'Contas equilibradas e caixa suficiente para as obrigações: menor risco de atrasar pagamentos.' }
  if (n === 'B+' || n === 'B') return { nivel: 'regular', rotulo: 'Saúde financeira regular', cor: 'amarelo', texto: 'Situação intermediária: costuma pagar, mas com menos folga de caixa. Acompanhe os prazos do contrato.' }
  if (n === 'C' || n === 'D') return { nivel: 'risco', rotulo: 'Risco de atraso', cor: 'vermelho', texto: 'Dívida alta, gasto corrente alto ou caixa curto para as obrigações: maior risco de atrasar pagamentos. Avalie prazos e garantias antes de disputar.' }
  return { nivel: 'sem_nota', rotulo: 'Sem nota do Tesouro', cor: 'neutro', texto: 'O Tesouro não calculou a nota deste ente (dados contábeis não enviados ou inconsistentes). Isso por si só merece atenção.' }
}
export const FEDERAL: Classificacao = { nivel: 'federal', rotulo: 'Governo Federal', cor: 'azul', texto: 'Órgãos federais não têm nota CAPAG. Os pagamentos saem pelo Tesouro Nacional e costumam seguir o prazo do contrato.' }

export const INDICADORES = [
  { campo: 1, nome: 'Endividamento', ajuda: 'Dívida consolidada em relação à receita corrente líquida.' },
  { campo: 2, nome: 'Poupança corrente', ajuda: 'Quanto da receita corrente já é consumida pela despesa corrente.' },
  { campo: 3, nome: 'Liquidez', ajuda: 'Se o caixa disponível cobre as obrigações financeiras de curto prazo. É o indicador mais ligado a pagar o fornecedor em dia.' },
] as const

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Onde procurar a nota pelos dados oficiais do PNCP (esfera do órgão e IBGE da unidade). */
export type AlvoCapag = { tipo: 'chave'; chave: string } | { tipo: 'municipio'; uf: string; nome: string } | { tipo: 'federal' } | null
export function alvoPeloPncp(esferaId: string | null | undefined, codigoIbge: string | null | undefined, uf: string | null | undefined): AlvoCapag {
  const e = String(esferaId ?? '').toUpperCase()
  if (e === 'F') return { tipo: 'federal' }
  if (e === 'E' && uf && /^[A-Z]{2}$/.test(uf)) return { tipo: 'chave', chave: `E:${uf}` }
  if (e === 'M' && /^\d{7}$/.test(String(codigoIbge ?? ''))) return { tipo: 'chave', chave: `M:${codigoIbge}` }
  if (e === 'D' && uf === 'DF') return { tipo: 'chave', chave: 'E:DF' }
  return null
}

/**
 * Quando não há esfera/IBGE (sugestões do Radar, processos), pelo nome do órgão: "Município de…", "Prefeitura…",
 * "Câmara Municipal…" usam a nota da cidade; "Estado de…", "Secretaria de Estado…" a do estado; federais, sem nota.
 */
export function alvoPeloNome(orgao: string | null | undefined, uf: string | null | undefined, municipio: string | null | undefined): AlvoCapag {
  const o = sem(String(orgao ?? ''))
  if (!o) return null
  if (/\bdistrito federal\b/.test(o) && !/\b(tribunal regional|justica federal|universidade|ministerio)\b/.test(o)) return { tipo: 'chave', chave: 'E:DF' }
  if (/\b(uniao|ministerio|universidade federal|instituto federal|federal|exercito|marinha|aeronautica|comando d[ao])\b/.test(o)) return { tipo: 'federal' }
  if (uf && municipio && /\b(municipio|municipal|prefeitura|camara (municipal|de vereadores)|servico autonomo|saae)\b/.test(o)) return { tipo: 'municipio', uf, nome: sem(municipio) }
  if (uf && /\b(estado d[eoa]|governo d[oa]|secretaria (de estado|estadual)|estadual|assembleia legislativa|tribunal de justica|policia (militar|civil))\b/.test(o)) return { tipo: 'chave', chave: `E:${uf}` }
  return null
}
export const nomeBusca = sem
