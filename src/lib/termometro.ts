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

/** Resumo de pagamentos de uma UG (ou do órgão inteiro) nos últimos 3 meses fechados + o corrente. */
export interface DadosFederal { n: number; soma_dias: number; ate5: number; ate15: number; ate30: number; acima30: number; nc: number; soma_c: number; c60: number }
export interface UgFederal { ug: string; nome: string; orgao_codigo: string | null; orgao: string | null; orgao_sup: string | null; dados: DadosFederal | null; dados_orgao: DadosFederal | null }
export interface MedidaFederal { base: 'ug' | 'orgao'; n: number; media: number; pctAte15: number; pctAcima30: number; nc: number; mediaServico: number | null; pctServico60: number | null }

/** Mínimo de pagamentos medidos para dar selo. */
export const MINIMO_FEDERAL = 10

/** Números do selo: usa a UG; com poucos pagamentos, o órgão inteiro. Sem dados suficientes, null. */
export function medirFederal(u: Pick<UgFederal, 'dados' | 'dados_orgao'> | null | undefined): MedidaFederal | null {
  if (!u) return null
  const base = (u.dados?.n ?? 0) >= MINIMO_FEDERAL ? 'ug' : (u.dados_orgao?.n ?? 0) >= MINIMO_FEDERAL ? 'orgao' : null
  if (!base) return null
  const d = (base === 'ug' ? u.dados : u.dados_orgao)!
  const temServico = d.nc >= MINIMO_FEDERAL
  return {
    base, n: d.n, media: d.soma_dias / d.n, pctAte15: (d.ate5 + d.ate15) / d.n, pctAcima30: d.acima30 / d.n,
    nc: d.nc, mediaServico: temServico ? d.soma_c / d.nc : null, pctServico60: temServico ? d.c60 / d.nc : null,
  }
}

/**
 * Selo federal. Calibrado com out–nov/2026 (2.215 UGs): a média entre liquidação e pagamento tem mediana de 6 dias
 * (95% abaixo de 13); do fim do mês do serviço ao pagamento, mediana de 23 dias (90% abaixo de 43).
 * - Pagamento lento: média acima de 15 dias, 10% ou mais acima de 30 dias, ou, do fim do mês do serviço, média acima de
 *   45 dias ou 25% ou mais acima de 60.
 * - Paga em dia: média até 7 dias, menos de 5% acima de 30 e (quando há o mês do serviço) média até 30 e menos de 10% acima de 60.
 */
export function classificarFederal(m: MedidaFederal | null): Classificacao {
  if (!m) return { nivel: 'sem_nota', rotulo: 'Poucos pagamentos medidos', cor: 'neutro', texto: 'Esta unidade federal teve poucos pagamentos a fornecedores nos últimos meses no Portal da Transparência. Sem base para medir o prazo.' }
  const lentoServico = m.mediaServico != null && (m.mediaServico > 45 || (m.pctServico60 ?? 0) >= 0.25)
  const okServico = m.mediaServico == null || (m.mediaServico <= 30 && (m.pctServico60 ?? 0) < 0.1)
  const resumo = `Em média ${dias(m.media)} entre a liquidação (nota atestada) e o pagamento; ${pctTxt(m.pctAcima30)} passaram de 30 dias.`
  if (m.media > 15 || m.pctAcima30 >= 0.1 || lentoServico) return { nivel: 'risco', rotulo: 'Pagamento lento', cor: 'vermelho', texto: `${resumo} Bem acima da média federal: avalie o fôlego de caixa antes de disputar.` }
  if (m.media <= 7 && m.pctAcima30 < 0.05 && okServico) return { nivel: 'bom', rotulo: 'Paga em dia', cor: 'verde', texto: `${resumo} Prazo curto, dentro do padrão federal.` }
  return { nivel: 'regular', rotulo: 'Pagamento regular', cor: 'amarelo', texto: `${resumo} Um pouco mais lento que a média federal: acompanhe os prazos do contrato.` }
}
const dias = (v: number) => (v < 1.5 ? `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dia` : `${Math.round(v)} dias`)
const pctTxt = (v: number) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`
export const diasTexto = dias
export const pctTexto = pctTxt

/** "20261119" → "19/11/2026". */
export const posicaoFederal = (d: string | null | undefined) => (d && /^\d{8}$/.test(d) ? `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}` : null)

export const INDICADORES = [
  { campo: 1, nome: 'Endividamento', ajuda: 'Dívida consolidada em relação à receita corrente líquida.' },
  { campo: 2, nome: 'Poupança corrente', ajuda: 'Quanto da receita corrente já é consumida pela despesa corrente.' },
  { campo: 3, nome: 'Liquidez', ajuda: 'Se o caixa disponível cobre as obrigações financeiras de curto prazo. É o indicador mais ligado a pagar o fornecedor em dia.' },
] as const

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * Onde procurar a nota pelos dados oficiais do PNCP (esfera do órgão e IBGE da unidade).
 * Federal com ug: unidade gestora (UASG do PNCP), medida pelo Portal da Transparência; sem ug, só o selo genérico. */
export type AlvoCapag = { tipo: 'chave'; chave: string } | { tipo: 'municipio'; uf: string; nome: string } | { tipo: 'federal'; ug?: string } | null
export function alvoPeloPncp(esferaId: string | null | undefined, codigoIbge: string | null | undefined, uf: string | null | undefined, codigoUnidade?: string | null): AlvoCapag {
  const e = String(esferaId ?? '').toUpperCase()
  if (e === 'F') return /^\d{6}$/.test(String(codigoUnidade ?? '')) ? { tipo: 'federal', ug: codigoUnidade! } : { tipo: 'federal' }
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
