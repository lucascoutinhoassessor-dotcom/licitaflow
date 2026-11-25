import { InstalarApp } from '@/components/InstalarApp'
import { useEffect, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { useCatalogoPlanos } from '@/hooks/useCatalogoPlanos'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { comDias, imagemSegura, lerConteudo, linkSeguro, type ConteudoSite, type SecaoSite } from '@/lib/conteudoSite'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useScroll, useSpring } from 'framer-motion'
import { ArrowRight, Check, ChevronDown, Menu, X } from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'
import { cn } from '@/lib/utils'
import { PLANOS } from '@/lib/planos'
import { useDiasTeste } from '@/hooks/useDiasTeste'
import { HeroMockup } from './HeroMockup'
import { icone } from './icones'

const ease = [0.16, 1, 0.3, 1] as const

// Cores do tema vêm de --lp-c1 / --lp-c2 (definidas no contêiner da página).
const GRAD_BOTAO: CSSProperties = { backgroundImage: 'linear-gradient(90deg, var(--lp-c1), var(--lp-c2))' }
const GRAD_TEXTO: CSSProperties = { backgroundImage: 'linear-gradient(90deg, color-mix(in srgb, var(--lp-c1) 55%, white), color-mix(in srgb, var(--lp-c2) 65%, white))' }
const ACENTO: CSSProperties = { color: 'color-mix(in srgb, var(--lp-c2) 65%, white)' }
const CORES_ITEM: Record<string, string> = {
  azul: 'from-sky-500 to-blue-600', verde: 'from-emerald-500 to-teal-600', roxo: 'from-violet-500 to-purple-600', laranja: 'from-orange-500 to-red-600',
  rosa: 'from-rose-500 to-pink-600', amarelo: 'from-amber-500 to-yellow-600', ciano: 'from-cyan-400 to-sky-600', vermelho: 'from-red-500 to-rose-700', cinza: 'from-slate-500 to-slate-700',
}
const CORES_SELO: Record<string, string> = {
  verde: 'bg-emerald-400/10 text-emerald-300', amarelo: 'bg-amber-400/10 text-amber-300', azul: 'bg-sky-400/10 text-sky-300',
  vermelho: 'bg-red-400/10 text-red-300', cinza: 'bg-white/10 text-slate-300',
}
const COLUNAS: Record<number, string> = { 1: '', 2: 'md:grid-cols-2', 3: 'md:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }
const COLUNAS_PASSOS: Record<number, string> = { 1: '', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' }

function Revelar({ children, atraso = 0, className }: { children: ReactNode; atraso?: number; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.7, delay: atraso, ease }}>
      {children}
    </motion.div>
  )
}

/** Link editável: /rota vira navegação interna; #, https, mailto e tel viram <a>. Na prévia do master nada navega. */
function Destino({ link, className, children, previa, onClick }: { link: string; className?: string; children: ReactNode; previa?: boolean; onClick?: () => void }) {
  const l = linkSeguro(link) || '#'
  const bloquear = (e: MouseEvent) => { if (previa) e.preventDefault(); onClick?.() }
  if (l.startsWith('/') && !previa) return <Link to={l} className={className} onClick={onClick}>{children}</Link>
  const externo = /^https?:\/\//i.test(l)
  return <a href={l} className={className} onClick={bloquear} {...(externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{children}</a>
}

function Secao({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id || undefined} className={cn('relative scroll-mt-20 px-4 py-20 sm:py-28', className)}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  )
}

function SeloSecao({ texto }: { texto: string }) {
  if (!texto) return null
  return <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-widest" style={ACENTO}>{texto}</span>
}

function TituloComDestaque({ s, dias }: { s: SecaoSite; dias: number }) {
  return (
    <>
      {comDias(s.titulo, dias)}
      {s.destaque && (
        <>
          {' '}
          {s.destaque_estilo === 'suave' ? <span className="text-slate-500">{comDias(s.destaque, dias)}</span> : <span className="bg-clip-text text-transparent" style={GRAD_TEXTO}>{comDias(s.destaque, dias)}</span>}
        </>
      )}
    </>
  )
}

function Titulo({ s, dias, centro = true }: { s: SecaoSite; dias: number; centro?: boolean }) {
  if (!s.selo && !s.titulo && !s.destaque && !s.texto) return null
  return (
    <Revelar className={cn('mb-14 max-w-3xl', centro && 'mx-auto text-center')}>
      <SeloSecao texto={comDias(s.selo, dias)} />
      {(s.titulo || s.destaque) && <h2 className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-5xl"><TituloComDestaque s={s} dias={dias} /></h2>}
      {s.texto && <p className="mt-5 whitespace-pre-line text-base leading-relaxed text-slate-400 sm:text-lg">{comDias(s.texto, dias)}</p>}
    </Revelar>
  )
}

function SeloItem({ texto, cor }: { texto: string; cor: string }) {
  if (!texto) return null
  return <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', CORES_SELO[cor] ?? CORES_SELO.cinza)}>{texto}</span>
}

function BotaoPrincipal({ link, children, className, previa }: { link: string; children: ReactNode; className?: string; previa?: boolean }) {
  return (
    <Destino
      link={link || '/cadastro'}
      previa={previa}
      className={cn('group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-black/30 transition hover:brightness-110', className)}
    >
      <span className="absolute inset-0 rounded-full" style={GRAD_BOTAO} />
      <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      <span className="relative">{children}</span>
      <ArrowRight className="relative h-4 w-4 transition-transform group-hover:translate-x-1" />
    </Destino>
  )
}

function Logo({ c, className }: { c: ConteudoSite; className?: string }) {
  const logo = imagemSegura(c.marca.logo)
  return (
    <>
      {logo && <img src={logo} alt="" className={className} />}
      <span>
        {c.marca.nome}
        {c.marca.nome_destaque && <span style={ACENTO}>{c.marca.nome_destaque}</span>}
      </span>
    </>
  )
}

function Navbar({ c, previa }: { c: ConteudoSite; previa?: boolean }) {
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
  const logado = !!user && !previa
  const cadastro = comDias(c.menu.cadastro.texto, dias)

  return (
    <header className={cn('fixed inset-x-0 top-0 z-50 transition-all duration-300', rolou || previa ? 'border-b border-white/5 bg-slate-950/80 backdrop-blur-xl' : 'bg-transparent')}>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <a href="#topo" onClick={(e) => previa && e.preventDefault()} className="flex items-center gap-2 text-lg font-semibold text-white">
          <Logo c={c} className="h-7 w-7" />
        </a>
        <nav className="hidden flex-1 items-center justify-center gap-7 text-sm text-slate-300 md:flex">
          {c.menu.links.map((l, i) => (
            <Destino key={i} link={l.link} previa={previa} className="transition-colors hover:text-white">{comDias(l.texto, dias)}</Destino>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-3 md:flex">
          {logado ? (
            <Link to="/app" className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-200">{c.menu.painel}</Link>
          ) : (
            <>
              {c.menu.entrar && <Destino link="/entrar" previa={previa} className="text-sm text-slate-300 hover:text-white">{c.menu.entrar}</Destino>}
              {cadastro && <Destino link={c.menu.cadastro.link || '/cadastro'} previa={previa} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-200">{cadastro}</Destino>}
            </>
          )}
        </div>
        <button className="ml-auto text-white md:hidden" onClick={() => setAberto((v) => !v)} aria-label="Menu">
          {aberto ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>
      <AnimatePresence>
        {aberto && (
          <motion.nav initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden border-t border-white/5 bg-slate-950/95 backdrop-blur-xl md:hidden">
            <div className="flex flex-col gap-1 px-4 py-4">
              {c.menu.links.map((l, i) => (
                <Destino key={i} link={l.link} previa={previa} onClick={() => setAberto(false)} className="rounded-lg px-3 py-2.5 text-slate-200 hover:bg-white/5">{comDias(l.texto, dias)}</Destino>
              ))}
              {logado ? (
                <Link to="/app" className="mt-2 rounded-full bg-white px-4 py-3 text-center font-semibold text-slate-950">{c.menu.painel}</Link>
              ) : (
                <>
                  {cadastro && <Destino link={c.menu.cadastro.link || '/cadastro'} previa={previa} className="mt-2 rounded-full bg-white px-4 py-3 text-center font-semibold text-slate-950">{cadastro}</Destino>}
                  {c.menu.entrar && <Destino link="/entrar" previa={previa} className="px-4 py-2 text-center text-sm text-slate-300">{c.menu.entrar}</Destino>}
                </>
              )}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  )
}

const IconeSeloHero = icone('Sparkles')
const SeloHeroIcone = () => <IconeSeloHero className="h-3.5 w-3.5" />

function Hero({ s, dias, previa }: { s: SecaoSite; dias: number; previa?: boolean }) {
  const imagem = imagemSegura(s.imagem)
  const lado = s.estilo === 'imagem' ? (imagem ? <img src={imagem} alt="" className="w-full rounded-3xl border border-white/10 shadow-2xl" /> : null) : s.estilo === 'nenhum' ? null : <HeroMockup />
  return (
    <section id={s.ancora || undefined} className="relative px-4 pb-24 pt-32 sm:pt-40">
      <div className={cn('mx-auto grid max-w-6xl items-center gap-16', lado ? 'lg:grid-cols-2' : 'max-w-4xl text-center')}>
        <div>
          {s.selo && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }}>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium" style={ACENTO}>
<SeloHeroIcone /> {comDias(s.selo, dias)}
              </span>
            </motion.div>
          )}
          <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.1, ease }} className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-6xl">
            <TituloComDestaque s={s} dias={dias} />
          </motion.h1>
          {s.texto && (
            <motion.p initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.2, ease }} className={cn('mt-6 whitespace-pre-line text-lg leading-relaxed text-slate-400', lado ? 'max-w-xl' : 'mx-auto max-w-2xl')}>
              {comDias(s.texto, dias)}
            </motion.p>
          )}
          {(s.botao.texto || s.botao2.texto) && (
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.3, ease }} className={cn('mt-9 flex flex-col gap-3 sm:flex-row sm:items-center', !lado && 'sm:justify-center')}>
              {s.botao.texto && <BotaoPrincipal link={s.botao.link} previa={previa}>{comDias(s.botao.texto, dias)}</BotaoPrincipal>}
              {s.botao2.texto && (
                <Destino link={s.botao2.link} previa={previa} className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-7 py-3.5 font-medium text-white transition hover:bg-white/5">
                  {comDias(s.botao2.texto, dias)}
                </Destino>
              )}
            </motion.div>
          )}
          {s.marcadores.length > 0 && (
            <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.5 }} className={cn('mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-400', !lado && 'justify-center')}>
              {s.marcadores.map((t, i) => (
                <li key={i} className="flex items-center gap-2"><Check className="h-4 w-4" style={ACENTO} /> {comDias(t, dias)}</li>
              ))}
            </motion.ul>
          )}
        </div>
        {lado}
      </div>
    </section>
  )
}

function Faixa({ s, dias }: { s: SecaoSite; dias: number }) {
  if (!s.marcadores.length) return null
  return (
    <div id={s.ancora || undefined} className="relative overflow-hidden border-y border-white/5 bg-white/[0.02] py-5">
      <div className="flex w-max animate-[marquee_40s_linear_infinite] gap-12 whitespace-nowrap text-sm font-medium uppercase tracking-widest text-slate-500">
        {[0, 1].flatMap((k) =>
          s.marcadores.map((t, i) => (
            <span key={`${k}-${i}`} className="flex items-center gap-12">
              {comDias(t, dias)} <span className="h-1 w-1 rounded-full" style={{ background: 'var(--lp-c2)' }} />
            </span>
          )),
        )}
      </div>
    </div>
  )
}

function Cartoes({ s, dias }: { s: SecaoSite; dias: number }) {
  return (
    <Secao id={s.ancora}>
      <Titulo s={s} dias={dias} />
      <div className={cn('grid gap-5', COLUNAS[s.colunas] ?? COLUNAS[3])}>
        {s.itens.map((it, i) => {
          const I = icone(it.icone)
          const atraso = (i % Math.max(1, s.colunas)) * 0.08
          if (s.estilo === 'alerta')
            return (
              <Revelar key={i} atraso={atraso}>
                <div className="h-full rounded-3xl border border-red-400/10 bg-gradient-to-b from-red-500/[0.06] to-transparent p-7">
                  <div className="mb-4 flex items-center justify-between">
                    {it.icone && <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-300"><I className="h-5 w-5" /></div>}
                    <SeloItem texto={comDias(it.selo, dias)} cor={it.cor} />
                  </div>
                  <h3 className="text-lg font-semibold text-white">{comDias(it.titulo, dias)}</h3>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-400">{comDias(it.texto, dias)}</p>
                </div>
              </Revelar>
            )
          if (s.estilo === 'colorido') {
            const gradiente = CORES_ITEM[it.cor] ?? CORES_ITEM.azul
            return (
              <Revelar key={i} atraso={atraso}>
                <motion.div whileHover={{ y: -6, rotate: -0.3 }} className="group relative h-full overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-7">
                  <div className={cn('absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br opacity-20 blur-2xl transition-opacity group-hover:opacity-40', gradiente)} />
                  <div className="flex items-center justify-between">
                    <motion.div className={cn('flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg', gradiente)} animate={{ y: [0, -4, 0] }} transition={{ duration: 3, repeat: Infinity, delay: i * 0.3, ease: 'easeInOut' }}>
                      <I className="h-6 w-6" />
                    </motion.div>
                    <SeloItem texto={comDias(it.selo, dias)} cor={it.selo.toLowerCase().includes('dispon') ? 'verde' : 'amarelo'} />
                  </div>
                  <h3 className="mt-6 text-lg font-semibold text-white">{comDias(it.titulo, dias)}</h3>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-400">{comDias(it.texto, dias)}</p>
                </motion.div>
              </Revelar>
            )
          }
          return (
            <Revelar key={i} atraso={atraso}>
              <motion.div whileHover={{ y: -4 }} className="group h-full rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-white/20 hover:bg-white/[0.05]">
                <div className="flex items-center justify-between">
                  {it.icone ? (
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl transition-transform group-hover:scale-110" style={{ ...ACENTO, backgroundImage: 'linear-gradient(135deg, color-mix(in srgb, var(--lp-c1) 22%, transparent), color-mix(in srgb, var(--lp-c2) 22%, transparent))' }}>
                      <I className="h-5 w-5" />
                    </div>
                  ) : <span />}
                  <SeloItem texto={comDias(it.selo, dias)} cor={it.cor} />
                </div>
                <h3 className="mt-5 font-semibold text-white">{comDias(it.titulo, dias)}</h3>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-400">{comDias(it.texto, dias)}</p>
              </motion.div>
            </Revelar>
          )
        })}
      </div>
      {s.nota && (
        <Revelar className="mt-8 flex items-center justify-center gap-2 text-center text-sm text-slate-500">{comDias(s.nota, dias)}</Revelar>
      )}
    </Secao>
  )
}

function Passos({ s, dias }: { s: SecaoSite; dias: number }) {
  return (
    <Secao id={s.ancora}>
      <Titulo s={s} dias={dias} />
      <div className={cn('relative grid gap-8', COLUNAS_PASSOS[s.colunas] ?? COLUNAS_PASSOS[4])}>
        {s.colunas > 1 && <div className="absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-transparent via-white/15 to-transparent md:block" />}
        {s.itens.map((p, i) => (
          <Revelar key={i} atraso={i * 0.12} className="relative text-center">
            <div className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-slate-950 text-lg font-semibold shadow-[0_0_30px_rgba(255,255,255,0.08)]" style={ACENTO}>
              {i + 1}
            </div>
            <h3 className="mt-5 font-semibold text-white">{comDias(p.titulo, dias)}</h3>
            <p className="mt-2 whitespace-pre-line text-sm text-slate-400">{comDias(p.texto, dias)}</p>
          </Revelar>
        ))}
      </div>
    </Secao>
  )
}

function Lateral({ s, dias }: { s: SecaoSite; dias: number }) {
  const imagem = imagemSegura(s.imagem)
  const I = icone(s.estilo, icone('ShieldCheck'))
  return (
    <Secao id={s.ancora}>
      <div className="grid items-center gap-14 lg:grid-cols-2">
        <Revelar>
          <SeloSecao texto={comDias(s.selo, dias)} />
          {(s.titulo || s.destaque) && <h2 className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-5xl"><TituloComDestaque s={s} dias={dias} /></h2>}
          {s.texto && <p className="mt-5 whitespace-pre-line text-lg leading-relaxed text-slate-400">{comDias(s.texto, dias)}</p>}
          {imagem ? (
            <img src={imagem} alt="" className="mt-10 w-full rounded-3xl border border-white/10" />
          ) : s.estilo !== 'nenhum' && (
            <div className="relative mt-10 hidden h-48 items-center justify-center sm:flex">
              <motion.div className="absolute h-48 w-48 rounded-full border border-white/15" animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0, 0.6] }} transition={{ duration: 3, repeat: Infinity }} />
              <motion.div className="absolute h-32 w-32 rounded-full border border-white/20" animate={{ scale: [1, 1.2, 1], opacity: [0.8, 0.1, 0.8] }} transition={{ duration: 3, repeat: Infinity, delay: 0.5 }} />
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl shadow-2xl" style={{ backgroundImage: 'linear-gradient(135deg, var(--lp-c2), var(--lp-c1))' }}>
                <I className="h-10 w-10 text-white" />
              </div>
            </div>
          )}
        </Revelar>
        <div className={cn('grid gap-4', s.colunas >= 2 && 'sm:grid-cols-2')}>
          {s.itens.map((it, i) => {
            const Ic = icone(it.icone)
            return (
              <Revelar key={i} atraso={i * 0.07}>
                <div className="h-full rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  {it.icone && <Ic className="h-5 w-5" style={ACENTO} />}
                  <h3 className="mt-3 font-semibold text-white">{comDias(it.titulo, dias)}</h3>
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-400">{comDias(it.texto, dias)}</p>
                </div>
              </Revelar>
            )
          })}
        </div>
      </div>
    </Secao>
  )
}

function Precos({ s, dias, previa }: { s: SecaoSite; dias: number; previa?: boolean }) {
  const [anual, setAnual] = useState(true)
  const catalogo = useCatalogoPlanos(true)
  const destaqueId = s.estilo || 'profissional'
  const planos = catalogo.data
    ? catalogo.data.filter((p) => !['trial', 'cancelado'].includes(p.id)).map((p) => ({
        id: p.id, nome: p.nome, mensal: p.mensal_centavos / 100, anual: p.anual_centavos / 1200, publico: comDias(s.destaque, dias), destaque: p.id === destaqueId,
        itens: [`${p.limite_empresas ?? 'Ilimitado'} empresa(s)`, `${p.limite_usuarios ?? 'Ilimitado'} usuário(s)`, `${p.limite_processos ?? 'Ilimitado'} processo(s) cadastrado(s)`, ...s.marcadores.map((m) => comDias(m, dias))],
      }))
    : PLANOS.map((p) => ({ ...p, destaque: p.id === destaqueId }))
  return (
    <Secao id={s.ancora}>
      <Titulo s={s} dias={dias} />
      <Revelar className="mb-10 flex justify-center">
        <div className="relative flex rounded-full border border-white/10 bg-white/5 p-1 text-sm">
          {([[false, 'Mensal'], [true, 'Anual']] as const).map(([v, t]) => (
            <button key={String(v)} onClick={() => setAnual(v)} className={cn('relative z-10 rounded-full px-5 py-2 transition-colors', anual === v ? 'text-slate-950' : 'text-slate-300')}>
              {anual === v && <motion.span layoutId="toggle-preco" className="absolute inset-0 -z-10 rounded-full bg-white" transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }} />}
              {t}
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
              className={cn('relative flex h-full flex-col rounded-3xl border p-8', p.destaque ? 'border-white/25 shadow-2xl shadow-black/30' : 'border-white/10 bg-white/[0.03]')}
              style={p.destaque ? { backgroundImage: 'linear-gradient(180deg, color-mix(in srgb, var(--lp-c2) 12%, transparent), color-mix(in srgb, var(--lp-c1) 6%, transparent))' } : undefined}
            >
              {p.destaque && s.nota && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold text-white" style={GRAD_BOTAO}>{comDias(s.nota, dias)}</span>
              )}
              <h3 className="text-xl font-semibold text-white">{p.nome}</h3>
              {p.publico && <p className="mt-1 text-sm text-slate-400">{p.publico}</p>}
              <div className="mt-6 flex items-end gap-1">
                <span className="text-sm text-slate-400">R$</span>
                <AnimatePresence mode="wait">
                  <motion.span key={anual ? 'a' : 'm'} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="text-5xl font-semibold tracking-tight text-white tabular-nums">
                    {(anual ? p.anual : p.mensal).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                  </motion.span>
                </AnimatePresence>
                <span className="mb-1.5 text-sm text-slate-400">/mês</span>
              </div>
              <p className="mt-1 h-5 text-xs text-slate-500">{anual ? `cobrado anualmente: R$ ${(p.anual * 12).toLocaleString('pt-BR')}` : 'cobrado mensalmente'}</p>
              <ul className="mt-8 flex-1 space-y-3">
                {p.itens.map((it, k) => (
                  <li key={k} className="flex items-start gap-3 text-sm text-slate-300"><Check className="mt-0.5 h-4 w-4 shrink-0" style={ACENTO} /> {it}</li>
                ))}
              </ul>
              {s.botao.texto && (
                <Destino link={dias === 0 ? `/checkout?plano=${encodeURIComponent(p.id)}` : s.botao.link || '/cadastro'} previa={previa} className={cn('mt-8 rounded-full px-5 py-3 text-center text-sm font-semibold transition', p.destaque ? 'bg-white text-slate-950 hover:bg-slate-200' : 'border border-white/15 text-white hover:bg-white/5')}>
                  {comDias(s.botao.texto, dias)}
                </Destino>
              )}
            </motion.div>
          </Revelar>
        ))}
      </div>
    </Secao>
  )
}

function Faq({ s, dias }: { s: SecaoSite; dias: number }) {
  const [aberta, setAberta] = useState<number | null>(0)
  return (
    <Secao id={s.ancora}>
      <Titulo s={s} dias={dias} />
      <div className="mx-auto max-w-3xl divide-y divide-white/10 rounded-3xl border border-white/10 bg-white/[0.02]">
        {s.itens.map((f, i) => (
          <div key={i}>
            <button onClick={() => setAberta(aberta === i ? null : i)} className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left" aria-expanded={aberta === i}>
              <span className="font-medium text-white">{comDias(f.titulo, dias)}</span>
              <ChevronDown className={cn('h-5 w-5 shrink-0 text-slate-400 transition-transform duration-300', aberta === i && 'rotate-180')} />
            </button>
            <AnimatePresence initial={false}>
              {aberta === i && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease }} className="overflow-hidden">
                  <p className="whitespace-pre-line px-6 pb-5 text-sm leading-relaxed text-slate-400">{comDias(f.texto, dias)}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </Secao>
  )
}

function Chamada({ s, dias, previa }: { s: SecaoSite; dias: number; previa?: boolean }) {
  const I = s.estilo && s.estilo !== 'nenhum' ? icone(s.estilo, icone('Bell')) : null
  return (
    <Secao id={s.ancora}>
      <Revelar>
        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 px-6 py-16 text-center sm:px-16 sm:py-20" style={{ backgroundImage: 'linear-gradient(135deg, color-mix(in srgb, var(--lp-c1) 30%, #0f172a), #0f172a 50%, color-mix(in srgb, var(--lp-c2) 20%, #0f172a))' }}>
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--lp-c2) 25%, transparent), transparent 60%)' }} />
          <div className="relative">
            {I && <I className="mx-auto h-10 w-10" style={ACENTO} />}
            {(s.titulo || s.destaque) && <h2 className="mx-auto mt-6 max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-5xl"><TituloComDestaque s={s} dias={dias} /></h2>}
            {s.texto && <p className="mx-auto mt-5 max-w-xl whitespace-pre-line text-lg text-slate-300">{comDias(s.texto, dias)}</p>}
            {s.botao.texto && (
              <div className="mt-10 flex justify-center">
                <BotaoPrincipal link={s.botao.link} previa={previa} className="px-9 py-4">{comDias(s.botao.texto, dias)}</BotaoPrincipal>
              </div>
            )}
            {s.nota && <p className="mt-4 text-sm text-slate-400">{comDias(s.nota, dias)}</p>}
          </div>
        </div>
      </Revelar>
    </Secao>
  )
}

function Livre({ s, dias, previa }: { s: SecaoSite; dias: number; previa?: boolean }) {
  const imagem = imagemSegura(s.imagem)
  const abaixo = !imagem || s.estilo === 'abaixo'
  const texto = (
    <Revelar className={cn(abaixo && 'mx-auto max-w-3xl text-center')}>
      <SeloSecao texto={comDias(s.selo, dias)} />
      {(s.titulo || s.destaque) && <h2 className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-5xl"><TituloComDestaque s={s} dias={dias} /></h2>}
      {s.texto && <p className="mt-5 whitespace-pre-line text-lg leading-relaxed text-slate-400">{comDias(s.texto, dias)}</p>}
      {(s.botao.texto || s.botao2.texto) && (
        <div className={cn('mt-8 flex flex-col gap-3 sm:flex-row', abaixo && 'sm:justify-center')}>
          {s.botao.texto && <BotaoPrincipal link={s.botao.link} previa={previa}>{comDias(s.botao.texto, dias)}</BotaoPrincipal>}
          {s.botao2.texto && <Destino link={s.botao2.link} previa={previa} className="inline-flex items-center justify-center rounded-full border border-white/15 px-7 py-3.5 font-medium text-white transition hover:bg-white/5">{comDias(s.botao2.texto, dias)}</Destino>}
        </div>
      )}
      {s.marcadores.length > 0 && (
        <ul className={cn('mt-8 space-y-2 text-slate-300', abaixo && 'mx-auto inline-block text-left')}>
          {s.marcadores.map((m, i) => <li key={i} className="flex items-start gap-3"><Check className="mt-1 h-4 w-4 shrink-0" style={ACENTO} /> {comDias(m, dias)}</li>)}
        </ul>
      )}
    </Revelar>
  )
  const img = imagem && <Revelar atraso={0.1}><img src={imagem} alt="" className={cn('w-full rounded-3xl border border-white/10', abaixo && 'mx-auto mt-12 max-w-4xl')} /></Revelar>
  return (
    <Secao id={s.ancora}>
      {abaixo ? <>{texto}{img}</> : (
        <div className="grid items-center gap-14 lg:grid-cols-2">
          {s.estilo === 'esquerda' ? <>{img}{texto}</> : <>{texto}{img}</>}
        </div>
      )}
    </Secao>
  )
}

function RenderSecao({ s, dias, previa }: { s: SecaoSite; dias: number; previa?: boolean }) {
  switch (s.tipo) {
    case 'hero': return <Hero s={s} dias={dias} previa={previa} />
    case 'faixa': return <Faixa s={s} dias={dias} />
    case 'cards': return <Cartoes s={s} dias={dias} />
    case 'passos': return <Passos s={s} dias={dias} />
    case 'lateral': return <Lateral s={s} dias={dias} />
    case 'planos': return <Precos s={s} dias={dias} previa={previa} />
    case 'faq': return <Faq s={s} dias={dias} />
    case 'cta': return <Chamada s={s} dias={dias} previa={previa} />
    case 'livre': return <Livre s={s} dias={dias} previa={previa} />
  }
}

/** A landing desenhada a partir do conteúdo. `previa` = dentro do editor do master (não navega nem mexe no documento). */
export function PaginaLanding({ conteudo: c, previa, secaoAtiva }: { conteudo: ConteudoSite; previa?: boolean; secaoAtiva?: string }) {
  const dias = useDiasTeste()
  const { scrollYProgress } = useScroll()
  const progresso = useSpring(scrollYProgress, { stiffness: 120, damping: 30 })
  const vars = { '--lp-c1': c.tema.cor1, '--lp-c2': c.tema.cor2, backgroundColor: c.tema.fundo } as CSSProperties

  return (
    <div id={previa ? undefined : 'topo'} className={cn('relative overflow-x-hidden text-slate-200 antialiased selection:bg-white/20', !previa && 'min-h-screen')} style={vars}>
      {c.tema.barra_progresso && !previa && <motion.div className="fixed inset-x-0 top-0 z-[60] h-0.5 origin-left" style={{ ...GRAD_BOTAO, scaleX: progresso }} />}
      <Navbar c={c} previa={previa} />

      <div className={cn('pointer-events-none inset-0 -z-0', previa ? 'absolute' : 'fixed')}>
        <div className="absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full blur-[120px]" style={{ background: 'color-mix(in srgb, var(--lp-c1) 20%, transparent)' }} />
        <div className="absolute right-[-200px] top-[30%] h-[500px] w-[500px] rounded-full blur-[120px]" style={{ background: 'color-mix(in srgb, var(--lp-c2) 10%, transparent)' }} />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
      </div>

      <main className="relative">
        {c.secoes.filter((s) => s.visivel).map((s) => (
          <div key={s.uid} data-secao={s.uid} className={cn(previa && secaoAtiva === s.uid && 'outline outline-2 outline-offset-[-2px] outline-amber-400/70')}>
            <RenderSecao s={s} dias={dias} previa={previa} />
          </div>
        ))}
      </main>

      {c.rodape.instalar_app && !previa && <div className="relative mx-auto max-w-6xl px-4 pb-8"><InstalarApp compacto /></div>}
      <footer className="relative border-t border-white/5 px-4 py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 text-sm text-slate-500 sm:flex-row">
          <div className="flex items-center gap-2 font-semibold text-slate-300"><Logo c={c} className="h-6 w-6" /></div>
          <nav className="flex flex-wrap justify-center gap-6">
            {c.rodape.links.map((l, i) => <Destino key={i} link={l.link} previa={previa} className="hover:text-slate-300">{comDias(l.texto, dias)}</Destino>)}
            {c.rodape.contato && <a href={`mailto:${c.rodape.contato}`} onClick={(e) => previa && e.preventDefault()} className="hover:text-slate-300">Contato</a>}
          </nav>
          {c.rodape.copyright && <p>© {new Date().getFullYear()} {c.rodape.copyright}</p>}
        </div>
      </footer>
    </div>
  )
}

export default function Landing() {
  const conteudoQ = useQuery({
    queryKey: ['site-publico'], staleTime: 60_000, retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('site_publico')
      if (error) throw error
      return data
    },
  })
  const conteudo = lerConteudo(conteudoQ.data)
  const tituloAba = conteudo.seo.titulo_aba
  const descricao = conteudo.seo.descricao

  useEffect(() => {
    const html = document.documentElement
    const tinhaDark = html.classList.contains('dark')
    html.classList.add('dark')
    html.style.scrollBehavior = 'smooth'
    return () => {
      html.style.scrollBehavior = ''
      if (!tinhaDark) html.classList.remove('dark')
      document.title = 'LicitaForce'
    }
  }, [])
  useEffect(() => {
    document.title = tituloAba || 'LicitaForce'
    if (!descricao) return
    let meta = document.head.querySelector<HTMLMetaElement>('meta[name="description"]')
    const anterior = meta?.content
    if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta) }
    meta.content = descricao
    return () => { if (meta) meta.content = anterior ?? '' }
  }, [tituloAba, descricao])

  // Enquanto o conteúdo publicado carrega, não mostra a versão padrão (evita "piscar" textos antigos).
  if (conteudoQ.isLoading) return <div className="min-h-screen bg-slate-950" />
  return <PaginaLanding conteudo={conteudo} />
}
