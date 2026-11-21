import { InstalarApp } from '@/components/InstalarApp'
import { useEffect, useState, type ReactNode } from 'react'
import { useCatalogoPlanos } from '@/hooks/useCatalogoPlanos'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { lerConteudo } from '@/lib/conteudoSite'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useScroll, useSpring } from 'framer-motion'
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  Bot,
  Building2,
  CalendarClock,
  Check,
  ChevronDown,
  Database,
  FileCheck2,
  FileSearch,
  FileSignature,
  Gauge,
  Gavel,
  History,
  KeyRound,
  Lock,
  Menu,
  Radar,
  Scale,
  ScanEye,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'
import { cn } from '@/lib/utils'
import { PLANOS } from '@/lib/planos'
import { useDiasTeste } from '@/hooks/useDiasTeste'
import { HeroMockup } from './HeroMockup'

const ease = [0.16, 1, 0.3, 1] as const

function Revelar({ children, atraso = 0, className }: { children: ReactNode; atraso?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.7, delay: atraso, ease }}
    >
      {children}
    </motion.div>
  )
}

function Secao({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={cn('relative scroll-mt-20 px-4 py-20 sm:py-28', className)}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  )
}

function Titulo({ selo, titulo, texto }: { selo: string; titulo: ReactNode; texto?: string }) {
  return (
    <Revelar className="mx-auto mb-14 max-w-3xl text-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-widest text-emerald-300">
        {selo}
      </span>
      <h2 className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-5xl">{titulo}</h2>
      {texto && <p className="mt-5 text-base leading-relaxed text-slate-400 sm:text-lg">{texto}</p>}
    </Revelar>
  )
}

function Selo({ pronto }: { pronto: boolean }) {
  return pronto ? (
    <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">Disponível</span>
  ) : (
    <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">Em breve</span>
  )
}

const DORES = [
  { t: 'Editais espalhados em dezenas de portais', d: 'Você perde oportunidades porque descobre tarde demais.' },
  { t: 'Prazos controlados na planilha e na memória', d: 'Uma impugnação ou certidão vencida derruba meses de trabalho.' },
  { t: 'Pós-pregão no escuro', d: 'Contratos, empenhos, entregas e pagamentos sem visão consolidada.' },
]

const MODULOS: { icone: LucideIcon; titulo: string; texto: string; pronto: boolean }[] = [
  { icone: Radar, titulo: 'Radar de oportunidades', texto: 'Encontre publicações oficiais por modalidade, portal de origem, UF, órgão e valor estimado.', pronto: false },
  { icone: Gavel, titulo: 'Funil de processos', texto: 'Kanban da captação à homologação, com itens, preço-limite, responsáveis e linha do tempo.', pronto: true },
  { icone: CalendarClock, titulo: 'Prazos que não escapam', texto: 'Sessões, esclarecimentos, impugnações, recursos e entregas com alertas automáticos.', pronto: true },
  { icone: FileCheck2, titulo: 'Certidões sempre válidas', texto: 'Documentos de habilitação organizados, com aviso antes de cada vencimento.', pronto: true },
  { icone: FileSignature, titulo: 'Contratos e empenhos', texto: 'Atas, contratos, saldos, notas de empenho e entregas em um só lugar.', pronto: true },
  { icone: Wallet, titulo: 'Faturamento', texto: 'Notas fiscais, recebimentos e quanto cada órgão ainda deve para você.', pronto: true },
  { icone: Building2, titulo: 'Multiempresa', texto: 'Assessorias gerenciam vários CNPJs com dados isolados e troca em um clique.', pronto: true },
  { icone: Users, titulo: 'Equipe com permissões', texto: 'Convide sua equipe como administrador, membro ou somente leitura.', pronto: true },
]

const AGENTES: { icone: LucideIcon; nome: string; texto: string; cor: string }[] = [
  { icone: Radar, nome: 'Radar', texto: 'Planejado: acompanhamento periódico de publicações e avaliação de aderência ao perfil da empresa.', cor: 'from-sky-500 to-blue-600' },
  { icone: FileSearch, nome: 'Leitor', texto: 'Lê o edital inteiro e devolve o checklist de habilitação, itens, prazos e riscos.', cor: 'from-emerald-500 to-teal-600' },
  { icone: ShoppingCart, nome: 'Cotador', texto: 'Pesquisa preços praticados, sugere fornecedores e monta a cotação item a item.', cor: 'from-violet-500 to-purple-600' },
  { icone: Scale, nome: 'Jurídico', texto: 'Redige minutas de esclarecimento, impugnação e recurso com base na Lei 14.133.', cor: 'from-orange-500 to-red-600' },
  { icone: ScanEye, nome: 'Sentinela', texto: 'Vigia seus processos e avisa na hora quando algo muda no portal.', cor: 'from-rose-500 to-pink-600' },
  { icone: Gauge, nome: 'Termômetro de Pagamento', texto: 'Mostra se o órgão costuma pagar em dia antes de você disputar.', cor: 'from-amber-500 to-yellow-600' },
]

const PASSOS = [
  { t: 'Crie sua conta', d: 'Em menos de um minuto, sem cartão de crédito.' },
  { t: 'Digite o CNPJ', d: 'Buscamos os dados da sua empresa na Receita Federal automaticamente.' },
  { t: 'Diga o que você vende', d: 'O Radar passa a procurar pregões e dispensas sob medida para você.' },
  { t: 'Dispute com controle', d: 'Prazos, documentos e contratos organizados do edital ao pagamento.' },
]

const SEGURANCA: { icone: LucideIcon; t: string; d: string }[] = [
  { icone: Database, t: 'Dados no Brasil', d: 'Banco de dados hospedado em São Paulo.' },
  { icone: Lock, t: 'Isolamento por empresa', d: 'Cada organização só acessa os próprios dados, com regras aplicadas no próprio banco.' },
  { icone: KeyRound, t: 'Criptografia', d: 'Conexões protegidas por HTTPS e dados criptografados em repouso.' },
  { icone: History, t: 'Histórico de alterações', d: 'Quem mudou o quê e quando, para processos, documentos e contratos.' },
  { icone: Users, t: 'Permissões por papel', d: 'Defina quem pode editar e quem pode apenas consultar.' },
  { icone: BadgeCheck, t: 'Seus dados são seus', d: 'Pensado para a LGPD: você controla, exporta e exclui o que quiser.' },
]

const FAQ = [
  { p: 'O que é o LicitaFlow?', r: 'Uma plataforma para fornecedores e assessorias controlarem licitações de ponta a ponta: encontrar oportunidades, organizar documentos e prazos, disputar e gerir contratos e pagamentos no pós-pregão.' },
  { p: 'Funciona para pregão eletrônico e dispensa eletrônica?', r: 'Sim. O LicitaFlow é focado nas modalidades eletrônicas da Lei 14.133, especialmente pregão eletrônico e dispensa eletrônica, e também permite cadastrar outras modalidades.' },
  { p: 'Preciso de cartão de crédito para testar?', r: 'Não. Você tem {dias} dias grátis com acesso completo, sem informar cartão.' },
  { p: 'Meus dados ficam seguros?', r: 'Sim. O banco fica no Brasil, cada empresa é isolada das demais por regras aplicadas no próprio banco de dados, as conexões são criptografadas e há histórico de alterações.' },
  { p: 'Sou assessoria. Consigo atender várias empresas?', r: 'Sim. No plano Assessoria você cadastra vários CNPJs, alterna entre eles em um clique e vê tudo consolidado, com permissões por pessoa da sua equipe.' },
  { p: 'O LicitaFlow dá lances automáticos?', r: 'Não. Robôs de lance exigem burlar as proteções dos portais e podem trazer sanções ao fornecedor. Em vez disso, oferecemos um assistente de lances com preço-limite por item, margem e histórico de preços, e você decide.' },
  { p: 'Posso cancelar quando quiser?', r: 'Sim. Sem fidelidade no plano mensal. Seus dados continuam disponíveis para exportação.' },
]

function Navbar() {
  const dias = useDiasTeste()
  const { user } = useAuth()
  const [aberto, setAberto] = useState(false)
  const [rolou, setRolou] = useState(false)
  useEffect(() => {
    const f = () => setRolou(window.scrollY > 12)
    f()
    window.addEventListener('scroll', f, { passive: true })
    return () => window.removeEventListener('scroll', f)
  }, [])
  const links = [
    ['Produto', '#produto'],
    ['Agentes de IA', '#agentes'],
    ['Segurança', '#seguranca'],
    ['Planos', '#planos'],
    ['Dúvidas', '#faq'],
  ]

  return (
    <header className={cn('fixed inset-x-0 top-0 z-50 transition-all duration-300', rolou ? 'border-b border-white/5 bg-slate-950/80 backdrop-blur-xl' : 'bg-transparent')}>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <a href="#topo" className="flex items-center gap-2 text-lg font-semibold text-white">
          <img src="/favicon.svg" alt="" className="h-7 w-7" />
          <span>
            Licita<span className="text-emerald-400">Flow</span>
          </span>
        </a>
        <nav className="hidden flex-1 items-center justify-center gap-7 text-sm text-slate-300 md:flex">
          {links.map(([t, h]) => (
            <a key={h} href={h} className="transition-colors hover:text-white">
              {t}
            </a>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-3 md:flex">
          {user ? (
            <Link to="/app" className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-200">
              Ir para o painel
            </Link>
          ) : (
            <>
              <Link to="/entrar" className="text-sm text-slate-300 hover:text-white">
                Entrar
              </Link>
              <Link to="/cadastro" className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-200">
                Testar grátis
              </Link>
            </>
          )}
        </div>
        <button className="ml-auto text-white md:hidden" onClick={() => setAberto((v) => !v)} aria-label="Menu">
          {aberto ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>
      <AnimatePresence>
        {aberto && (
          <motion.nav
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-t border-white/5 bg-slate-950/95 backdrop-blur-xl md:hidden"
          >
            <div className="flex flex-col gap-1 px-4 py-4">
              {links.map(([t, h]) => (
                <a key={h} href={h} onClick={() => setAberto(false)} className="rounded-lg px-3 py-2.5 text-slate-200 hover:bg-white/5">
                  {t}
                </a>
              ))}
              <Link to={user ? '/app' : '/cadastro'} className="mt-2 rounded-full bg-white px-4 py-3 text-center font-semibold text-slate-950">
                {user ? 'Ir para o painel' : `Testar grátis por ${dias} dias`}
              </Link>
              {!user && (
                <Link to="/entrar" className="px-4 py-2 text-center text-sm text-slate-300">
                  Já tenho conta
                </Link>
              )}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  )
}

function BotaoPrincipal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Link
      to="/cadastro"
      className={cn(
        'group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-blue-600 to-emerald-500 px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:shadow-emerald-500/40',
        className,
      )}
    >
      <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      <span className="relative">{children}</span>
      <ArrowRight className="relative h-4 w-4 transition-transform group-hover:translate-x-1" />
    </Link>
  )
}

function Precos() {
  const dias = useDiasTeste()
  const [anual, setAnual] = useState(true)
  const catalogo = useCatalogoPlanos(true)
  const planos = catalogo.data ? catalogo.data.filter(p=>!['trial','cancelado'].includes(p.id)).map(p=>({
    id:p.id,nome:p.nome,mensal:p.mensal_centavos/100,anual:p.anual_centavos/1200,
    publico:'Gestão de licitações para sua organização',destaque:p.id==='profissional',
    itens:[`${p.limite_empresas ?? 'Ilimitado'} empresa(s)`,`${p.limite_usuarios ?? 'Ilimitado'} usuário(s)`,`${p.limite_processos ?? 'Ilimitado'} processo(s) cadastrado(s)`,'Busca de oportunidades nos portais de compras','Prazos, documentos e contratos','Suporte no painel'],
  })) : PLANOS
  return (
    <Secao id="planos">
      <Titulo selo="Planos" titulo="Um plano para cada momento" texto={`Comece com ${dias} dias grátis em qualquer plano. Sem cartão, sem fidelidade.`} />
      <Revelar className="mb-10 flex justify-center">
        <div className="relative flex rounded-full border border-white/10 bg-white/5 p-1 text-sm">
          {[
            [false, 'Mensal'],
            [true, 'Anual'],
          ].map(([v, t]) => (
            <button key={String(v)} onClick={() => setAnual(v as boolean)} className={cn('relative z-10 rounded-full px-5 py-2 transition-colors', anual === v ? 'text-slate-950' : 'text-slate-300')}>
              {anual === v && <motion.span layoutId="toggle-preco" className="absolute inset-0 -z-10 rounded-full bg-white" transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }} />}
              {t as string}
              {v && <span className={cn('ml-2 text-xs font-semibold', anual ? 'text-emerald-600' : 'text-emerald-300')}>Pagamento anual</span>}
            </button>
          ))}
        </div>
      </Revelar>
      <div className="grid gap-6 lg:grid-cols-3">
        {planos.map((p, i) => (
          <Revelar key={p.id} atraso={i * 0.1}>
            <motion.div
              whileHover={{ y: -6 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className={cn(
                'relative flex h-full flex-col rounded-3xl border p-8',
                p.destaque ? 'border-emerald-400/40 bg-gradient-to-b from-emerald-400/10 to-blue-600/5 shadow-2xl shadow-emerald-500/10' : 'border-white/10 bg-white/[0.03]',
              )}
            >
              {p.destaque && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-600 to-emerald-500 px-3 py-1 text-xs font-semibold text-white">
                  Mais escolhido
                </span>
              )}
              <h3 className="text-xl font-semibold text-white">{p.nome}</h3>
              <p className="mt-1 text-sm text-slate-400">{p.publico}</p>
              <div className="mt-6 flex items-end gap-1">
                <span className="text-sm text-slate-400">R$</span>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={anual ? 'a' : 'm'}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="text-5xl font-semibold tracking-tight text-white tabular-nums"
                  >
                    {(anual ? p.anual : p.mensal).toLocaleString('pt-BR',{maximumFractionDigits:2})}
                  </motion.span>
                </AnimatePresence>
                <span className="mb-1.5 text-sm text-slate-400">/mês</span>
              </div>
              <p className="mt-1 h-5 text-xs text-slate-500">{anual ? `cobrado anualmente: R$ ${(p.anual * 12).toLocaleString('pt-BR')}` : 'cobrado mensalmente'}</p>
              <ul className="mt-8 flex-1 space-y-3">
                {p.itens.map((it) => (
                  <li key={it} className="flex items-start gap-3 text-sm text-slate-300">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> {it}
                  </li>
                ))}
              </ul>
              <Link
                to="/cadastro"
                className={cn(
                  'mt-8 rounded-full px-5 py-3 text-center text-sm font-semibold transition',
                  p.destaque ? 'bg-white text-slate-950 hover:bg-slate-200' : 'border border-white/15 text-white hover:bg-white/5',
                )}
              >
                Começar {dias} dias grátis
              </Link>
            </motion.div>
          </Revelar>
        ))}
      </div>
    </Secao>
  )
}

function Faq() {
  const dias = useDiasTeste()
  const [aberta, setAberta] = useState<number | null>(0)
  return (
    <Secao id="faq">
      <Titulo selo="Dúvidas" titulo="Perguntas frequentes" />
      <div className="mx-auto max-w-3xl divide-y divide-white/10 rounded-3xl border border-white/10 bg-white/[0.02]">
        {FAQ.map((f, i) => (
          <div key={f.p}>
            <button onClick={() => setAberta(aberta === i ? null : i)} className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left" aria-expanded={aberta === i}>
              <span className="font-medium text-white">{f.p}</span>
              <ChevronDown className={cn('h-5 w-5 shrink-0 text-slate-400 transition-transform duration-300', aberta === i && 'rotate-180')} />
            </button>
            <AnimatePresence initial={false}>
              {aberta === i && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease }} className="overflow-hidden">
                  <p className="px-6 pb-5 text-sm leading-relaxed text-slate-400">{f.r.replace('{dias}', String(dias))}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </Secao>
  )
}

export default function Landing() {
  const dias = useDiasTeste()
  const conteudoQ = useQuery({
    queryKey: ['site-publico'], staleTime: 60_000, retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('site_publico')
      if (error) throw error
      return data
    },
  })
  const conteudo = lerConteudo(conteudoQ.data)
  const { scrollYProgress } = useScroll()
  const progresso = useSpring(scrollYProgress, { stiffness: 120, damping: 30 })

  useEffect(() => {
    document.title = 'LicitaFlow · Gestão de licitações com agentes de IA'
    const html = document.documentElement
    const tinhaDark = html.classList.contains('dark')
    html.classList.add('dark')
    html.style.scrollBehavior = 'smooth'
    return () => {
      html.style.scrollBehavior = ''
      if (!tinhaDark) html.classList.remove('dark')
      document.title = 'LicitaFlow'
    }
  }, [])

  return (
    <div id="topo" className="min-h-screen overflow-x-hidden bg-slate-950 text-slate-200 antialiased selection:bg-emerald-400/30">
      <motion.div className="fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-gradient-to-r from-blue-500 to-emerald-400" style={{ scaleX: progresso }} />
      <Navbar />

      {/* Fundo */}
      <div className="pointer-events-none fixed inset-0 -z-0">
        <div className="absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-blue-600/20 blur-[120px]" />
        <div className="absolute right-[-200px] top-[30%] h-[500px] w-[500px] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
      </div>

      <main className="relative">
        {/* HERO */}
        <section className="relative px-4 pb-24 pt-32 sm:pt-40">
          <div className="mx-auto grid max-w-6xl items-center gap-16 lg:grid-cols-2">
            <div>
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }}>
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
                  <Sparkles className="h-3.5 w-3.5" /> Agentes de IA para licitações · Lei 14.133
                </span>
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.1, ease }}
                className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-6xl"
              >
                {conteudo.titulo}{' '}
                <span className="bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-300 bg-clip-text text-transparent">{conteudo.destaque}</span>
              </motion.h1>
              <motion.p initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.2, ease }} className="mt-6 max-w-xl text-lg leading-relaxed text-slate-400">
                {conteudo.descricao}
              </motion.p>
              <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.3, ease }} className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <BotaoPrincipal>{conteudo.botao}</BotaoPrincipal>
                <a href="#produto" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-7 py-3.5 font-medium text-white transition hover:bg-white/5">
                  Ver como funciona
                </a>
              </motion.div>
              <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.5 }} className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-400">
                {['Sem cartão de crédito', 'Cancele quando quiser', 'Dados no Brasil'].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-400" /> {t}
                  </li>
                ))}
              </motion.ul>
            </div>
            <HeroMockup />
          </div>
        </section>

        {/* FAIXA */}
        <div className="relative overflow-hidden border-y border-white/5 bg-white/[0.02] py-5">
          <div className="flex w-max animate-[marquee_40s_linear_infinite] gap-12 whitespace-nowrap text-sm font-medium uppercase tracking-widest text-slate-500">
            {[...Array(2)].flatMap((_, k) =>
              ['Pregão eletrônico', 'Dispensa eletrônica', 'Fontes oficiais de compras', 'Lei 14.133/2021', 'Atas de registro de preço', 'Contratos e empenhos', 'Certidões e habilitação', 'Agentes de IA'].map((t) => (
                <span key={`${k}-${t}`} className="flex items-center gap-12">
                  {t} <span className="h-1 w-1 rounded-full bg-emerald-400/60" />
                </span>
              )),
            )}
          </div>
        </div>

        {/* PROBLEMA */}
        <Secao>
          <Titulo selo="O problema" titulo={<>Licitação não se perde no lance. <span className="text-slate-500">Se perde no controle.</span></>} />
          <div className="grid gap-5 md:grid-cols-3">
            {DORES.map((d, i) => (
              <Revelar key={d.t} atraso={i * 0.1}>
                <div className="h-full rounded-3xl border border-red-400/10 bg-gradient-to-b from-red-500/[0.06] to-transparent p-7">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-300">
                    <X className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">{d.t}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{d.d}</p>
                </div>
              </Revelar>
            ))}
          </div>
        </Secao>

        {/* PRODUTO */}
        <Secao id="produto">
          <Titulo
            selo="A solução"
            titulo="Toda a operação de licitações em um só lugar"
            texto="Do radar de oportunidades ao pagamento do empenho, com cada etapa conectada à seguinte."
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {MODULOS.map((m, i) => (
              <Revelar key={m.titulo} atraso={(i % 4) * 0.08}>
                <motion.div
                  whileHover={{ y: -4 }}
                  className="group h-full rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-white/20 hover:bg-white/[0.05]"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/20 to-emerald-400/20 text-emerald-300 transition-transform group-hover:scale-110">
                      <m.icone className="h-5 w-5" />
                    </div>
                    <Selo pronto={m.pronto} />
                  </div>
                  <h3 className="mt-5 font-semibold text-white">{m.titulo}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{m.texto}</p>
                </motion.div>
              </Revelar>
            ))}
          </div>
        </Secao>

        {/* AGENTES */}
        <Secao id="agentes">
          <Titulo
            selo="Agentes de IA"
            titulo={<>Uma equipe que trabalha <span className="bg-gradient-to-r from-sky-400 to-emerald-300 bg-clip-text text-transparent">todos os dias</span> por você</>}
            texto="Cada agente cuida de uma frente. Você configura uma vez e ele executa sozinho. Os agentes estão sendo liberados em fases para os assinantes."
          />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {AGENTES.map((a, i) => (
              <Revelar key={a.nome} atraso={(i % 3) * 0.1}>
                <motion.div whileHover={{ y: -6, rotate: -0.3 }} className="group relative h-full overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-7">
                  <div className={cn('absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br opacity-20 blur-2xl transition-opacity group-hover:opacity-40', a.cor)} />
                  <div className="flex items-center justify-between">
                    <motion.div
                      className={cn('flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg', a.cor)}
                      animate={{ y: [0, -4, 0] }}
                      transition={{ duration: 3, repeat: Infinity, delay: i * 0.3, ease: 'easeInOut' }}
                    >
                      <a.icone className="h-6 w-6" />
                    </motion.div>
                    <Selo pronto={false} />
                  </div>
                  <h3 className="mt-6 text-lg font-semibold text-white">{a.nome}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{a.texto}</p>
                </motion.div>
              </Revelar>
            ))}
          </div>
          <Revelar className="mt-8 flex items-center justify-center gap-2 text-center text-sm text-slate-500">
            <Bot className="h-4 w-4" /> Assinantes recebem cada agente assim que ele é liberado, sem custo adicional no plano correspondente.
          </Revelar>
        </Secao>

        {/* COMO FUNCIONA */}
        <Secao>
          <Titulo selo="Como funciona" titulo="Comece a usar em minutos" />
          <div className="relative grid gap-8 md:grid-cols-4">
            <div className="absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-transparent via-white/15 to-transparent md:block" />
            {PASSOS.map((p, i) => (
              <Revelar key={p.t} atraso={i * 0.12} className="relative text-center">
                <div className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-emerald-400/30 bg-slate-950 text-lg font-semibold text-emerald-300 shadow-[0_0_30px_rgba(52,211,153,0.25)]">
                  {i + 1}
                </div>
                <h3 className="mt-5 font-semibold text-white">{p.t}</h3>
                <p className="mt-2 text-sm text-slate-400">{p.d}</p>
              </Revelar>
            ))}
          </div>
        </Secao>

        {/* SEGURANÇA */}
        <Secao id="seguranca">
          <div className="grid items-center gap-14 lg:grid-cols-2">
            <Revelar>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-widest text-emerald-300">Segurança</span>
              <h2 className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-5xl">Seus dados protegidos como devem ser</h2>
              <p className="mt-5 text-lg leading-relaxed text-slate-400">
                Propostas, preços e documentos são o coração do seu negócio. Por isso a segurança do LicitaFlow começa no próprio banco de dados, não só na tela.
              </p>
              <div className="relative mt-10 hidden h-48 items-center justify-center sm:flex">
                <motion.div className="absolute h-48 w-48 rounded-full border border-emerald-400/20" animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0, 0.6] }} transition={{ duration: 3, repeat: Infinity }} />
                <motion.div className="absolute h-32 w-32 rounded-full border border-emerald-400/30" animate={{ scale: [1, 1.2, 1], opacity: [0.8, 0.1, 0.8] }} transition={{ duration: 3, repeat: Infinity, delay: 0.5 }} />
                <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-400 to-blue-600 shadow-2xl shadow-emerald-500/30">
                  <ShieldCheck className="h-10 w-10 text-white" />
                </div>
              </div>
            </Revelar>
            <div className="grid gap-4 sm:grid-cols-2">
              {SEGURANCA.map((s, i) => (
                <Revelar key={s.t} atraso={i * 0.07}>
                  <div className="h-full rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <s.icone className="h-5 w-5 text-emerald-300" />
                    <h3 className="mt-3 font-semibold text-white">{s.t}</h3>
                    <p className="mt-1 text-sm text-slate-400">{s.d}</p>
                  </div>
                </Revelar>
              ))}
            </div>
          </div>
        </Secao>

        <Precos />
        <Faq />

        {/* CTA FINAL */}
        <Secao>
          <Revelar>
            <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-blue-600/30 via-slate-900 to-emerald-500/20 px-6 py-16 text-center sm:px-16 sm:py-20">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(52,211,153,0.25),transparent_60%)]" />
              <div className="relative">
                <Bell className="mx-auto h-10 w-10 text-emerald-300" />
                <h2 className="mx-auto mt-6 max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-5xl">{conteudo.titulo_final}</h2>
                <p className="mx-auto mt-5 max-w-xl text-lg text-slate-300">{conteudo.descricao_final}</p>
                <div className="mt-10 flex justify-center">
                  <BotaoPrincipal className="px-9 py-4">{conteudo.botao}</BotaoPrincipal>
                </div>
                <p className="mt-4 text-sm text-slate-400">{dias} dias grátis · sem cartão · cancele quando quiser</p>
              </div>
            </div>
          </Revelar>
        </Secao>
      </main>

      <div className="relative mx-auto max-w-6xl px-4 pb-8"><InstalarApp compacto /></div>
      <footer className="relative border-t border-white/5 px-4 py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 text-sm text-slate-500 sm:flex-row">
          <div className="flex items-center gap-2 font-semibold text-slate-300">
            <img src="/favicon.svg" alt="" className="h-6 w-6" /> LicitaFlow
          </div>
          <nav className="flex flex-wrap justify-center gap-6">
            <a href="#produto" className="hover:text-slate-300">Produto</a>
            <a href="#planos" className="hover:text-slate-300">Planos</a>
            <a href="#seguranca" className="hover:text-slate-300">Segurança</a>
            <Link to="/entrar" className="hover:text-slate-300">Entrar</Link>
            {conteudo.contato && <a href={`mailto:${conteudo.contato}`} className="hover:text-slate-300">Contato</a>}
          </nav>
          <p>© {new Date().getFullYear()} LicitaFlow</p>
        </div>
      </footer>
    </div>
  )
}
