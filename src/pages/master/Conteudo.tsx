import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, ChevronDown, Copy, ExternalLink, Eye, EyeOff, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { supabase, mensagemErro } from '@/lib/supabase'
import { conteudoPadrao, lerConteudo, novoUid, secaoExemplo, TIPOS_SECAO, validarConteudo, type ConteudoSite, type SecaoSite, type TipoSecao } from '@/lib/conteudoSite'
import { Abas, Aviso, Button, CabecalhoPagina, Card, Carregando, Select, Textarea } from '@/components/ui'
import { formatarDataHora } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PaginaLanding } from '@/pages/landing/Landing'
import { EditorSecao } from './landing/EditorSecao'
import { Botao, Cor, Imagem, ListaLinks, Marcar, mover, Texto } from './landing/campos'

type Estado = { versao: number; rascunho: unknown; publicado: unknown; publicado_em: string | null }
type Aba = 'secoes' | 'geral' | 'historico' | 'json'
const nomeTipo = (t: TipoSecao) => TIPOS_SECAO.find((x) => x.tipo === t)?.nome ?? t
const LARGURA_PREVIA = 1280

/** A landing de verdade, renderizada em 1280 px e reduzida para caber na coluna. */
function Previa({ conteudo, ativa }: { conteudo: ConteudoSite; ativa: string | null }) {
  const caixa = useRef<HTMLDivElement>(null)
  const pagina = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(640)
  const [altura, setAltura] = useState(0)
  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => {
      if (caixa.current) setLargura(caixa.current.clientWidth)
      if (pagina.current) setAltura(pagina.current.offsetHeight)
    })
    if (caixa.current) ro.observe(caixa.current)
    if (pagina.current) ro.observe(pagina.current)
    return () => ro.disconnect()
  }, [])
  const escala = largura / LARGURA_PREVIA
  useEffect(() => {
    if (!ativa || !caixa.current || !pagina.current) return
    const el = pagina.current.querySelector(`[data-secao="${ativa}"]`)
    if (!el) return
    const topo = el.getBoundingClientRect().top - pagina.current.getBoundingClientRect().top
    caixa.current.scrollTo({ top: Math.max(0, topo - 24), behavior: 'smooth' })
  }, [ativa])
  return (
    <div ref={caixa} className="h-[calc(100vh-11rem)] min-h-[420px] overflow-y-auto overflow-x-hidden rounded-2xl border bg-slate-950 [scrollbar-width:thin]">
      <div style={{ height: altura * escala }}>
        <div ref={pagina} style={{ width: LARGURA_PREVIA, transform: `scale(${escala})`, transformOrigin: 'top left' }}>
          <PaginaLanding conteudo={conteudo} previa secaoAtiva={ativa ?? undefined} />
        </div>
      </div>
    </div>
  )
}

function ListaSecoes({ c, setC, aberta, setAberta }: { c: ConteudoSite; setC: (f: (c: ConteudoSite) => ConteudoSite) => void; aberta: string | null; setAberta: (u: string | null) => void }) {
  const [novoTipo, setNovoTipo] = useState<TipoSecao>('livre')
  const trocar = (uid: string, p: Partial<SecaoSite>) => setC((c) => ({ ...c, secoes: c.secoes.map((s) => (s.uid === uid ? { ...s, ...p } : s)) }))
  const lista = (f: (l: SecaoSite[]) => SecaoSite[]) => setC((c) => ({ ...c, secoes: f(c.secoes) }))
  function adicionar() {
    const nova = secaoExemplo(novoTipo)
    lista((l) => {
      const i = l.findIndex((s) => s.uid === aberta)
      return i < 0 ? [...l, nova] : [...l.slice(0, i + 1), nova, ...l.slice(i + 1)]
    })
    setAberta(nova.uid)
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Clique numa seção para editar. Use {'{dias}'} em qualquer texto para mostrar o prazo do teste grátis.</p>
      {c.secoes.map((s, i) => (
        <Card key={s.uid} className={cn('overflow-hidden', aberta === s.uid && 'ring-2 ring-amber-400/60', !s.visivel && 'opacity-60')}>
          <div className="flex items-center gap-1 p-2">
            <button className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted" onClick={() => setAberta(aberta === s.uid ? null : s.uid)} aria-expanded={aberta === s.uid}>
              <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', aberta !== s.uid && '-rotate-90')} />
              <span className="min-w-0">
                <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">{i + 1}. {nomeTipo(s.tipo)}{!s.visivel && ' · oculta'}</span>
                <span className="block truncate text-sm font-medium">{s.titulo || s.selo || s.marcadores[0] || 'Sem título'}</span>
              </span>
            </button>
            <Button variante="fantasma" tamanho="icone" title="Subir" disabled={i === 0} onClick={() => lista((l) => mover(l, i, -1))}><ArrowUp className="h-4 w-4" /></Button>
            <Button variante="fantasma" tamanho="icone" title="Descer" disabled={i === c.secoes.length - 1} onClick={() => lista((l) => mover(l, i, 1))}><ArrowDown className="h-4 w-4" /></Button>
            <Button variante="fantasma" tamanho="icone" title={s.visivel ? 'Ocultar' : 'Mostrar'} onClick={() => trocar(s.uid, { visivel: !s.visivel })}>{s.visivel ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</Button>
            <Button variante="fantasma" tamanho="icone" title="Duplicar" onClick={() => { const copia = { ...structuredClone(s), uid: novoUid(), ancora: '' }; lista((l) => [...l.slice(0, i + 1), copia, ...l.slice(i + 1)]); setAberta(copia.uid) }}><Copy className="h-4 w-4" /></Button>
            <Button variante="fantasma" tamanho="icone" title="Excluir" onClick={() => { if (confirm(`Excluir a seção "${s.titulo || nomeTipo(s.tipo)}"?`)) lista((l) => l.filter((x) => x.uid !== s.uid)) }}><Trash2 className="h-4 w-4" /></Button>
          </div>
          {aberta === s.uid && <div className="space-y-4 border-t p-4"><EditorSecao s={s} mudar={(p) => trocar(s.uid, p)} /></div>}
        </Card>
      ))}
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <Select className="min-w-0 flex-1" value={novoTipo} onChange={(e) => setNovoTipo(e.target.value as TipoSecao)} aria-label="Tipo da nova seção">
          {TIPOS_SECAO.map((t) => <option key={t.tipo} value={t.tipo}>{t.nome} · {t.descricao}</option>)}
        </Select>
        <Button tamanho="sm" onClick={adicionar}><Plus className="h-4 w-4" /> Adicionar seção{aberta ? ' abaixo da aberta' : ''}</Button>
      </Card>
    </div>
  )
}

function Geral({ c, setC }: { c: ConteudoSite; setC: (f: (c: ConteudoSite) => ConteudoSite) => void }) {
  const em = <K extends keyof ConteudoSite>(k: K, p: Partial<ConteudoSite[K]>) => setC((c) => ({ ...c, [k]: { ...(c[k] as object), ...p } }))
  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <h3 className="font-semibold">Marca</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <Texto rotulo="Nome" valor={c.marca.nome} mudar={(nome) => em('marca', { nome })} />
          <Texto rotulo="Parte colorida do nome" valor={c.marca.nome_destaque} mudar={(nome_destaque) => em('marca', { nome_destaque })} />
        </div>
        <Imagem rotulo="Logo" valor={c.marca.logo} mudar={(logo) => em('marca', { logo })} />
      </Card>
      <Card className="space-y-3 p-4">
        <h3 className="font-semibold">Cores</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          <Cor rotulo="Cor 1 (início do degradê)" valor={c.tema.cor1} mudar={(cor1) => em('tema', { cor1 })} />
          <Cor rotulo="Cor 2 (fim do degradê e destaques)" valor={c.tema.cor2} mudar={(cor2) => em('tema', { cor2 })} />
          <Cor rotulo="Fundo da página" valor={c.tema.fundo} mudar={(fundo) => em('tema', { fundo })} />
        </div>
        <p className="text-xs text-muted-foreground">Os textos são claros: mantenha o fundo escuro.</p>
        <Marcar rotulo="Barra de progresso de leitura no topo" valor={c.tema.barra_progresso} mudar={(barra_progresso) => em('tema', { barra_progresso })} />
      </Card>
      <Card className="space-y-3 p-4">
        <h3 className="font-semibold">Menu do topo</h3>
        <ListaLinks rotulo="Links" valor={c.menu.links} mudar={(links) => em('menu', { links })} />
        <div className="grid gap-2 sm:grid-cols-2">
          <Texto rotulo="Texto do link Entrar" valor={c.menu.entrar} mudar={(entrar) => em('menu', { entrar })} ajuda="Vazio = esconde" />
          <Texto rotulo="Botão para quem já está logado" valor={c.menu.painel} mudar={(painel) => em('menu', { painel })} />
        </div>
        <Botao rotulo="Botão de cadastro" valor={c.menu.cadastro} mudar={(cadastro) => em('menu', { cadastro })} />
      </Card>
      <Card className="space-y-3 p-4">
        <h3 className="font-semibold">Rodapé</h3>
        <ListaLinks rotulo="Links" valor={c.rodape.links} mudar={(links) => em('rodape', { links })} />
        <div className="grid gap-2 sm:grid-cols-2">
          <Texto rotulo="E-mail de contato" valor={c.rodape.contato} mudar={(contato) => em('rodape', { contato })} ajuda="Vazio = sem link de contato" />
          <Texto rotulo="Nome no © do rodapé" valor={c.rodape.copyright} mudar={(copyright) => em('rodape', { copyright })} />
        </div>
        <Marcar rotulo="Mostrar convite para instalar o app" valor={c.rodape.instalar_app} mudar={(instalar_app) => em('rodape', { instalar_app })} />
      </Card>
      <Card className="space-y-3 p-4">
        <h3 className="font-semibold">Google e aba do navegador</h3>
        <Texto rotulo="Título da aba" valor={c.seo.titulo_aba} mudar={(titulo_aba) => em('seo', { titulo_aba })} />
        <Texto rotulo="Descrição para buscadores" valor={c.seo.descricao} longo mudar={(descricao) => em('seo', { descricao })} />
      </Card>
    </div>
  )
}

function Editor({ estado }: { estado: Estado }) {
  const qc = useQueryClient()
  const [c, setConteudo] = useState(() => lerConteudo(estado.rascunho))
  const [versao, setVersao] = useState(estado.versao)
  const [pendente, setPendente] = useState(false)
  const [alterado, setAlterado] = useState(false)
  const [aba, setAba] = useState<Aba>('secoes')
  const [aberta, setAberta] = useState<string | null>(null)
  const [json, setJson] = useState('')
  const setC = (f: (c: ConteudoSite) => ConteudoSite) => { setConteudo(f); setAlterado(true) }
  const carregar = (novo: ConteudoSite) => { setConteudo(novo); setAlterado(true); setAberta(null) }

  useEffect(() => {
    if (!alterado) return
    const f = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', f)
    return () => window.removeEventListener('beforeunload', f)
  }, [alterado])
  useEffect(() => { if (aba === 'json') setJson(JSON.stringify(c, null, 2)) }, [aba]) // eslint-disable-line react-hooks/exhaustive-deps

  const historico = useQuery({ queryKey: ['site-historico'], queryFn: async () => {
    const { data, error } = await supabase.from('site_content_history').select('id,versao,acao,created_at,conteudo').order('id', { ascending: false }).limit(30)
    if (error) throw error
    return data
  } })

  async function salvar(publicar: boolean) {
    const erro = validarConteudo(c)
    if (erro) return toast.error(erro)
    if (publicar && !confirm('Publicar esta versão da landing page para todos os visitantes?')) return
    setPendente(true)
    try {
      const { data, error } = await supabase.rpc('admin_salvar_site', { p_conteudo: c, p_versao: versao, p_publicar: publicar })
      if (error) throw error
      setVersao(data); setAlterado(false)
      await qc.invalidateQueries({ queryKey: ['site-historico'] })
      await qc.invalidateQueries({ queryKey: ['site-publico'] })
      toast.success(publicar ? 'Landing publicada. Visitantes verão a nova versão ao carregar a página.' : 'Rascunho salvo. A página pública não mudou.')
    } catch (e) { toast.error(mensagemErro(e)) } finally { setPendente(false) }
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3 p-3">
        <span className="mr-auto text-sm">
          Revisão {versao}{estado.publicado_em && <span className="text-muted-foreground"> · publicada em {formatarDataHora(estado.publicado_em)}</span>}
          {alterado && <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-300">alterações não salvas</span>}
        </span>
        <a href="/" target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ExternalLink className="h-4 w-4" /> Ver publicada</a>
        <Button variante="contorno" tamanho="sm" disabled={pendente} onClick={() => salvar(false)}>Salvar rascunho</Button>
        <Button tamanho="sm" carregando={pendente} onClick={() => salvar(true)}>Publicar</Button>
      </Card>
      <div className="grid gap-4 xl:grid-cols-[minmax(380px,460px)_1fr]">
        <div className="min-w-0">
          <Abas<Aba> abas={[{ id: 'secoes', rotulo: 'Seções', contagem: c.secoes.length }, { id: 'geral', rotulo: 'Marca, menu e rodapé' }, { id: 'historico', rotulo: 'Histórico' }, { id: 'json', rotulo: 'Avançado' }]} atual={aba} aoTrocar={setAba} />
          <div className="xl:h-[calc(100vh-14rem)] xl:overflow-y-auto xl:pr-1">
            {aba === 'secoes' && <ListaSecoes c={c} setC={setC} aberta={aberta} setAberta={setAberta} />}
            {aba === 'geral' && <Geral c={c} setC={setC} />}
            {aba === 'historico' && (
              <Card className="p-4">
                <p className="mb-3 text-xs text-muted-foreground">Restaurar carrega a versão no editor. Salve ou publique para aplicar.</p>
                <Button tamanho="sm" variante="contorno" className="mb-3" onClick={() => { if (confirm('Carregar a landing original (como era antes de ficar editável)?')) carregar(conteudoPadrao()) }}><RotateCcw className="h-4 w-4" /> Carregar versão original</Button>
                {historico.isError && <Aviso>Não foi possível carregar o histórico.</Aviso>}
                {historico.data?.map((v) => (
                  <div key={v.id} className="flex flex-wrap items-center justify-between gap-3 border-t py-3 text-sm">
                    <span>Revisão {v.versao} · {v.acao}<small className="block text-muted-foreground">{formatarDataHora(v.created_at)}</small></span>
                    <Button tamanho="sm" variante="contorno" disabled={pendente} onClick={() => { if (alterado && !confirm('Substituir as alterações não salvas?')) return; carregar(lerConteudo(v.conteudo)) }}>Restaurar no editor</Button>
                  </div>
                ))}
              </Card>
            )}
            {aba === 'json' && (
              <Card className="space-y-3 p-4">
                <p className="text-xs text-muted-foreground">A página inteira em JSON. Copie para guardar um backup ou cole uma versão e aplique.</p>
                <Textarea className="min-h-[50vh] font-mono text-xs" spellCheck={false} value={json} onChange={(e) => setJson(e.target.value)} aria-label="Conteúdo em JSON" />
                <Button tamanho="sm" onClick={() => { try { const lido = lerConteudo(JSON.parse(json)); carregar(lido); setJson(JSON.stringify(lido, null, 2)); toast.success('Aplicado no editor') } catch { toast.error('JSON inválido') } }}>Aplicar no editor</Button>
              </Card>
            )}
          </div>
        </div>
        <div className="min-w-0">
          <p className="mb-2 text-xs text-muted-foreground">Prévia ao vivo do rascunho (como no computador). Links não navegam aqui. Seções ocultas não aparecem.</p>
          <Previa conteudo={c} ativa={aberta} />
        </div>
      </div>
    </div>
  )
}

export default function Conteudo() {
  const q = useQuery({ queryKey: ['site-admin'], queryFn: async () => {
    const { data, error } = await supabase.from('site_content').select('versao,rascunho,publicado,publicado_em').single()
    if (error) throw error
    return data as Estado
  } })
  return (
    <>
      <CabecalhoPagina titulo="Landing page" descricao="Edite toda a página: seções, ordem, textos, ícones, imagens, botões, cores, menu e rodapé. Rascunhos só aparecem para o master." />
      {q.isLoading ? <Carregando /> : q.isError ? <Aviso>Editor indisponível. <button className="underline" onClick={() => q.refetch()}>Tentar novamente</button></Aviso> : q.data && <Editor estado={q.data} />}
    </>
  )
}
