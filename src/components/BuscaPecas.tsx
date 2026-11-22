import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, ChevronUp, Download, ExternalLink, FilePen, Info, Search, SearchX } from 'lucide-react'
import { Badge, Button, Card, Input, Select, Vazio } from '@/components/ui'
import { PECAS, type TipoPeca } from '@/lib/juridico'
import { formatarData } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  lerPeca, pesquisarPecas, rotuloPapel, statusPecas, TAMANHO_PAGINA, UFS,
  type FiltrosPecas, type PecaPublicada,
} from '@/lib/pecasJuridicas'

const COR: Record<TipoPeca, 'azul' | 'verde' | 'amarelo' | 'vermelho' | 'neutro'> = {
  impugnacao: 'vermelho', esclarecimento: 'azul', 'intencao-recurso': 'amarelo', recurso: 'verde', contrarrazoes: 'neutro',
}
const rotuloTipo = (t: TipoPeca) => PECAS.find((p) => p.id === t)?.rotulo ?? t

/** Busca nas peças publicadas no Portal de Compras Públicas, com leitura do texto e "usar como modelo". */
export default function BuscaPecas({ tipoInicial, aoUsarModelo }: { tipoInicial: TipoPeca; aoUsarModelo: (p: PecaPublicada, texto: string) => void }) {
  const inicial: FiltrosPecas = { busca: '', tipos: [tipoInicial], uf: '', orgao: '', novaLei: false }
  const [f, setF] = useState<FiltrosPecas>(inicial)
  const [consulta, setConsulta] = useState<FiltrosPecas>(inicial)
  const [pagina, setPagina] = useState(1)
  const q = useQuery({ queryKey: ['pecas-juridicas', consulta, pagina], retry: 1, staleTime: 5 * 60_000, queryFn: ({ signal }) => pesquisarPecas(consulta, pagina, signal) })
  const st = useQuery({ queryKey: ['pecas-juridicas-status'], staleTime: 10 * 60_000, queryFn: statusPecas })

  const aplicar = (novo: FiltrosPecas) => { setF(novo); setPagina(1); setConsulta(novo) }
  function pesquisar(e: FormEvent) {
    e.preventDefault()
    if (JSON.stringify(f) === JSON.stringify(consulta) && pagina === 1) void q.refetch()
    else aplicar({ ...f })
  }
  const alternarTipo = (t: TipoPeca) => {
    const tipos = f.tipos.includes(t) ? f.tipos.filter((x) => x !== t) : [...f.tipos, t]
    if (tipos.length) aplicar({ ...f, tipos })
  }

  const lista = q.data?.data ?? []
  const total = q.data?.total ?? 0
  const paginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA))
  const s = st.data

  return (
    <>
      <Card className="mb-4 p-4">
        <form onSubmit={pesquisar} className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" aria-label="Pesquisar termos" placeholder="Termos: atestado; balanço; marca; pneu" value={f.busca} maxLength={300}
                onChange={(e) => setF((x) => ({ ...x, busca: e.target.value }))} />
            </div>
            <Button type="submit" carregando={q.isFetching}>Buscar peças</Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <Input aria-label="Limitar por órgão ou município" placeholder="Limitar por órgão ou município" value={f.orgao} maxLength={120}
              onChange={(e) => setF((x) => ({ ...x, orgao: e.target.value }))} />
            <Select aria-label="UF" value={f.uf} onChange={(e) => aplicar({ ...f, uf: e.target.value })}>
              <option value="">Todas as UFs</option>
              {UFS.map((u) => <option key={u}>{u}</option>)}
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Tipos de peça">
            {PECAS.map((p) => {
              const ativo = f.tipos.includes(p.id)
              const n = q.data?.porTipo?.[p.id]
              return (
                <button key={p.id} type="button" aria-pressed={ativo} onClick={() => alternarTipo(p.id)}
                  className={cn('h-8 rounded-full border px-3.5 text-sm font-medium transition-colors',
                    ativo ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}>
                  {p.rotulo}{ativo && n !== undefined ? ` · ${n.toLocaleString('pt-BR')}` : ''}
                </button>
              )
            })}
            <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={f.novaLei} onChange={(e) => aplicar({ ...f, novaLei: e.target.checked })} />
              Somente nova lei (14.133)
            </label>
          </div>
        </form>
      </Card>

      <div className="mb-4 flex gap-2.5 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-900 dark:text-sky-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Peças publicadas no <strong>Portal de Compras Públicas</strong> (sobretudo prefeituras e órgãos estaduais), de sessões entre 21 e 90 dias atrás.
          As do Compras.gov.br (federais) ficam atrás de captcha e não entram.
          {s && s.pecas > 0 && <> Hoje: <strong>{s.pecas.toLocaleString('pt-BR')} peças</strong> de {s.processos.toLocaleString('pt-BR')} processos{s.desde && s.ate ? `, sessões de ${formatarData(s.desde)} a ${formatarData(s.ate)}` : ''}.</>}
          {s && s.diasPendentes > 0 && <> Carga em andamento: {s.diasConcluidos} de {s.diasConcluidos + s.diasPendentes} dias lidos.</>}
          {' '}A palavra-chave procura no objeto, no órgão, na empresa, no título e no começo do texto de cada peça. O texto completo abre na hora, em “Ler peça”.
        </p>
      </div>

      <div role="status" aria-live="polite" className="mb-3">
        {q.isFetching ? <p className="text-sm text-muted-foreground">Pesquisando...</p>
          : q.isError ? (
            <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
              <p>{q.error.message}</p><Button tamanho="sm" variante="contorno" onClick={() => q.refetch()}>Tentar novamente</Button>
            </div>
          ) : <p className="text-sm font-medium">{total.toLocaleString('pt-BR')} {total === 1 ? 'peça encontrada' : 'peças encontradas'}</p>}
      </div>

      {!q.isFetching && !q.isError && lista.length === 0
        ? <Vazio icone={SearchX} titulo="Nenhuma peça encontrada" texto={s && s.pecas === 0 ? 'O índice ainda está sendo carregado. Volte em algumas horas.' : 'Tente outros termos, outro tipo de peça ou tire o filtro de órgão.'} />
        : <div className="space-y-3">{lista.map((p) => <CartaoPeca key={p.id} p={p} aoUsarModelo={aoUsarModelo} />)}</div>}

      {paginas > 1 && (
        <div className="mt-5 flex items-center justify-between gap-2">
          <Button variante="contorno" disabled={pagina <= 1 || q.isFetching} onClick={() => setPagina((x) => x - 1)}>Anterior</Button>
          <span className="text-sm">{pagina} / {paginas}</span>
          <Button variante="contorno" disabled={pagina >= paginas || q.isFetching} onClick={() => setPagina((x) => x + 1)}>Próxima</Button>
        </div>
      )}
    </>
  )
}

function CartaoPeca({ p, aoUsarModelo }: { p: PecaPublicada; aoUsarModelo: (p: PecaPublicada, texto: string) => void }) {
  const [aberto, setAberto] = useState(false)
  const temArquivo = !!p.arquivoUrl
  const leitura = useQuery({
    queryKey: ['peca-texto', p.arquivoUrl], enabled: aberto && temArquivo, staleTime: Infinity, retry: 1,
    queryFn: ({ signal }) => lerPeca(p.arquivoUrl!, signal),
  })
  const texto = temArquivo ? leitura.data?.texto ?? null : p.trecho
  const pr = p.processo
  const titulo = [pr.modalidade, pr.numero && `Nº ${pr.numero}`].filter(Boolean).join(' ')

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge cor={COR[p.tipo]}>{rotuloTipo(p.tipo)}</Badge>
        <Badge>{rotuloPapel(p)}</Badge>
        {pr.lei14133 === true && <Badge cor="verde">Lei 14.133</Badge>}
        {pr.lei14133 === false && <Badge>Lei anterior</Badge>}
        <span className="ml-auto text-xs text-muted-foreground">{p.data ? `Enviada em ${formatarData(p.data)} · ` : ''}{pr.sessao ? `Sessão em ${formatarData(pr.sessao)}` : ''}</span>
      </div>
      <h2 className="mt-2 break-words text-sm font-semibold sm:text-base">
        {p.titulo}{p.empresa ? <> · <span className="text-sky-700 dark:text-sky-300">{p.empresa}</span></> : null}{p.item ? <span className="font-normal text-muted-foreground"> · {p.item}</span> : null}
      </h2>
      <p className="mt-0.5 break-words text-sm">{titulo}{titulo ? ' – ' : ''}{pr.orgao}{pr.uf ? ` / ${pr.uf}` : ''}</p>
      {pr.objeto && <p className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">{pr.objeto}</p>}
      {!temArquivo && p.trecho && <p className="mt-2 rounded-lg border bg-muted/40 p-2.5 text-sm">{p.trecho}</p>}

      {aberto && temArquivo && (
        <div className="mt-3 rounded-lg border bg-muted/30">
          {leitura.isFetching ? <p className="p-3 text-sm text-muted-foreground">Abrindo o arquivo no portal...</p>
            : leitura.isError ? <p role="alert" className="p-3 text-sm text-destructive">{leitura.error.message}</p>
            : leitura.data?.texto ? (
              <>
                <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words p-3 font-serif text-[13px] leading-relaxed">{leitura.data.texto}</pre>
                {leitura.data.cortado && <p className="border-t px-3 py-2 text-xs text-muted-foreground">Mostrando as 40 primeiras páginas de {leitura.data.paginas}. O arquivo completo está no portal.</p>}
              </>
            ) : <p className="p-3 text-sm text-muted-foreground">{leitura.data?.motivo ?? 'Sem texto para mostrar.'}</p>}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {temArquivo && (
          <Button tamanho="sm" variante="contorno" onClick={() => setAberto((v) => !v)}>
            {aberto ? <><ChevronUp className="h-4 w-4" /> Fechar</> : <><BookOpen className="h-4 w-4" /> Ler peça</>}
          </Button>
        )}
        {(texto || !temArquivo) && (
          <Button tamanho="sm" disabled={!texto} onClick={() => texto && aoUsarModelo(p, texto)}>
            <FilePen className="h-4 w-4" /> Usar como modelo
          </Button>
        )}
        {temArquivo && <a href={p.arquivoUrl!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><Download className="h-4 w-4" />Baixar arquivo</a>}
        {pr.url && <a href={pr.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><ExternalLink className="h-4 w-4" />Abrir no portal</a>}
      </div>
    </Card>
  )
}
