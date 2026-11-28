import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarClock, ExternalLink, Info, MapPin, Search, SearchX, Sparkles } from 'lucide-react'
import MenuFiltros, { ChipFiltro, SecaoFiltro } from '@/components/MenuFiltros'
import { Badge, Card, Input, Vazio } from '@/components/ui'
import IconePortal from '@/components/IconePortal'
import Paginacao, { POR_PAGINA } from '@/components/Paginacao'
import ContagemDisputa from '@/components/ContagemDisputa'
import { buscarIminencia, filtrarIminencia } from '@/lib/iminencia'

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')
const GRUPOS = ['Pregão', 'Dispensa', 'Concorrência', 'Credenciamento', 'Leilão', 'Outras']
const CHAVE = 'lf-iminencia-filtros'
function lerSalvo() {
  try { const s = JSON.parse(sessionStorage.getItem(CHAVE) ?? 'null'); if (s && typeof s.busca === 'string') return s as { busca: string; uf: string; modalidade: string } } catch { /* sem armazenamento */ }
  return { busca: '', uf: '', modalidade: '' }
}

/**
 * Processos do Portal de Compras Públicas ainda recebendo propostas e sem nenhuma proposta cadastrada
 * ("iminência de deserto", marcação do próprio PCP). Quem entrar pode ser o único participante.
 */
export default function IminenciaDeserto() {
  const [f, setF] = useState(lerSalvo)
  const [pagina, setPagina] = useState(1)
  const mudar = (novo: typeof f) => { setF(novo); setPagina(1); try { sessionStorage.setItem(CHAVE, JSON.stringify(novo)) } catch { /* sem armazenamento */ } }
  const q = useQuery({ queryKey: ['pcp-iminencia'], staleTime: 2 * 60_000, refetchInterval: 5 * 60_000, retry: 1, queryFn: ({ signal }) => buscarIminencia(signal) })
  const lista = useMemo(() => filtrarIminencia(q.data?.processos ?? [], f), [q.data, f])
  const totalPaginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA))
  const pag = Math.min(pagina, totalPaginas)
  const ativos = (f.uf ? 1 : 0) + (f.modalidade ? 1 : 0)

  return <>
    <Card className="mb-5 space-y-3 p-4">
      <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
        <p><span className="font-semibold">Nenhuma proposta cadastrada até agora.</span> O Portal de Compras Públicas marca estes processos como "iminência de deserto": quem enviar proposta pode ser o único participante. A lista é conferida no portal a cada ~15 minutos e sai daqui quando alguém propõe ou a sessão abre.</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" aria-label="Filtrar processos sem propostas" placeholder="O que sua empresa vende? Ex.: pneus; hidrômetro" value={f.busca} maxLength={300} onChange={(e) => mudar({ ...f, busca: e.target.value })} /></div>
        <MenuFiltros colunas={2} ativos={ativos} aoLimpar={() => mudar({ ...f, uf: '', modalidade: '' })}>
          <SecaoFiltro icone={MapPin} cor="azul" titulo="Estado do órgão" descricao={f.uf ? `Só ${f.uf}` : 'Brasil inteiro'}>
            <div className="grid grid-cols-6 gap-1.5"><ChipFiltro ativo={!f.uf} onClick={() => mudar({ ...f, uf: '' })} className="col-span-2 rounded-md">Todos</ChipFiltro>
              {UFS.map((u) => <ChipFiltro key={u} ativo={f.uf === u} onClick={() => mudar({ ...f, uf: f.uf === u ? '' : u })} className="rounded-md px-1">{u}</ChipFiltro>)}</div>
          </SecaoFiltro>
          <SecaoFiltro icone={CalendarClock} cor="violeta" titulo="Modalidade" descricao={f.modalidade || 'Todas'}>
            <div className="grid grid-cols-3 gap-1.5"><ChipFiltro ativo={!f.modalidade} onClick={() => mudar({ ...f, modalidade: '' })} className="rounded-md">Todas</ChipFiltro>
              {GRUPOS.map((g) => <ChipFiltro key={g} ativo={f.modalidade === g} onClick={() => mudar({ ...f, modalidade: f.modalidade === g ? '' : g })} className="rounded-md">{g}</ChipFiltro>)}</div>
          </SecaoFiltro>
        </MenuFiltros>
      </div>
    </Card>

    {q.isLoading ? <Card className="p-6 text-sm text-muted-foreground">Carregando processos sem propostas…</Card>
      : q.isError ? <Card className="p-4 text-sm text-destructive">{(q.error as Error).message}</Card>
      : !q.data?.processos.length ? <Vazio icone={SearchX} titulo="Lista ainda sendo preparada" texto="A primeira leitura do Portal de Compras Públicas leva cerca de 15 minutos. Volte em instantes." />
      : !lista.length ? <Vazio icone={SearchX} titulo="Nenhum processo com esses filtros" texto="Tire alguma palavra ou filtro." />
      : <>
        <p className="mb-3 text-sm text-muted-foreground"><span className="font-semibold text-foreground">{lista.length}</span> {lista.length === 1 ? 'processo sem propostas' : 'processos sem propostas'} no Portal de Compras Públicas · sessões mais próximas primeiro</p>
        <div className="space-y-3">{lista.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA).map((p) => (
          <Card key={p.link} className="p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <IconePortal id="pcp" nome="Portal de Compras Públicas" />
              <span className="font-semibold text-muted-foreground">Portal de Compras Públicas</span>
              <Badge cor="verde">Sem propostas</Badge>
              {p.situacao && <Badge cor="neutro">{p.situacao}</Badge>}
            </div>
            <a href={p.link} target="_blank" rel="noopener noreferrer" className="mt-2 block font-semibold text-sky-600 hover:underline dark:text-sky-400">
              {p.modalidade ?? 'Processo'} Nº {p.numero}{p.comprador ? ` – ${p.comprador}` : ''}{p.uf ? ` / ${p.uf}` : ''}
            </a>
            {p.objeto && <p className="mt-1 text-sm text-muted-foreground">{p.objeto}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <ContagemDisputa data={p.abertura} prefixo="Abertura em" />
              <a href={p.link} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">Abrir no portal <ExternalLink className="h-4 w-4" /></a>
            </div>
          </Card>
        ))}</div>
        <Paginacao pagina={pag} totalPaginas={totalPaginas} aoMudar={setPagina} />
        <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />Fonte: busca pública do Portal de Compras Públicas (status "iminência de deserto"){q.data.lidoEm ? `, conferida em ${new Date(q.data.lidoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}` : ''}. Para participar é preciso estar cadastrado no portal.</p>
      </>}
  </>
}
