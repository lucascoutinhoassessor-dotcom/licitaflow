// Peças jurídicas da licitação (Lei 14.133/2021): impugnação, esclarecimento, intenção de recurso,
// recurso e contrarrazões. Monta a minuta a partir do processo e da empresa e calcula o prazo legal
// em dias úteis. Sem dependência de React/Supabase, testável.
import { formatarCnpj } from './format'

export type TipoPeca = 'impugnacao' | 'esclarecimento' | 'intencao-recurso' | 'recurso' | 'contrarrazoes'

export interface Tese { id: string; rotulo: string; texto: string }

export interface DefinicaoPeca {
  id: TipoPeca
  rotulo: string
  titulo: string
  descricao: string
  fundamento: string
  /** Regra do prazo, em texto, para exibir ao cliente. */
  regraPrazo: string
  /** Tipo de prazo usado na agenda (tabela prazos). */
  tipoPrazo: 'impugnacao' | 'esclarecimento' | 'recurso' | 'contrarrazoes'
  /** Data que serve de base para o prazo. */
  baseData: 'abertura' | 'sessao' | 'intimacao'
  rotuloBaseData: string
  teses: Tese[]
}

const T = (id: string, rotulo: string, texto: string): Tese => ({ id, rotulo, texto })

const TESES_EDITAL: Tese[] = [
  T('competitividade', 'Restrição à competitividade', 'A exigência ora atacada restringe indevidamente o caráter competitivo do certame, em afronta ao art. 9º, inciso I, alínea "a", da Lei nº 14.133/2021, que veda aos agentes públicos admitir, prever, incluir ou tolerar, nos atos que praticarem, situações que comprometam, restrinjam ou frustrem o caráter competitivo do processo licitatório.'),
  T('marca', 'Indicação de marca ou especificação dirigida', 'A especificação do objeto conduz, na prática, a uma única marca ou fabricante, sem a justificativa técnica exigida pelo art. 41, inciso I, da Lei nº 14.133/2021. A indicação de marca só é admitida em hipóteses excepcionais e formalmente motivadas, o que não se verifica no caso.'),
  T('habilitacao', 'Exigência de habilitação excessiva', 'As exigências de habilitação devem limitar-se ao rol dos arts. 62 a 70 da Lei nº 14.133/2021 e ser proporcionais ao objeto. A exigência impugnada extrapola o necessário à garantia do cumprimento das obrigações, em desacordo também com o art. 37, inciso XXI, da Constituição Federal, que admite apenas as exigências de qualificação técnica e econômica indispensáveis.'),
  T('qualificacao-tecnica', 'Atestado com quantitativo ou tempo excessivo', 'A exigência de atestados de capacidade técnica deve se restringir às parcelas de maior relevância ou valor significativo do objeto, admitida a exigência de quantitativos mínimos de até 50% (cinquenta por cento), nos termos do art. 67, §§ 1º e 2º, da Lei nº 14.133/2021, vedadas limitações de tempo e de local.'),
  T('me-epp', 'Tratamento favorecido a ME/EPP', 'O edital deixa de observar o tratamento diferenciado e favorecido às microempresas e empresas de pequeno porte previsto nos arts. 42 a 49 da Lei Complementar nº 123/2006, aplicáveis por força do art. 4º da Lei nº 14.133/2021.'),
  T('prazo-entrega', 'Prazo de entrega ou execução inexequível', 'O prazo fixado para entrega/execução é incompatível com a natureza do objeto e com a prática de mercado, o que afasta potenciais licitantes e compromete a seleção da proposta mais vantajosa (art. 11, inciso I, da Lei nº 14.133/2021).'),
  T('orcamento', 'Orçamento estimado defasado', 'O valor estimado da contratação não reflete os preços praticados no mercado, em desacordo com o art. 23 da Lei nº 14.133/2021, o que pode levar ao fracasso do certame ou à contratação de propostas inexequíveis.'),
  T('lote', 'Agrupamento indevido em lote', 'A reunião de itens distintos em um único lote, sem justificativa técnica e econômica, contraria o princípio do parcelamento previsto no art. 40, inciso V, alínea "b", e § 2º, da Lei nº 14.133/2021, e restringe a participação de empresas especializadas.'),
]

const TESES_RECURSO: Tese[] = [
  T('vinculacao', 'Vinculação ao edital', 'A decisão recorrida afronta o princípio da vinculação ao edital (art. 5º da Lei nº 14.133/2021), pois aplicou ao caso critério diverso daquele fixado no instrumento convocatório.'),
  T('diligencia', 'Falta de diligência / formalismo excessivo', 'Eventual falha formal deveria ter sido sanada mediante diligência, nos termos do art. 64 da Lei nº 14.133/2021, que admite a complementação de informações acerca dos documentos já apresentados e a atualização de documentos cuja validade tenha expirado após a data de recebimento das propostas. O formalismo excessivo não pode prevalecer sobre a busca da proposta mais vantajosa.'),
  T('exequibilidade', 'Exequibilidade da proposta', 'A proposta não pode ser desclassificada por suposta inexequibilidade sem que se oportunize ao licitante demonstrar a sua viabilidade, conforme o art. 59, § 2º, da Lei nº 14.133/2021, e o entendimento consolidado do Tribunal de Contas da União (Súmula 262).'),
  T('habilitacao-concorrente', 'Habilitação irregular da concorrente', 'A empresa declarada vencedora não atendeu a requisitos de habilitação exigidos no edital, o que impõe a sua inabilitação, sob pena de violação aos princípios da isonomia e da vinculação ao edital (art. 5º da Lei nº 14.133/2021).'),
  T('proposta-concorrente', 'Proposta da concorrente em desacordo', 'A proposta aceita não atende às especificações técnicas obrigatórias do termo de referência, devendo ser desclassificada nos termos do art. 59, inciso II, da Lei nº 14.133/2021.'),
  T('motivacao', 'Ausência de motivação', 'A decisão carece da motivação exigida pelo art. 5º da Lei nº 14.133/2021 e pelo art. 50 da Lei nº 9.784/1999, o que impede o exercício do contraditório e da ampla defesa e a torna nula.'),
]

const TESES_CONTRARRAZOES: Tese[] = [
  T('acerto', 'Acerto da decisão recorrida', 'A decisão recorrida está em plena conformidade com o edital e com a Lei nº 14.133/2021, tendo sido proferida após a análise criteriosa da documentação e da proposta, razão pela qual deve ser integralmente mantida.'),
  T('mero-inconformismo', 'Recurso protelatório / mero inconformismo', 'As razões recursais não apontam vício concreto na decisão, limitando-se a manifestar inconformismo com o resultado, o que não basta para a sua reforma e apenas retarda a conclusão da contratação, em prejuízo do interesse público.'),
  T('diligencia-valida', 'Diligência regularmente realizada', 'Eventuais esclarecimentos foram obtidos por meio de diligência regular, expressamente autorizada pelo art. 64 da Lei nº 14.133/2021, sem a inclusão de documento novo que devesse constar originalmente da proposta.'),
  T('exequivel', 'Proposta exequível', 'A proposta da recorrida é exequível e foi devidamente demonstrada, não havendo qualquer elemento concreto que indique a impossibilidade de cumprimento do contrato (art. 59, § 2º, da Lei nº 14.133/2021).'),
  T('preclusao', 'Preclusão / falta de intenção motivada', 'O recurso não deve ser conhecido quanto às matérias que não constaram da manifestação de intenção de recorrer, nos termos do art. 165, § 1º, inciso I, da Lei nº 14.133/2021.'),
]

export const PECAS: DefinicaoPeca[] = [
  {
    id: 'impugnacao', rotulo: 'Impugnação', titulo: 'Impugnação ao edital',
    descricao: 'Questione cláusulas ilegais ou restritivas do edital antes da abertura.',
    fundamento: 'Art. 164 da Lei nº 14.133/2021',
    regraPrazo: 'Até 3 dias úteis antes da data de abertura do certame (art. 164).',
    tipoPrazo: 'impugnacao', baseData: 'abertura', rotuloBaseData: 'Data de abertura', teses: TESES_EDITAL,
  },
  {
    id: 'esclarecimento', rotulo: 'Esclarecimento', titulo: 'Pedido de esclarecimento',
    descricao: 'Tire dúvidas sobre o edital por escrito, com resposta oficial do órgão.',
    fundamento: 'Art. 164 da Lei nº 14.133/2021',
    regraPrazo: 'Até 3 dias úteis antes da data de abertura do certame (art. 164).',
    tipoPrazo: 'esclarecimento', baseData: 'abertura', rotuloBaseData: 'Data de abertura', teses: [],
  },
  {
    id: 'intencao-recurso', rotulo: 'Intenção de recurso', titulo: 'Intenção de recurso',
    descricao: 'Texto curto e motivado para registrar no sistema logo após a decisão.',
    fundamento: 'Art. 165, § 1º, inciso I, da Lei nº 14.133/2021',
    regraPrazo: 'Imediatamente após a decisão, no prazo aberto pelo sistema (em geral, 10 a 30 minutos), sob pena de preclusão.',
    tipoPrazo: 'recurso', baseData: 'sessao', rotuloBaseData: 'Data da sessão', teses: [],
  },
  {
    id: 'recurso', rotulo: 'Recurso', titulo: 'Recurso administrativo',
    descricao: 'Razões recursais contra julgamento de propostas, habilitação ou inabilitação.',
    fundamento: 'Art. 165, inciso I, da Lei nº 14.133/2021',
    regraPrazo: '3 dias úteis contados da intimação ou da lavratura da ata (art. 165, I).',
    tipoPrazo: 'recurso', baseData: 'intimacao', rotuloBaseData: 'Data da intimação ou da ata', teses: TESES_RECURSO,
  },
  {
    id: 'contrarrazoes', rotulo: 'Contrarrazões', titulo: 'Contrarrazões ao recurso',
    descricao: 'Defenda o resultado favorável a sua empresa contra o recurso de um concorrente.',
    fundamento: 'Art. 165, § 4º, da Lei nº 14.133/2021',
    regraPrazo: '3 dias úteis contados da intimação ou divulgação da interposição do recurso (art. 165, § 4º).',
    tipoPrazo: 'contrarrazoes', baseData: 'intimacao', rotuloBaseData: 'Data da intimação do recurso', teses: TESES_CONTRARRAZOES,
  },
]

export const pecaPorId = (id: string | undefined) => PECAS.find((p) => p.id === id)

// ---------- Dias úteis ----------

function pascoa(ano: number): Date {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(ano, mes - 1, dia)
}

const chave = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const somarDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/** Feriados nacionais (inclui Carnaval, Sexta-feira Santa e Corpus Christi, sem expediente na maioria dos órgãos). */
export function feriadosNacionais(ano: number): Set<string> {
  const p = pascoa(ano)
  const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].map((md) => `${ano}-${md}`)
  const moveis = [-48, -47, -2, 60].map((n) => chave(somarDias(p, n)))
  return new Set([...fixos, ...moveis])
}

export function ehDiaUtil(d: Date): boolean {
  const dia = d.getDay()
  return dia !== 0 && dia !== 6 && !feriadosNacionais(d.getFullYear()).has(chave(d))
}

/** Anda n dias úteis a partir da data (n negativo = para trás). A data inicial não conta. */
export function somarDiasUteis(inicio: Date, n: number): Date {
  let d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate())
  const passo = n < 0 ? -1 : 1
  let faltam = Math.abs(n)
  while (faltam > 0) {
    d = somarDias(d, passo)
    if (ehDiaUtil(d)) faltam--
  }
  return d
}

/** Data limite para protocolar a peça, a partir da data base informada (yyyy-mm-dd). */
export function prazoDaPeca(tipo: TipoPeca, base: string | null | undefined): Date | null {
  if (!base || !/^\d{4}-\d{2}-\d{2}/.test(base)) return null
  const [a, m, d] = base.slice(0, 10).split('-').map(Number)
  const data = new Date(a, m - 1, d)
  if (tipo === 'impugnacao' || tipo === 'esclarecimento') return somarDiasUteis(data, -3)
  if (tipo === 'intencao-recurso') return data
  return somarDiasUteis(data, 3)
}

// ---------- Montagem do texto ----------

export interface DadosPeca {
  empresa: { razao_social: string; cnpj: string; endereco?: Record<string, string | null> | null; municipio?: string | null; uf?: string | null } | null
  representante: string
  cargo: string
  orgao: string
  numero: string
  modalidade: string
  objeto: string
  destinatario: string
  cidade: string
  data: string
  itens: string
  /** Empresa concorrente (recorrida no recurso, recorrente nas contrarrazões). */
  concorrente: string
  atoRecorrido: string
  fatos: string
  teses: string[]
  argumentos: string
  pedidos: string
  perguntas: string
}

export const DADOS_VAZIOS: DadosPeca = {
  empresa: null, representante: '', cargo: 'Representante legal', orgao: '', numero: '', modalidade: '', objeto: '',
  destinatario: '', cidade: '', data: '', itens: '', concorrente: '', atoRecorrido: '', fatos: '', teses: [],
  argumentos: '', pedidos: '', perguntas: '',
}

const ou = (v: string, marcador: string) => (v.trim() ? v.trim() : `[${marcador}]`)

function qualificacao(d: DadosPeca) {
  const e = d.empresa
  const nome = e?.razao_social || '[RAZÃO SOCIAL DA EMPRESA]'
  const cnpj = e?.cnpj ? formatarCnpj(e.cnpj) : '[CNPJ]'
  const end = e?.endereco
  const partes = [end?.logradouro, end?.numero, end?.complemento, end?.bairro, [e?.municipio, e?.uf].filter(Boolean).join('/'), end?.cep ? `CEP ${end.cep}` : null].filter(Boolean)
  const endereco = partes.length ? `, com sede em ${partes.join(', ')}` : ''
  return `${nome.toUpperCase()}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${cnpj}${endereco}, neste ato representada por ${ou(d.representante, 'NOME DO REPRESENTANTE')}`
}

function cabecalho(d: DadosPeca, destinoPadrao: string) {
  return [
    `AO(À) ${ou(d.destinatario, destinoPadrao).toUpperCase()}`,
    ou(d.orgao, 'ÓRGÃO OU ENTIDADE').toUpperCase(),
    '',
    `Ref.: ${[d.modalidade, d.numero ? `nº ${d.numero}` : '[nº do edital]'].filter(Boolean).join(' ')}`,
    `Objeto: ${ou(d.objeto, 'objeto da licitação')}`,
  ].join('\n')
}

function assinatura(d: DadosPeca) {
  const local = [d.cidade.trim() || '[Cidade]', d.data.trim() || '[data]'].join(', ')
  return [
    'Nestes termos, pede deferimento.',
    '',
    `${local}.`,
    '',
    '',
    '_______________________________________',
    ou(d.representante, 'NOME DO REPRESENTANTE'),
    d.cargo.trim() || 'Representante legal',
    d.empresa?.razao_social || '[RAZÃO SOCIAL]',
    d.empresa?.cnpj ? `CNPJ ${formatarCnpj(d.empresa.cnpj)}` : '',
  ].filter((l, i, arr) => !(l === '' && i === arr.length - 1)).join('\n')
}

function textoTeses(def: DefinicaoPeca, ids: string[]) {
  return def.teses.filter((t) => ids.includes(t.id)).map((t) => t.texto)
}

function numerar(texto: string) {
  return texto.split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => `${i + 1}. ${l.replace(/^\d+[.)-]\s*/, '')}`).join('\n')
}

function secoes(lista: [string, string][]) {
  return lista.filter(([, corpo]) => corpo.trim()).map(([titulo, corpo]) => `${titulo}\n\n${corpo.trim()}`).join('\n\n\n')
}

const PEDIDOS_PADRAO: Record<TipoPeca, string> = {
  impugnacao: 'a) o recebimento e o processamento desta impugnação, por tempestiva;\nb) a retificação do edital nos pontos impugnados, com a consequente republicação e reabertura do prazo para apresentação das propostas, nos termos do art. 55, § 1º, da Lei nº 14.133/2021;\nc) a resposta fundamentada no prazo de até 3 (três) dias úteis, conforme o parágrafo único do art. 164 da Lei nº 14.133/2021.',
  esclarecimento: '',
  'intencao-recurso': '',
  recurso: 'a) o recebimento e o conhecimento deste recurso, por tempestivo e cabível;\nb) a reconsideração da decisão recorrida pelo agente de contratação/pregoeiro, no prazo de 3 (três) dias úteis, ou, caso mantida, o encaminhamento à autoridade superior, nos termos do art. 165, § 2º, da Lei nº 14.133/2021;\nc) o provimento do recurso, com a reforma da decisão nos termos expostos.',
  contrarrazoes: 'a) o recebimento destas contrarrazões, por tempestivas;\nb) o não provimento do recurso interposto, com a manutenção integral da decisão recorrida;\nc) o prosseguimento do certame, com a adjudicação e a homologação do objeto em favor da recorrida.',
}

export const pedidosPadrao = (tipo: TipoPeca) => PEDIDOS_PADRAO[tipo]

/** Monta a minuta da peça em texto simples, com marcadores [ENTRE COLCHETES] no que faltar. */
export function montarPeca(tipo: TipoPeca, d: DadosPeca): string {
  const def = pecaPorId(tipo)!
  const quem = qualificacao(d)
  const itens = d.itens.trim() ? ` (${d.itens.trim()})` : ''

  if (tipo === 'intencao-recurso') {
    const motivo = d.argumentos.trim() || d.fatos.trim() || '[motivo resumido]'
    return `${d.empresa?.razao_social || '[EMPRESA]'} manifesta intenção de recorrer${d.itens.trim() ? ` (${d.itens.trim()})` : ''} contra ${ou(d.atoRecorrido, 'a decisão que ...').replace(/[.]$/, '')}${d.concorrente.trim() ? `, referente à empresa ${d.concorrente.trim()}` : ''}. Motivo: ${motivo.replace(/\s+/g, ' ')} As razões serão apresentadas no prazo do art. 165, I, da Lei nº 14.133/2021.`
  }

  if (tipo === 'esclarecimento') {
    return [
      cabecalho(d, 'Agente de Contratação / Pregoeiro(a)'),
      '',
      '',
      `${quem}, vem, respeitosamente, com fundamento no art. 164 da Lei nº 14.133/2021 e nas disposições do edital, apresentar`,
      '',
      'PEDIDO DE ESCLARECIMENTO',
      '',
      'pelos motivos a seguir.',
      '',
      '',
      secoes([
        ['I. CONTEXTO', d.fatos.trim() || 'Ao analisar o edital e seus anexos para a elaboração da proposta, a requerente identificou pontos que necessitam de esclarecimento para a correta formulação da proposta e a participação em igualdade de condições.'],
        ['II. QUESTIONAMENTOS', d.perguntas.trim() ? numerar(d.perguntas) : '1. [Pergunta objetiva, indicando o item ou a cláusula do edital]'],
        ['III. PEDIDO', 'Requer que os questionamentos sejam respondidos no prazo de até 3 (três) dias úteis, com a divulgação da resposta no sítio oficial, nos termos do parágrafo único do art. 164 da Lei nº 14.133/2021, e, sendo o caso, com a retificação do edital e a reabertura do prazo de propostas (art. 55, § 1º).'],
      ]),
      '',
      '',
      assinatura(d),
    ].join('\n')
  }

  const fundamentos = [...textoTeses(def, d.teses), d.argumentos.trim()].filter(Boolean).join('\n\n')
  const pedidos = d.pedidos.trim() || PEDIDOS_PADRAO[tipo]

  if (tipo === 'impugnacao') {
    return [
      cabecalho(d, 'Agente de Contratação / Pregoeiro(a)'),
      '',
      '',
      `${quem}, vem, respeitosamente e tempestivamente, com fundamento no art. 164 da Lei nº 14.133/2021, apresentar`,
      '',
      'IMPUGNAÇÃO AO EDITAL',
      '',
      'pelas razões de fato e de direito a seguir expostas.',
      '',
      '',
      secoes([
        ['I. DA TEMPESTIVIDADE', 'Nos termos do art. 164 da Lei nº 14.133/2021, qualquer pessoa é parte legítima para impugnar o edital por irregularidade na aplicação da lei, devendo protocolar o pedido até 3 (três) dias úteis antes da data de abertura do certame. A presente impugnação é, portanto, tempestiva.'],
        ['II. DOS PONTOS IMPUGNADOS', d.itens.trim() || '[Indique as cláusulas, itens ou exigências do edital que estão sendo impugnados]'],
        ['III. DOS FATOS', d.fatos.trim() || '[Descreva o que o edital exige e por que isso prejudica a competição ou contraria a lei]'],
        ['IV. DO DIREITO', fundamentos || '[Fundamentos jurídicos]'],
        ['V. DOS PEDIDOS', `Diante do exposto, requer:\n\n${pedidos}`],
      ]),
      '',
      '',
      assinatura(d),
    ].join('\n')
  }

  if (tipo === 'recurso') {
    return [
      cabecalho(d, 'Agente de Contratação / Pregoeiro(a)'),
      '',
      '',
      `${quem}, vem, respeitosamente, com fundamento no art. 165, inciso I, da Lei nº 14.133/2021, interpor`,
      '',
      'RECURSO ADMINISTRATIVO',
      '',
      `contra ${ou(d.atoRecorrido, 'a decisão que ...').replace(/[.]$/, '')}${itens}${d.concorrente.trim() ? `, tendo como recorrida a empresa ${d.concorrente.trim()}` : ''}, pelas razões a seguir expostas, requerendo, caso não haja reconsideração, o encaminhamento à autoridade superior, nos termos do art. 165, § 2º.`,
      '',
      '',
      secoes([
        ['I. DA TEMPESTIVIDADE E DO CABIMENTO', 'A recorrente manifestou tempestivamente a intenção de recorrer, nos termos do art. 165, § 1º, inciso I, da Lei nº 14.133/2021, e apresenta estas razões dentro do prazo de 3 (três) dias úteis contados da intimação ou da lavratura da ata, sendo o recurso tempestivo e cabível.'],
        ['II. DOS FATOS', d.fatos.trim() || '[Descreva a decisão recorrida e o que aconteceu na sessão]'],
        ['III. DAS RAZÕES DO RECURSO', fundamentos || '[Razões jurídicas para reformar a decisão]'],
        ['IV. DOS PEDIDOS', `Diante do exposto, requer:\n\n${pedidos}`],
      ]),
      '',
      '',
      assinatura(d),
    ].join('\n')
  }

  // contrarrazões
  return [
    cabecalho(d, 'Agente de Contratação / Pregoeiro(a)'),
    '',
    '',
    `${quem}, vem, respeitosamente, com fundamento no art. 165, § 4º, da Lei nº 14.133/2021, apresentar`,
    '',
    'CONTRARRAZÕES AO RECURSO ADMINISTRATIVO',
    '',
    `interposto por ${ou(d.concorrente, 'EMPRESA RECORRENTE')}${itens}, pelas razões a seguir expostas.`,
    '',
    '',
    secoes([
      ['I. DA TEMPESTIVIDADE', 'As presentes contrarrazões são apresentadas dentro do prazo de 3 (três) dias úteis contados da intimação ou da divulgação da interposição do recurso, conforme o art. 165, § 4º, da Lei nº 14.133/2021.'],
      ['II. SÍNTESE DO RECURSO', d.fatos.trim() || '[Resuma o que a recorrente alega]'],
      ['III. DAS RAZÕES PARA A MANUTENÇÃO DA DECISÃO', fundamentos || '[Por que a decisão deve ser mantida]'],
      ['IV. DOS PEDIDOS', `Diante do exposto, requer:\n\n${pedidos}`],
    ]),
    '',
    '',
    assinatura(d),
  ].join('\n')
}

/** Documento do Word (HTML que o Word abre) a partir do texto da peça. */
export function htmlParaWord(texto: string, titulo: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const corpo = texto.split('\n').map((l) => {
    const t = l.trim()
    if (!t) return '<p style="margin:0">&nbsp;</p>'
    const titulo = /^(?:[IVX]+\.\s|[A-ZÀ-Ü ]{8,}$)/.test(t) && t === t.toUpperCase()
    return `<p style="margin:0;text-align:${titulo ? 'left' : 'justify'}">${titulo ? `<b>${esc(t)}</b>` : esc(l)}</p>`
  }).join('\n')
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(titulo)}</title>
<style>body{font-family:"Times New Roman",serif;font-size:12pt;line-height:1.5}@page{margin:2.5cm 2.5cm 2.5cm 3cm}</style></head><body>${corpo}</body></html>`
}
