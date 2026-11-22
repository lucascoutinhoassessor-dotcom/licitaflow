import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarClock, Hash, Info, Package, SearchX } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Card, Input, Select, Vazio } from '@/components/ui'
import IconePortal from '@/components/IconePortal'
import CodigoComprasnet from '@/components/CodigoComprasnet'
import { codigoComprasnet, portalCompra } from '@/lib/portais'
import { rotaOportunidade } from '@/lib/pncp'
import { formatarData, formatarMoeda } from '@/lib/format'
import { editalDireto, localizarEdital, rotaEditalDireto, validarLocalizar } from '@/lib/localizar'

const CHAVE = 'lf-localizar-edital'
const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')
function lerSalvo(): { termo: string; uf: string } {
  try {
    const s = JSON.parse(sessionStorage.getItem(CHAVE) ?? 'null')
    if (s && typeof s.termo === 'string' && typeof s.uf === 'string') return s
  } catch { /* armazenamento indisponível */ }
  return { termo: '', uf: '' }
}

/** Acha um edital pelo número que o cliente já tem em mãos (número da compra, UASG, código do Compras.gov, CNPJ ou link). */
export default function LocalizarEdital() {
  const navigate = useNavigate()
  const [inicial] = useState(lerSalvo)
  const [termo, setTermo] = useState(inicial.termo), [uf, setUf] = useState(inicial.uf)
  const [consulta, setConsulta] = useState<{ termo: string; uf: string } | null>(inicial.termo ? inicial : null)
  const q = useQuery({
    queryKey: ['localizar-edital', consulta], enabled: !!consulta, retry: 1, staleTime: 5 * 60_000,
    queryFn: ({ signal }) => localizarEdital(consulta!.termo, consulta!.uf, signal),
  })
  function localizar(e: FormEvent) {
    e.preventDefault()
    const erro = validarLocalizar(termo)
    if (erro) { toast.error(erro); return }
    // Nº de controle ou link do PNCP abre o edital direto, mesmo que ainda não esteja no catálogo.
    const direto = editalDireto(termo)
    if (direto) { navigate(rotaEditalDireto(direto)); return }
    const nova = { termo: termo.trim(), uf }
    try { sessionStorage.setItem(CHAVE, JSON.stringify(nova)) } catch { /* armazenamento indisponível */ }
    if (JSON.stringify(nova) === JSON.stringify(consulta)) void q.refetch(); else setConsulta(nova)
  }
  const lista = q.data?.data ?? [], total = q.data?.total ?? 0
  return <>
    <Card className="mb-5 p-4">
      <form onSubmit={localizar} className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1"><Hash className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" aria-label="Número do edital" placeholder="Ex.: 90012/2026, UASG 160000, CNPJ do órgão ou link do PNCP" value={termo} onChange={(e) => setTermo(e.target.value)} maxLength={200} /></div>
          <Select className="sm:w-44" aria-label="UF" value={uf} onChange={(e) => setUf(e.target.value)}><option value="">Todas as UFs</option>{UFS.map((u) => <option key={u}>{u}</option>)}</Select>
          <Button type="submit" carregando={q.isFetching}>Localizar</Button>
        </div>
      </form>
    </Card>
    <div className="mb-4 flex gap-2.5 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <p>Aceita o <strong>número da compra</strong> (com ou sem o ano, ex.: 90012/2026), a <strong>UASG</strong> (6 dígitos), o <strong>código completo do Compras.gov</strong> (17 dígitos), o <strong>CNPJ do órgão</strong> e o <strong>número de controle ou link do PNCP</strong>, que abre o edital direto. A busca cobre os editais abertos e os encerrados há até 30 dias.</p>
    </div>
    {consulta && <div role="status" aria-live="polite" className="mb-4">
      {q.isFetching ? <p className="text-sm text-muted-foreground">Localizando...</p>
        : q.isError ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive"><p>{q.error.message}</p><Button tamanho="sm" variante="contorno" onClick={() => q.refetch()}>Tentar novamente</Button></div>
        : <p className="text-sm font-medium">{total} {total === 1 ? 'edital encontrado' : 'editais encontrados'}{total > lista.length ? ` · mostrando os ${lista.length} mais recentes` : ''}</p>}
    </div>}
    {consulta && !q.isFetching && !q.isError && lista.length === 0
      ? <Vazio icone={SearchX} titulo="Nenhum edital com esse número" texto="Confira o número e o ano, tente sem a UF ou cole o link do edital no PNCP." />
      : <div className="space-y-3">{lista.map((c) => {
        const encerrado = !!c.dataEncerramentoProposta && new Date(c.dataEncerramentoProposta) < new Date()
        return <Card key={c.numeroControlePNCP} className="p-4">
          <h2 className="line-clamp-2 break-words text-sm font-semibold sm:text-base"><Link to={rotaOportunidade(c)} state={{ compra: c }} className="text-sky-700 underline-offset-2 hover:underline dark:text-sky-300">{c.modalidadeNome} Nº {codigoComprasnet(c)?.numero ?? `${c.numeroCompra}/${c.anoCompra}`} – {c.orgaoEntidade.razaoSocial} / {c.unidadeOrgao.ufSigla}</Link></h2>
          <p className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">{c.objetoCompra}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Badge cor={encerrado ? 'neutro' : 'verde'}>{encerrado ? 'Sessão encerrada' : 'Recebendo propostas'}</Badge>
            <Badge>{c.valorTotalEstimado ? formatarMoeda(c.valorTotalEstimado) : 'Valor não divulgado'}</Badge>
            <Badge className="gap-1.5"><IconePortal id={portalCompra(c)[0]} nome={portalCompra(c)[1]} />{portalCompra(c)[1]}</Badge>
            <CodigoComprasnet compra={c} />
          </div>
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-muted-foreground" />Propostas até {formatarData(c.dataEncerramentoProposta)}</span>
            <Link to={`${rotaOportunidade(c)}#itens`} state={{ compra: c }} className="inline-flex h-8 items-center gap-2 rounded-full border border-input bg-card px-3.5 text-sm font-semibold hover:bg-muted"><Package className="h-4 w-4" />Ver itens</Link>
          </div>
        </Card>
      })}</div>}
  </>
}
