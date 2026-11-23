import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowRight,
  BookOpen,
  Bot,
  ChevronDown,
  Clock,
  CreditCard,
  FileCheck2,
  Gavel,
  Inbox,
  LifeBuoy,
  Lightbulb,
  LineChart,
  MessageSquare,
  PlayCircle,
  Radar,
  Rocket,
  Search,
  ThumbsDown,
  ThumbsUp,
  X,
  type LucideIcon,
} from 'lucide-react'
import { CATEGORIAS_AJUDA, combinaBusca, PERGUNTAS, TUTORIAIS, VIDEOS, type CategoriaAjuda, type Tutorial, type VideoAjuda } from '@/lib/centralAjuda'
import { Badge, Button, Card, Modal } from '@/components/ui'
import { cn } from '@/lib/utils'

const ICONES: Record<CategoriaAjuda, LucideIcon> = {
  primeiros: Rocket,
  oportunidades: Radar,
  processos: Gavel,
  analise: LineChart,
  ia: Bot,
  documentos: FileCheck2,
  conta: CreditCard,
}

const nomeCategoria = (c: CategoriaAjuda) => CATEGORIAS_AJUDA.find((x) => x.id === c)?.rotulo ?? c

function TituloSecao({ id, icone: Icone, titulo, descricao, extra }: { id: string; icone: LucideIcon; titulo: string; descricao: string; extra?: ReactNode }) {
  return (
    <div id={id} className="mb-4 flex scroll-mt-24 flex-wrap items-end justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/30">
          <Icone className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold tracking-tight sm:text-xl">{titulo}</h2>
          <p className="text-sm text-muted-foreground">{descricao}</p>
        </div>
      </div>
      {extra}
    </div>
  )
}

function CartaoVideo({ v, aoAssistir, aoLer }: { v: VideoAjuda; aoAssistir: () => void; aoLer: () => void }) {
  const Icone = ICONES[v.categoria]
  const pronto = !!v.youtube
  return (
    <Card className="group flex flex-col overflow-hidden">
      <button
        type="button"
        onClick={pronto ? aoAssistir : aoLer}
        className="relative flex aspect-video items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 text-left"
        aria-label={pronto ? `Assistir: ${v.titulo}` : `Ver tutoriais de ${nomeCategoria(v.categoria)}`}
      >
        {pronto && <img src={`https://i.ytimg.com/vi/${v.youtube}/hqdefault.jpg`} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-80 transition-transform duration-500 group-hover:scale-105" />}
        <Icone className="absolute -right-4 -top-4 h-28 w-28 text-white/5" />
        <span className={cn('relative flex h-14 w-14 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20 backdrop-blur transition-transform group-hover:scale-110', pronto && 'bg-emerald-500/90')}>
          <PlayCircle className="h-8 w-8 text-white" />
        </span>
        {pronto && <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white">{v.duracao}</span>}
        {!pronto && <span className="absolute left-2 top-2 rounded-full bg-amber-400/90 px-2 py-0.5 text-[11px] font-semibold text-amber-950">Em produção</span>}
      </button>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{nomeCategoria(v.categoria)}</p>
        <h3 className="font-semibold leading-snug">{v.titulo}</h3>
        <p className="text-sm text-muted-foreground">{v.descricao}</p>
        {!pronto && (
          <button type="button" onClick={aoLer} className="mt-auto pt-2 text-left text-sm font-medium text-primary hover:underline">
            Enquanto isso, veja o tutorial em texto →
          </button>
        )}
      </div>
    </Card>
  )
}

function Pergunta({ pergunta, resposta, categoria }: { pergunta: string; resposta: string; categoria: CategoriaAjuda }) {
  const [aberta, setAberta] = useState(false)
  return (
    <div className="border-b last:border-b-0">
      <button type="button" aria-expanded={aberta} onClick={() => setAberta(!aberta)} className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-muted/40 sm:px-5">
        <span className="min-w-0 flex-1 font-medium">{pergunta}</span>
        <span className="hidden text-xs text-muted-foreground sm:inline">{nomeCategoria(categoria)}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', aberta && 'rotate-180')} />
      </button>
      {aberta && <p className="px-4 pb-4 text-sm leading-relaxed text-muted-foreground sm:px-5">{resposta}</p>}
    </div>
  )
}

/** Central de Ajuda do cliente: busca, tutoriais, vídeos, perguntas frequentes e contato com a equipe. */
export function CentralAjuda({ aoContatar, children }: { aoContatar: (tipo: 'suporte' | 'sugestao', assunto?: string) => void; children: ReactNode }) {
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState<CategoriaAjuda | ''>('')
  const [tutorial, setTutorial] = useState<Tutorial | null>(null)
  const [video, setVideo] = useState<VideoAjuda | null>(null)
  const [avaliados, setAvaliados] = useState<Record<string, boolean>>({})

  const filtroCat = <T extends { categoria: CategoriaAjuda }>(x: T) => !categoria || x.categoria === categoria
  const tutoriais = TUTORIAIS.filter((t) => filtroCat(t) && combinaBusca(busca, t.titulo, t.resumo, ...t.passos, t.dica ?? ''))
  const videos = VIDEOS.filter((v) => filtroCat(v) && combinaBusca(busca, v.titulo, v.descricao))
  const perguntas = PERGUNTAS.filter((p) => filtroCat(p) && combinaBusca(busca, p.pergunta, p.resposta))
  const total = tutoriais.length + videos.length + perguntas.length
  const filtrando = !!busca.trim() || !!categoria

  const irPara = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  function verCategoria(c: CategoriaAjuda) {
    setCategoria(c)
    setTimeout(() => irPara('tutoriais'), 0)
  }
  function lerTutorialDoVideo(v: VideoAjuda) {
    const t = TUTORIAIS.find((x) => x.categoria === v.categoria)
    if (t) setTutorial(t)
  }
  function avaliar(t: Tutorial, ajudou: boolean) {
    setAvaliados((a) => ({ ...a, [t.id]: ajudou }))
    if (ajudou) toast.success('Que bom! Obrigado pelo retorno.')
    else {
      setTutorial(null)
      aoContatar('suporte', `Dúvida sobre: ${t.titulo}`)
    }
  }

  return (
    <div className="space-y-12">
      {/* Topo com busca */}
      <section className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-5 py-10 text-white shadow-xl sm:px-10 sm:py-14">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />
        <LifeBuoy className="pointer-events-none absolute -bottom-10 right-6 hidden h-48 w-48 text-white/5 sm:block" />
        <div className="relative mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
            <LifeBuoy className="h-3.5 w-3.5" /> Central de Ajuda LicitaForce
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Como podemos ajudar?</h1>
          <p className="mt-2 text-sm text-slate-300 sm:text-base">Tutoriais passo a passo, vídeos e respostas rápidas. Se preferir, fale direto com a nossa equipe.</p>
          <form
            className="relative mt-6"
            onSubmit={(e) => {
              e.preventDefault()
              irPara('resultados')
            }}
          >
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Busque por assunto: prazo, certidão, preço, recurso…"
              aria-label="Buscar na Central de Ajuda"
              className="h-14 w-full rounded-2xl border border-white/10 bg-white/95 pl-12 pr-12 text-base text-slate-900 shadow-lg placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            {busca && (
              <button type="button" onClick={() => setBusca('')} className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200" aria-label="Limpar busca">
                <X className="h-4 w-4" />
              </button>
            )}
          </form>
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs">
            {['prazo', 'certidão', 'preço', 'recurso', 'equipe'].map((s) => (
              <button key={s} type="button" onClick={() => setBusca(s)} className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-slate-200 hover:bg-white/10">
                {s}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Atalhos rápidos */}
      <section className="-mt-4 grid gap-3 sm:grid-cols-3">
        {[
          { icone: BookOpen, titulo: 'Tutoriais', texto: `${TUTORIAIS.length} guias passo a passo`, acao: () => irPara('tutoriais') },
          { icone: PlayCircle, titulo: 'Vídeos', texto: 'Aprenda assistindo', acao: () => irPara('videos') },
          { icone: MessageSquare, titulo: 'Fale conosco', texto: 'Suporte e sugestões', acao: () => irPara('contato') },
        ].map(({ icone: Icone, titulo, texto, acao }) => (
          <button key={titulo} type="button" onClick={acao} className="lf-cartao group flex items-center gap-3 rounded-2xl border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-md">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl lf-degrade text-white">
              <Icone className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{titulo}</span>
              <span className="block text-sm text-muted-foreground">{texto}</span>
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
          </button>
        ))}
      </section>

      {/* Categorias */}
      <section>
        <TituloSecao id="categorias" icone={Lightbulb} titulo="Navegue por assunto" descricao="Escolha uma área para ver só o que importa." />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIAS_AJUDA.map((c) => {
            const Icone = ICONES[c.id]
            const n = TUTORIAIS.filter((t) => t.categoria === c.id).length + PERGUNTAS.filter((p) => p.categoria === c.id).length
            const ativa = categoria === c.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => (ativa ? setCategoria('') : verCategoria(c.id))}
                aria-pressed={ativa}
                className={cn('lf-cartao rounded-2xl border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md', ativa ? 'border-emerald-500 ring-2 ring-emerald-500/30' : 'hover:border-emerald-500/40')}
              >
                <Icone className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                <p className="mt-3 font-semibold">{c.rotulo}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{c.descricao}</p>
                <p className="mt-2 text-xs text-muted-foreground">{n} artigos</p>
              </button>
            )
          })}
        </div>
      </section>

      <div id="resultados" className="scroll-mt-24 space-y-12">
        {filtrando && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-muted/40 px-4 py-3 text-sm">
            <span>
              <strong>{total}</strong> {total === 1 ? 'resultado' : 'resultados'}
              {busca.trim() && <> para “{busca.trim()}”</>}
            </span>
            {categoria && <Badge cor="verde">{nomeCategoria(categoria)}</Badge>}
            <button type="button" onClick={() => { setBusca(''); setCategoria('') }} className="ml-auto font-medium text-primary hover:underline">
              Limpar filtros
            </button>
          </div>
        )}

        {filtrando && total === 0 && (
          <Card className="p-8 text-center">
            <p className="font-semibold">Não encontramos nada sobre isso.</p>
            <p className="mt-1 text-sm text-muted-foreground">Tente outras palavras ou fale com a nossa equipe, que responde por aqui mesmo.</p>
            <Button className="mt-4" onClick={() => aoContatar('suporte', busca.trim() || undefined)}>
              <MessageSquare className="h-4 w-4" /> Falar com o suporte
            </Button>
          </Card>
        )}

        {/* Tutoriais */}
        {tutoriais.length > 0 && (
          <section>
            <TituloSecao id="tutoriais" icone={BookOpen} titulo="Tutoriais passo a passo" descricao="Guias curtos para cada parte do LicitaForce." />
            <div className="grid gap-3 md:grid-cols-2">
              {tutoriais.map((t) => {
                const Icone = ICONES[t.categoria]
                return (
                  <button key={t.id} type="button" onClick={() => setTutorial(t)} className="lf-cartao group flex gap-4 rounded-2xl border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-md">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                      <Icone className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold group-hover:text-primary">{t.titulo}</span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">{t.resumo}</span>
                      <span className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {t.minutos} min</span>
                        <span>{t.passos.length} passos</span>
                        <span>{nomeCategoria(t.categoria)}</span>
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* Vídeos */}
        {videos.length > 0 && (
          <section>
            <TituloSecao id="videos" icone={PlayCircle} titulo="Vídeos" descricao="Aulas curtas para dominar o LicitaForce." />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {videos.map((v) => (
                <CartaoVideo key={v.id} v={v} aoAssistir={() => setVideo(v)} aoLer={() => lerTutorialDoVideo(v)} />
              ))}
            </div>
          </section>
        )}

        {/* Perguntas frequentes */}
        {perguntas.length > 0 && (
          <section>
            <TituloSecao id="perguntas" icone={MessageSquare} titulo="Perguntas frequentes" descricao="Respostas rápidas para as dúvidas mais comuns." />
            <Card className="overflow-hidden">
              {perguntas.map((p) => (
                <Pergunta key={p.pergunta} {...p} />
              ))}
            </Card>
          </section>
        )}
      </div>

      {/* Contato */}
      <section>
        <TituloSecao id="contato" icone={LifeBuoy} titulo="Fale conosco" descricao="Não encontrou o que procurava? A nossa equipe responde por aqui." />
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="flex flex-col p-5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl lf-degrade text-white"><MessageSquare className="h-5 w-5" /></span>
            <h3 className="mt-4 font-semibold">Abrir chamado de suporte</h3>
            <p className="mt-1 flex-1 text-sm text-muted-foreground">Dúvidas, erros ou algo que não funcionou como esperado. Descreva o que aconteceu e em qual tela.</p>
            <Button className="mt-4" onClick={() => aoContatar('suporte')}>Abrir chamado</Button>
          </Card>
          <Card className="flex flex-col p-5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 ring-1 ring-amber-500/30"><Lightbulb className="h-5 w-5 text-amber-600 dark:text-amber-400" /></span>
            <h3 className="mt-4 font-semibold">Enviar uma sugestão</h3>
            <p className="mt-1 flex-1 text-sm text-muted-foreground">Uma ideia de recurso ou melhoria? Cada sugestão é lida pela equipe e ajuda a definir as próximas versões.</p>
            <Button variante="contorno" className="mt-4" onClick={() => aoContatar('sugestao')}>Enviar sugestão</Button>
          </Card>
          <Card className="flex flex-col p-5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/15 ring-1 ring-sky-500/30"><Inbox className="h-5 w-5 text-sky-600 dark:text-sky-400" /></span>
            <h3 className="mt-4 font-semibold">Acompanhar solicitações</h3>
            <p className="mt-1 flex-1 text-sm text-muted-foreground">Veja o andamento e converse com a equipe. Respostas novas aparecem marcadas como “Não lido”.</p>
            <Button variante="contorno" className="mt-4" onClick={() => irPara('solicitacoes')}>Ver minhas solicitações</Button>
          </Card>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">Por segurança, nunca envie senhas, tokens ou dados de cartão nas mensagens. A equipe do LicitaForce jamais pede a sua senha.</p>
      </section>

      <section id="solicitacoes" className="scroll-mt-24">{children}</section>

      {/* Tutorial aberto */}
      <Modal aberto={!!tutorial} aoFechar={() => setTutorial(null)} titulo={tutorial?.titulo ?? 'Tutorial'} largo>
        {tutorial && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge cor="verde">{nomeCategoria(tutorial.categoria)}</Badge>
              <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {tutorial.minutos} min de leitura</span>
            </div>
            <p className="text-sm text-muted-foreground">{tutorial.resumo}</p>
            <ol className="space-y-3">
              {tutorial.passos.map((p, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full lf-degrade text-sm font-bold text-white">{i + 1}</span>
                  <span className="pt-0.5 text-sm leading-relaxed">{p}</span>
                </li>
              ))}
            </ol>
            {tutorial.dica && (
              <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <Lightbulb className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                <span><strong>Dica:</strong> {tutorial.dica}</span>
              </div>
            )}
            <div className="flex flex-col gap-4 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              {tutorial.id in avaliados ? (
                <p className="text-sm text-muted-foreground">Obrigado pelo retorno!</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Este tutorial ajudou?</span>
                  <Button tamanho="sm" variante="contorno" onClick={() => avaliar(tutorial, true)}><ThumbsUp className="h-4 w-4" /> Sim</Button>
                  <Button tamanho="sm" variante="contorno" onClick={() => avaliar(tutorial, false)}><ThumbsDown className="h-4 w-4" /> Não, preciso de ajuda</Button>
                </div>
              )}
              {tutorial.rota && (
                <Link to={tutorial.rota} className="inline-flex h-10 items-center justify-center gap-2 rounded-full lf-degrade px-5 text-sm font-semibold text-white hover:brightness-110">
                  {tutorial.rotuloRota ?? 'Abrir'} <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Vídeo aberto */}
      <Modal aberto={!!video} aoFechar={() => setVideo(null)} titulo={video?.titulo ?? 'Vídeo'} largo>
        {video?.youtube && (
          <div className="space-y-3">
            <div className="aspect-video overflow-hidden rounded-xl bg-black">
              <iframe
                className="h-full w-full"
                src={`https://www.youtube-nocookie.com/embed/${video.youtube}?autoplay=1&rel=0`}
                title={video.titulo}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <p className="text-sm text-muted-foreground">{video.descricao}</p>
          </div>
        )}
      </Modal>
    </div>
  )
}
