// Conteúdo da landing page, editado pelo master (Landing page) e lido por /.
// Formato 2: a página inteira (marca, cores, menu, seções em ordem, rodapé) vem deste objeto.
// O formato 1 (7 textos soltos) continua sendo lido e é convertido para o formato 2.

export type TipoSecao = 'hero' | 'faixa' | 'cards' | 'passos' | 'lateral' | 'planos' | 'faq' | 'cta' | 'livre'
export type LinkSite = { texto: string; link: string }
export type ItemSite = { icone: string; titulo: string; texto: string; selo: string; cor: string }
export type SecaoSite = {
  uid: string
  tipo: TipoSecao
  visivel: boolean
  ancora: string
  selo: string
  titulo: string
  destaque: string
  destaque_estilo: 'gradiente' | 'suave'
  texto: string
  nota: string
  imagem: string
  botao: LinkSite
  botao2: LinkSite
  marcadores: string[]
  itens: ItemSite[]
  estilo: string
  colunas: number
}
export type ConteudoSite = {
  versao_schema: 2
  seo: { titulo_aba: string; descricao: string }
  tema: { cor1: string; cor2: string; fundo: string; barra_progresso: boolean }
  marca: { nome: string; nome_destaque: string; logo: string }
  menu: { links: LinkSite[]; entrar: string; cadastro: LinkSite; painel: string }
  secoes: SecaoSite[]
  rodape: { links: LinkSite[]; contato: string; copyright: string; instalar_app: boolean }
}

export const TIPOS_SECAO: { tipo: TipoSecao; nome: string; descricao: string }[] = [
  { tipo: 'hero', nome: 'Topo (hero)', descricao: 'Título grande, texto, botões e imagem ou ilustração ao lado' },
  { tipo: 'faixa', nome: 'Faixa rolante', descricao: 'Palavras passando em loop' },
  { tipo: 'cards', nome: 'Cartões', descricao: 'Grade de cartões com ícone, título e texto' },
  { tipo: 'passos', nome: 'Passo a passo', descricao: 'Etapas numeradas' },
  { tipo: 'lateral', nome: 'Texto + cartões ao lado', descricao: 'Texto à esquerda e cartões menores à direita' },
  { tipo: 'planos', nome: 'Planos e preços', descricao: 'Preços vêm de Planos; aqui você edita os textos' },
  { tipo: 'faq', nome: 'Perguntas frequentes', descricao: 'Perguntas que abrem e fecham' },
  { tipo: 'cta', nome: 'Chamada final', descricao: 'Caixa de destaque com botão' },
  { tipo: 'livre', nome: 'Seção livre', descricao: 'Título, texto, imagem e botão, como quiser' },
]

export const CORES_ITEM = ['azul', 'verde', 'roxo', 'laranja', 'rosa', 'amarelo', 'ciano', 'vermelho', 'cinza'] as const
export const CORES_SELO = ['verde', 'amarelo', 'azul', 'vermelho', 'cinza'] as const

const LIMITE_TEXTO = 4000
const LIMITE_LISTA = 60

let contador = 0
export const novoUid = () => `s${Date.now().toString(36)}${(contador++).toString(36)}`

const item = (icone: string, titulo: string, texto: string, selo = '', cor = ''): ItemSite => ({ icone, titulo, texto, selo, cor })

export function secaoVazia(tipo: TipoSecao): SecaoSite {
  return {
    uid: novoUid(), tipo, visivel: true, ancora: '', selo: '', titulo: '', destaque: '', destaque_estilo: 'gradiente',
    texto: '', nota: '', imagem: '', botao: { texto: '', link: '' }, botao2: { texto: '', link: '' },
    marcadores: [], itens: [], estilo: '', colunas: 3,
  }
}

/** Seção nova já com um exemplo para o master não começar do zero. */
export function secaoExemplo(tipo: TipoSecao): SecaoSite {
  const s = secaoVazia(tipo)
  const exemplo: Partial<SecaoSite> = {
    hero: { titulo: 'Seu título aqui.', destaque: 'Com destaque.', texto: 'Explique em uma frase o que você oferece.', botao: { texto: 'Criar minha conta grátis', link: '/cadastro' }, estilo: 'mockup' },
    faixa: { marcadores: ['Palavra 1', 'Palavra 2', 'Palavra 3'] },
    cards: { selo: 'Selo', titulo: 'Título da seção', itens: [item('Sparkles', 'Cartão 1', 'Texto do cartão.'), item('Sparkles', 'Cartão 2', 'Texto do cartão.'), item('Sparkles', 'Cartão 3', 'Texto do cartão.')] },
    passos: { selo: 'Como funciona', titulo: 'Título dos passos', itens: [item('', 'Passo 1', 'Descrição.'), item('', 'Passo 2', 'Descrição.'), item('', 'Passo 3', 'Descrição.')], colunas: 3 },
    lateral: { selo: 'Selo', titulo: 'Título', texto: 'Texto explicativo.', itens: [item('ShieldCheck', 'Ponto 1', 'Texto.'), item('ShieldCheck', 'Ponto 2', 'Texto.')], colunas: 2 },
    planos: { selo: 'Planos', titulo: 'Um plano para cada momento', texto: 'Comece com {dias} dias grátis.', botao: { texto: 'Começar {dias} dias grátis', link: '/cadastro' }, nota: 'Mais escolhido', estilo: 'profissional' },
    faq: { selo: 'Dúvidas', titulo: 'Perguntas frequentes', itens: [item('', 'Pergunta?', 'Resposta.')] },
    cta: { titulo: 'Chamada final', texto: 'Texto curto.', botao: { texto: 'Criar minha conta grátis', link: '/cadastro' }, nota: '{dias} dias grátis · sem cartão', estilo: 'Bell' },
    livre: { selo: '', titulo: 'Seção livre', texto: 'Escreva o que quiser aqui.\nQuebras de linha são mantidas.', estilo: 'direita', colunas: 1 },
  }[tipo]
  return { ...s, ...exemplo }
}

function sec(tipo: TipoSecao, uid: string, campos: Partial<SecaoSite>): SecaoSite {
  return { ...secaoVazia(tipo), uid, ...campos }
}

/** Página como estava no código antes de ficar editável. */
export function conteudoPadrao(): ConteudoSite {
  return {
    versao_schema: 2,
    seo: { titulo_aba: 'LicitaForce · Gestão de licitações com agentes de IA', descricao: '' },
    tema: { cor1: '#2563eb', cor2: '#10b981', fundo: '#020617', barra_progresso: true },
    marca: { nome: 'Licita', nome_destaque: 'Force', logo: '/favicon.svg' },
    menu: {
      links: [
        { texto: 'Produto', link: '#produto' }, { texto: 'Agentes de IA', link: '#agentes' }, { texto: 'Segurança', link: '#seguranca' },
        { texto: 'Planos', link: '#planos' }, { texto: 'Dúvidas', link: '#faq' },
      ],
      entrar: 'Entrar', cadastro: { texto: 'Testar grátis', link: '/cadastro' }, painel: 'Ir para o painel',
    },
    secoes: [
      sec('hero', 'hero', {
        selo: 'Agentes de IA para licitações · Lei 14.133', titulo: 'Ganhe mais licitações.', destaque: 'Sem perder nenhum prazo.',
        texto: 'O LicitaForce organiza processos, documentos, prazos e contratos para sua empresa acompanhar cada licitação, do edital ao pagamento.',
        botao: { texto: 'Criar minha conta grátis', link: '/cadastro' }, botao2: { texto: 'Ver como funciona', link: '#produto' },
        marcadores: ['Sem cartão de crédito', 'Cancele quando quiser', 'Dados no Brasil'], estilo: 'mockup',
      }),
      sec('faixa', 'faixa', { marcadores: ['Pregão eletrônico', 'Dispensa eletrônica', 'Fontes oficiais de compras', 'Lei 14.133/2021', 'Atas de registro de preço', 'Contratos e empenhos', 'Certidões e habilitação', 'Agentes de IA'] }),
      sec('cards', 'problema', {
        selo: 'O problema', titulo: 'Licitação não se perde no lance.', destaque: 'Se perde no controle.', destaque_estilo: 'suave', estilo: 'alerta', colunas: 3,
        itens: [
          item('X', 'Editais espalhados em dezenas de portais', 'Você perde oportunidades porque descobre tarde demais.'),
          item('X', 'Prazos controlados na planilha e na memória', 'Uma impugnação ou certidão vencida derruba meses de trabalho.'),
          item('X', 'Pós-pregão no escuro', 'Contratos, empenhos, entregas e pagamentos sem visão consolidada.'),
        ],
      }),
      sec('cards', 'produto', {
        ancora: 'produto', selo: 'A solução', titulo: 'Toda a operação de licitações em um só lugar', colunas: 4, estilo: 'padrao',
        texto: 'Do radar de oportunidades ao pagamento do empenho, com cada etapa conectada à seguinte.',
        itens: [
          item('Radar', 'Radar de oportunidades', 'Encontre publicações oficiais por modalidade, portal de origem, UF, órgão e valor estimado.', 'Em breve', 'amarelo'),
          item('Gavel', 'Funil de processos', 'Kanban da captação à homologação, com itens, preço-limite, responsáveis e linha do tempo.', 'Disponível', 'verde'),
          item('CalendarClock', 'Prazos que não escapam', 'Sessões, esclarecimentos, impugnações, recursos e entregas com alertas automáticos.', 'Disponível', 'verde'),
          item('FileCheck2', 'Certidões sempre válidas', 'Documentos de habilitação organizados, com aviso antes de cada vencimento.', 'Disponível', 'verde'),
          item('FileSignature', 'Contratos e empenhos', 'Atas, contratos, saldos, notas de empenho e entregas em um só lugar.', 'Disponível', 'verde'),
          item('Wallet', 'Faturamento', 'Notas fiscais, recebimentos e quanto cada órgão ainda deve para você.', 'Disponível', 'verde'),
          item('Building2', 'Multiempresa', 'Assessorias gerenciam vários CNPJs com dados isolados e troca em um clique.', 'Disponível', 'verde'),
          item('Users', 'Equipe com permissões', 'Convide sua equipe como administrador, membro ou somente leitura.', 'Disponível', 'verde'),
        ],
      }),
      sec('cards', 'agentes', {
        ancora: 'agentes', selo: 'Agentes de IA', titulo: 'Uma equipe que trabalha', destaque: 'todos os dias por você', estilo: 'colorido', colunas: 3,
        texto: 'Cada agente cuida de uma frente. Você configura uma vez e ele executa sozinho. Os agentes estão sendo liberados em fases para os assinantes.',
        nota: 'Assinantes recebem cada agente assim que ele é liberado, sem custo adicional no plano correspondente.',
        itens: [
          item('Radar', 'Radar', 'Planejado: acompanhamento periódico de publicações e avaliação de aderência ao perfil da empresa.', 'Em breve', 'azul'),
          item('FileSearch', 'Leitor', 'Lê o edital inteiro e devolve o checklist de habilitação, itens, prazos e riscos.', 'Em breve', 'verde'),
          item('ShoppingCart', 'Cotador', 'Pesquisa preços praticados, sugere fornecedores e monta a cotação item a item.', 'Em breve', 'roxo'),
          item('Scale', 'Jurídico', 'Redige minutas de esclarecimento, impugnação e recurso com base na Lei 14.133.', 'Em breve', 'laranja'),
          item('ScanEye', 'Sentinela', 'Vigia seus processos e avisa na hora quando algo muda no portal.', 'Em breve', 'rosa'),
          item('Gauge', 'Termômetro de Pagamento', 'Mostra se o órgão costuma pagar em dia antes de você disputar.', 'Em breve', 'amarelo'),
        ],
      }),
      sec('passos', 'passos', {
        selo: 'Como funciona', titulo: 'Comece a usar em minutos', colunas: 4,
        itens: [
          item('', 'Crie sua conta', 'Em menos de um minuto, sem cartão de crédito.'),
          item('', 'Digite o CNPJ', 'Buscamos os dados da sua empresa automaticamente.'),
          item('', 'Diga o que você vende', 'O Radar passa a procurar pregões e dispensas sob medida para você.'),
          item('', 'Dispute com controle', 'Prazos, documentos e contratos organizados do edital ao pagamento.'),
        ],
      }),
      sec('lateral', 'seguranca', {
        ancora: 'seguranca', selo: 'Segurança', titulo: 'Seus dados protegidos como devem ser', estilo: 'ShieldCheck', colunas: 2,
        texto: 'Propostas, preços e documentos são o coração do seu negócio. Por isso a segurança do LicitaForce começa no próprio banco de dados, não só na tela.',
        itens: [
          item('Database', 'Dados no Brasil', 'Banco de dados hospedado em São Paulo.'),
          item('Lock', 'Isolamento por empresa', 'Cada organização só acessa os próprios dados, com regras aplicadas no próprio banco.'),
          item('KeyRound', 'Criptografia', 'Conexões protegidas por HTTPS e dados criptografados em repouso.'),
          item('History', 'Histórico de alterações', 'Quem mudou o quê e quando, para processos, documentos e contratos.'),
          item('Users', 'Permissões por papel', 'Defina quem pode editar e quem pode apenas consultar.'),
          item('BadgeCheck', 'Seus dados são seus', 'Pensado para a LGPD: você controla, exporta e exclui o que quiser.'),
        ],
      }),
      sec('planos', 'planos', {
        ancora: 'planos', selo: 'Planos', titulo: 'Um plano para cada momento', texto: 'Comece com {dias} dias grátis em qualquer plano. Sem cartão, sem fidelidade.',
        botao: { texto: 'Começar {dias} dias grátis', link: '/cadastro' }, nota: 'Mais escolhido', estilo: 'profissional', destaque: 'Gestão de licitações para sua organização',
        marcadores: ['Busca de oportunidades nos portais de compras', 'Prazos, documentos e contratos', 'Suporte no painel'],
      }),
      sec('faq', 'faq', {
        ancora: 'faq', selo: 'Dúvidas', titulo: 'Perguntas frequentes',
        itens: [
          item('', 'O que é o LicitaForce?', 'Uma plataforma para fornecedores e assessorias controlarem licitações de ponta a ponta: encontrar oportunidades, organizar documentos e prazos, disputar e gerir contratos e pagamentos no pós-pregão.'),
          item('', 'Funciona para pregão eletrônico e dispensa eletrônica?', 'Sim. O LicitaForce é focado nas modalidades eletrônicas da Lei 14.133, especialmente pregão eletrônico e dispensa eletrônica, e também permite cadastrar outras modalidades.'),
          item('', 'Preciso de cartão de crédito para testar?', 'Não. Você tem {dias} dias grátis com acesso completo, sem informar cartão.'),
          item('', 'Meus dados ficam seguros?', 'Sim. O banco fica no Brasil, cada empresa é isolada das demais por regras aplicadas no próprio banco de dados, as conexões são criptografadas e há histórico de alterações.'),
          item('', 'Sou assessoria. Consigo atender várias empresas?', 'Sim. No plano Assessoria você cadastra vários CNPJs, alterna entre eles em um clique e vê tudo consolidado, com permissões por pessoa da sua equipe.'),
          item('', 'O LicitaForce dá lances automáticos?', 'Não. Robôs de lance exigem burlar as proteções dos portais e podem trazer sanções ao fornecedor. Em vez disso, oferecemos um assistente de lances com preço-limite por item, margem e histórico de preços, e você decide.'),
          item('', 'Posso cancelar quando quiser?', 'Sim. Sem fidelidade no plano mensal. Seus dados continuam disponíveis para exportação.'),
        ],
      }),
      sec('cta', 'cta', {
        titulo: 'A próxima oportunidade da sua empresa já foi publicada.', texto: 'Comece hoje e organize cada etapa da sua participação em licitações.',
        botao: { texto: 'Criar minha conta grátis', link: '/cadastro' }, nota: '{dias} dias grátis · sem cartão · cancele quando quiser', estilo: 'Bell',
      }),
    ],
    rodape: {
      links: [{ texto: 'Produto', link: '#produto' }, { texto: 'Planos', link: '#planos' }, { texto: 'Segurança', link: '#seguranca' }, { texto: 'Entrar', link: '/entrar' }],
      contato: '', copyright: 'LicitaForce', instalar_app: true,
    },
  }
}

// ---------- leitura tolerante: qualquer campo faltando ou inválido volta ao padrão ----------
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const txt = (v: unknown, padrao = '') => (typeof v === 'string' ? v.slice(0, LIMITE_TEXTO) : padrao)
const bool = (v: unknown, padrao: boolean) => (typeof v === 'boolean' ? v : padrao)
const lista = <T,>(v: unknown, f: (x: unknown) => T, padrao: T[] = []) => (Array.isArray(v) ? v.slice(0, LIMITE_LISTA).map(f) : padrao)
const cor = (v: unknown, padrao: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : padrao)
const lerLink = (v: unknown, p: LinkSite = { texto: '', link: '' }): LinkSite => { const o = obj(v); return { texto: txt(o.texto, p.texto), link: txt(o.link, p.link) } }
const lerItem = (v: unknown): ItemSite => { const o = obj(v); return { icone: txt(o.icone), titulo: txt(o.titulo), texto: txt(o.texto), selo: txt(o.selo), cor: txt(o.cor) } }
const TIPOS = TIPOS_SECAO.map((t) => t.tipo)

function lerSecao(v: unknown): SecaoSite | null {
  const o = obj(v)
  if (!TIPOS.includes(o.tipo as TipoSecao)) return null
  const b = secaoVazia(o.tipo as TipoSecao)
  return {
    uid: txt(o.uid) || b.uid, tipo: b.tipo, visivel: bool(o.visivel, true), ancora: txt(o.ancora).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40),
    selo: txt(o.selo), titulo: txt(o.titulo), destaque: txt(o.destaque), destaque_estilo: o.destaque_estilo === 'suave' ? 'suave' : 'gradiente',
    texto: txt(o.texto), nota: txt(o.nota), imagem: txt(o.imagem), botao: lerLink(o.botao), botao2: lerLink(o.botao2),
    marcadores: lista(o.marcadores, (x) => txt(x)), itens: lista(o.itens, lerItem), estilo: txt(o.estilo),
    colunas: typeof o.colunas === 'number' && o.colunas >= 1 && o.colunas <= 4 ? Math.round(o.colunas) : 3,
  }
}

/** Converte o formato antigo (7 textos) para a página completa. */
function doFormato1(o: Record<string, unknown>): ConteudoSite {
  const c = conteudoPadrao()
  const hero = c.secoes.find((s) => s.tipo === 'hero')!
  const cta = c.secoes.find((s) => s.tipo === 'cta')!
  if (typeof o.titulo === 'string' && o.titulo.trim()) hero.titulo = o.titulo
  if (typeof o.destaque === 'string') hero.destaque = o.destaque
  if (typeof o.descricao === 'string') hero.texto = o.descricao
  if (typeof o.botao === 'string' && o.botao.trim()) { hero.botao.texto = o.botao; cta.botao.texto = o.botao }
  if (typeof o.titulo_final === 'string') cta.titulo = o.titulo_final
  if (typeof o.descricao_final === 'string') cta.texto = o.descricao_final
  if (typeof o.contato === 'string') c.rodape.contato = o.contato
  return c
}

export function lerConteudo(dados: unknown): ConteudoSite {
  const o = obj(dados)
  if (o.versao_schema !== 2) return doFormato1(o)
  const p = conteudoPadrao()
  const seo = obj(o.seo), tema = obj(o.tema), marca = obj(o.marca), menu = obj(o.menu), rodape = obj(o.rodape)
  return {
    versao_schema: 2,
    seo: { titulo_aba: txt(seo.titulo_aba, p.seo.titulo_aba), descricao: txt(seo.descricao) },
    tema: { cor1: cor(tema.cor1, p.tema.cor1), cor2: cor(tema.cor2, p.tema.cor2), fundo: cor(tema.fundo, p.tema.fundo), barra_progresso: bool(tema.barra_progresso, true) },
    marca: { nome: txt(marca.nome, p.marca.nome), nome_destaque: txt(marca.nome_destaque, p.marca.nome_destaque), logo: txt(marca.logo, p.marca.logo) },
    menu: {
      links: lista(menu.links, (x) => lerLink(x), p.menu.links), entrar: txt(menu.entrar, p.menu.entrar),
      cadastro: lerLink(menu.cadastro, p.menu.cadastro), painel: txt(menu.painel, p.menu.painel),
    },
    secoes: Array.isArray(o.secoes) ? o.secoes.slice(0, LIMITE_LISTA).map(lerSecao).filter((s): s is SecaoSite => !!s) : p.secoes,
    rodape: {
      links: lista(rodape.links, (x) => lerLink(x), p.rodape.links), contato: txt(rodape.contato),
      copyright: txt(rodape.copyright, p.rodape.copyright), instalar_app: bool(rodape.instalar_app, true),
    },
  }
}

// ---------- segurança dos links e imagens ----------
/** Só aceita link interno (/…), âncora (#…), http(s), mailto e tel. Qualquer outra coisa vira "#". */
export function linkSeguro(link: string): string {
  const l = link.trim()
  if (!l) return ''
  if (/^(\/(?!\/)|#)/.test(l)) return l
  if (/^(https?:\/\/|mailto:|tel:)/i.test(l)) return l
  return '#'
}
export function imagemSegura(url: string): string {
  const u = url.trim()
  return /^(https:\/\/|\/(?!\/))/i.test(u) ? u : ''
}

/** Erros que impedem salvar (mensagem legível) ou null. */
export function validarConteudo(c: ConteudoSite): string | null {
  const links: [string, string][] = [
    ...c.menu.links.map((l) => [`Menu · ${l.texto || 'link'}`, l.link] as [string, string]),
    ['Menu · botão de cadastro', c.menu.cadastro.link],
    ...c.rodape.links.map((l) => [`Rodapé · ${l.texto || 'link'}`, l.link] as [string, string]),
  ]
  c.secoes.forEach((s, i) => {
    const nome = `Seção ${i + 1} (${s.titulo || s.tipo})`
    links.push([`${nome} · botão`, s.botao.link], [`${nome} · 2º botão`, s.botao2.link])
    if (s.imagem && !imagemSegura(s.imagem)) links.push([`${nome} · imagem`, 'x:'])
  })
  if (c.marca.logo && !imagemSegura(c.marca.logo)) return 'O logo precisa ser um endereço https:// ou começar com /'
  for (const [onde, l] of links) {
    if (l === 'x:') return `${onde}: a imagem precisa ser um endereço https:// ou começar com /`
    if (l && linkSeguro(l) === '#' && l.trim() !== '#') return `${onde}: link inválido. Use /pagina, #ancora, https://, mailto: ou tel:`
  }
  if (c.rodape.contato && !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(c.rodape.contato)) return 'E-mail de contato inválido'
  if (!c.secoes.some((s) => s.visivel)) return 'Deixe pelo menos uma seção visível'
  const ancoras = c.secoes.map((s) => s.ancora).filter(Boolean)
  const repetida = ancoras.find((a, i) => ancoras.indexOf(a) !== i)
  if (repetida) return `A âncora #${repetida} está em mais de uma seção`
  if (JSON.stringify(c).length > 200_000) return 'Conteúdo grande demais (limite de 200 mil caracteres)'
  return null
}

/** Troca {dias} pelo prazo do teste grátis. */
export const comDias = (t: string, dias: number) => dias === 0
  ? t.replace(/(?:\{dias\}|\d+) dias gr[áa]tis/gi, 'Contrate seu plano').replace(/teste gr[áa]tis/gi, 'assinatura').replace(/sem cart[ãa]o(?: de cr[ée]dito)?\.?/gi, 'Acesso após a confirmação do pagamento.').replace(/\{dias\}/g, '0')
  : t.replace(/\{dias\}/g, String(dias))
