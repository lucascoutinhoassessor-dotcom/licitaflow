import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CalendarClock, ExternalLink, FileText, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Card, Carregando, Vazio } from '@/components/ui'
import { SeletorEmpresa, useEmpresaPadrao } from '@/components/Situacoes'
import ItensAcordeao from '@/components/ItensAcordeao'
import { useOrg } from '@/providers/OrgProvider'
import { useLista, useSalvar } from '@/hooks/useDados'
import { dadosProcesso, linkCompra, type CompraPNCP } from '@/lib/pncp'
import { itensDoEdital } from '@/lib/itensIndice'
import { nomeModoDisputa } from '@/lib/filtrosOportunidades'
import { portalCompra, urlOrigem } from '@/lib/portais'
import { formatarDataHora, formatarMoeda, prazoRelativo } from '@/lib/format'
import type { Processo } from '@/types/db'

async function buscarCompra(cnpj: string, ano: string, seq: string, signal?: AbortSignal): Promise<CompraPNCP> {
  const r = await fetch(`https://pncp.gov.br/api/consulta/v1/orgaos/${encodeURIComponent(cnpj)}/compras/${encodeURIComponent(ano)}/${encodeURIComponent(seq)}`, { signal })
  if (!r.ok) throw new Error('Não foi possível abrir este edital na fonte oficial.')
  const c = await r.json()
  if (!c?.numeroControlePNCP || !c?.orgaoEntidade?.cnpj) throw new Error('A fonte retornou o edital em formato inesperado.')
  return c as CompraPNCP
}

export default function OportunidadeDetalhe() {
  const { cnpj = '', ano = '', seq = '' } = useParams()
  const local = useLocation()
  const estado = local.state as { compra?: CompraPNCP } | null
  const navigate = useNavigate()
  const { podeEditar } = useOrg()
  const padrao = useEmpresaPadrao()
  const [empresaId, setEmpresaId] = useState(padrao)
  const valida = /^\d{14}$/.test(cnpj) && /^\d{4}$/.test(ano) && /^\d+$/.test(seq)
  const compraEstado = estado?.compra && estado.compra.orgaoEntidade.cnpj === cnpj && String(estado.compra.anoCompra) === ano && String(estado.compra.sequencialCompra) === seq ? estado.compra : undefined
  const q = useQuery({ queryKey: ['oportunidade', cnpj, ano, seq], enabled: valida && !compraEstado, queryFn: ({ signal }) => buscarCompra(cnpj, ano, seq, signal), staleTime: 300_000, retry: 1 })
  const compra = compraEstado ?? q.data
  const itens = useQuery({ queryKey: ['itens-edital', compra?.numeroControlePNCP], enabled: !!compra, queryFn: ({ signal }) => itensDoEdital(compra!, signal), staleTime: 300_000, retry: 1 })
  const processos = useLista<Processo>('processos', { porEmpresa: false })
  const { salvar } = useSalvar('processos', ['processo_eventos', 'prazos'])
  // "Ver itens" na lista abre a página já na seção de itens.
  useEffect(() => {
    if (local.hash === '#itens' && itens.isSuccess) document.getElementById('itens')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [local.hash, itens.isSuccess])

  if (!valida) return <Vazio titulo="Edital não encontrado" texto="O endereço deste edital está incompleto." acao={<Link to="/app/oportunidades"><Button variante="contorno">Voltar às oportunidades</Button></Link>} />
  if (!compra) return q.isError ? <Vazio titulo="Não foi possível abrir o edital" texto={(q.error as Error).message} acao={<Button variante="contorno" onClick={() => q.refetch()}>Tentar novamente</Button>} /> : <Carregando />

  const existente = processos.data?.find((p) => p.empresa_id === (empresaId || padrao) && p.pncp_controle === compra.numeroControlePNCP)
  const origem = urlOrigem(compra)
  const modo = nomeModoDisputa(compra.modoDisputaId)
  async function adicionar() {
    const empresa = empresaId || padrao
    if (!empresa) { toast.error('Selecione a empresa.'); return }
    try { const p = await salvar.mutateAsync({ dados: dadosProcesso(compra!, empresa) }); toast.success('Edital adicionado aos processos.'); navigate(`/app/processos/${p.id}`) } catch { /* useSalvar mostra o erro */ }
  }

  return (
    <>
      <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/app/oportunidades'))} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar às oportunidades
      </button>

      <Card className="mb-5 p-5 text-center sm:p-8">
        <p className="text-sm font-semibold text-muted-foreground">{portalCompra(compra)[1]}</p>
        <h1 className="mt-1 text-lg font-bold sm:text-2xl">{compra.modalidadeNome} Nº {compra.numeroCompra}</h1>
        <p className="mt-1 text-sm font-semibold uppercase text-muted-foreground">{compra.orgaoEntidade.razaoSocial} · {compra.unidadeOrgao.municipioNome}/{compra.unidadeOrgao.ufSigla}</p>
        <p className="mx-auto mt-4 max-w-4xl whitespace-pre-wrap break-words text-sm font-medium sm:text-base">{compra.objetoCompra}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Badge cor="verde">{compra.valorTotalEstimado ? `Valor total estimado: ${formatarMoeda(compra.valorTotalEstimado)}` : 'Valor não divulgado'}</Badge>
          {compra.srp && <Badge cor="amarelo">Registro de preço</Badge>}
          {modo && <Badge>{modo}</Badge>}
        </div>
        {compra.dataEncerramentoProposta && (
          <p className="mt-4 flex items-center justify-center gap-2 font-semibold text-emerald-600 dark:text-emerald-400">
            <CalendarClock className="h-4 w-4" /> Abertura em {formatarDataHora(compra.dataEncerramentoProposta)}
            <span className="text-xs font-medium text-muted-foreground">{prazoRelativo(compra.dataEncerramentoProposta)}</span>
          </p>
        )}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {origem && <a href={origem} target="_blank" rel="noopener noreferrer"><Button variante="contorno" tamanho="sm"><ExternalLink className="h-4 w-4" />Acessar no portal</Button></a>}
          <a href={linkCompra(compra)} target="_blank" rel="noopener noreferrer"><Button variante="contorno" tamanho="sm"><FileText className="h-4 w-4" />Edital e arquivos (PNCP)</Button></a>
        </div>
      </Card>

      <Card className="mb-5 flex flex-col items-center gap-3 p-5 text-center">
        {existente ? (
          <>
            <p className="text-sm text-muted-foreground">Este edital já está nos seus processos.</p>
            <Link to={`/app/processos/${existente.id}`}><Button>Abrir processo</Button></Link>
          </>
        ) : podeEditar ? (
          <>
            <p className="text-sm text-muted-foreground">Para acompanhar prazos, itens e documentos deste edital, adicione-o aos seus processos.</p>
            <div className="w-full max-w-sm"><SeletorEmpresa id="detalhe-empresa" valor={empresaId || padrao} aoMudar={setEmpresaId} /></div>
            <Button onClick={adicionar} carregando={salvar.isPending} disabled={processos.isLoading}><Plus className="h-4 w-4" />Adicionar aos processos</Button>
          </>
        ) : <p className="text-sm text-muted-foreground">Peça a um administrador para adicionar este edital aos processos.</p>}
      </Card>

      <section id="itens">
        <h2 className="mb-3 text-lg font-semibold">Itens do edital</h2>
        {itens.isLoading ? <Carregando texto="Carregando itens…" /> : itens.isError ? (
          <Card className="p-5 text-sm">Não foi possível carregar os itens agora. <button className="font-semibold text-primary underline" onClick={() => itens.refetch()}>Tentar novamente</button></Card>
        ) : <ItensAcordeao itens={itens.data ?? []} tipoEdital={compra.materialOuServico} />}
      </section>
    </>
  )
}
