import { useEffect, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Radar } from 'lucide-react'
import { toast } from 'sonner'
import { Button, CabecalhoPagina, Campo, Card, Carregando, Input, Select, Vazio } from '@/components/ui'
import { SeletorEmpresa, useEmpresaPadrao } from '@/components/Situacoes'
import { useOrg } from '@/providers/OrgProvider'
import { useLista, useSalvar } from '@/hooks/useDados'
import { dadosProcesso, linkCompra, type CompraPNCP } from '@/lib/pncp'
import { buscarOportunidades, filtrosExtras, validarFiltros, type FiltrosOportunidades as Filtros } from '@/lib/filtrosOportunidades'
import FiltrosOportunidades from '@/components/FiltrosOportunidades'
import { portalCompra, urlOrigem } from '@/lib/portais'
import { formatarData, formatarMoeda } from '@/lib/format'
import type { Processo } from '@/types/db'

function dataLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Oportunidades() {
  const { podeEditar, empresa } = useOrg()
  const padrao = useEmpresaPadrao()
  const [empresaId, setEmpresaId] = useState(padrao)
  useEffect(() => setEmpresaId(padrao), [padrao])
  const [f, setF] = useState<Filtros>(() => {
    const hoje = new Date(), inicio = new Date()
    inicio.setDate(inicio.getDate() - 7)
    return { inicio: dataLocal(inicio), fim: dataLocal(hoje), ...filtrosExtras, modalidade: '6', uf: empresa?.uf ?? '' }
  })
  const [consulta, setConsulta] = useState<Filtros | null>(null)
  const [pagina, setPagina] = useState(1)
  const navigate = useNavigate()
  const processos = useLista<Processo>('processos', { porEmpresa: false })
  const { salvar } = useSalvar('processos', ['processo_eventos', 'prazos'])
  const q = useQuery({
    queryKey: ['pncp-publicacoes', consulta, pagina], enabled: !!consulta,
    queryFn: ({ signal }) => buscarOportunidades(consulta!, pagina, signal), retry: 1, staleTime: 300_000,
  })
  const set = (k: keyof Filtros) => (e: { target: { value: string } }) => setF(x => ({ ...x, [k]: e.target.value }))
  const lista = q.data?.data ?? []

  async function importar(c: CompraPNCP) {
    if (!empresaId) return toast.error('Selecione a empresa que participará do processo.')
    try {
      const p = await salvar.mutateAsync({ dados: dadosProcesso(c, empresaId) })
      toast.success('Oportunidade importada para Processos.')
      navigate(`/app/processos/${p.id}`)
    } catch { /* useSalvar apresenta o erro */ }
  }

  return <>
    <CabecalhoPagina titulo="Oportunidades" descricao="Busque oportunidades nos portais de compras e leve os editais de interesse para o seu funil de processos." />
    <Card className="mb-5 p-4">
      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={(e: FormEvent) => { e.preventDefault(); try { validarFiltros(f) } catch (erro) { toast.error((erro as Error).message); return }; setPagina(1); setConsulta({ ...f }); if (consulta && JSON.stringify(f) === JSON.stringify(consulta) && pagina === 1) void q.refetch() }}>
        <Campo rotulo="Publicação desde" htmlFor="pncp-inicio"><Input id="pncp-inicio" type="date" required value={f.inicio} max={f.fim} onChange={set('inicio')} /></Campo>
        <Campo rotulo="Publicação até" htmlFor="pncp-fim"><Input id="pncp-fim" type="date" required min={f.inicio} value={f.fim} onChange={set('fim')} /></Campo>
        <Campo rotulo="UF" htmlFor="pncp-uf"><Select id="pncp-uf" value={f.uf} onChange={set('uf')}><option value="">Todas</option>{'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ').map(u => <option key={u}>{u}</option>)}</Select></Campo>
        <Campo rotulo="Palavras-chave no lote de resultados" htmlFor="oportunidade-busca"><Input id="oportunidade-busca" value={f.busca} onChange={set('busca')} placeholder="Objeto, número ou órgão" /></Campo>
        <FiltrosOportunidades f={f} mudar={setF} compras={q.data?.compras ?? []} />
        <Button className="col-span-full sm:justify-self-end" type="submit" carregando={q.isFetching}>Buscar oportunidades</Button>
      </form>
    </Card>
    {consulta && <div className="mb-4 space-y-3">
      {podeEditar && <SeletorEmpresa id="pncp-empresa" valor={empresaId} aoMudar={setEmpresaId} />}
    </div>}
    {q.isError ? <Card role="alert" className="p-5"><p>{q.error.message}</p><Button className="mt-3" variante="contorno" onClick={() => q.refetch()}>Tentar novamente</Button></Card>
      : q.isFetching ? <Carregando />
      : !consulta ? <Vazio icone={Radar} titulo="Encontre a próxima oportunidade" texto="Escolha o período de publicação, a modalidade e a UF para consultar a fonte oficial. A busca é manual, sem alertas automáticos nesta etapa." />
      : <>
        <p className="mb-3 text-sm text-muted-foreground">{q.data?.totalRegistros ?? 0} publicação(ões) para o período, UF e modalidades · {lista.length} exibida(s) nesta página</p>
        {lista.length === 0 ? <Vazio titulo="Nenhuma oportunidade encontrada" texto="Altere os filtros ou o termo de busca nesta página." /> : <div className="space-y-3">{lista.map(c => {
          const existente = processos.data?.find(p => p.empresa_id === empresaId && p.pncp_controle === c.numeroControlePNCP)
          return <Card key={c.numeroControlePNCP} className="space-y-3 p-5">
            <div className="text-xs text-muted-foreground">{c.modalidadeNome} · {c.numeroCompra} · {c.unidadeOrgao.municipioNome}/{c.unidadeOrgao.ufSigla}</div>
            <h2 className="font-semibold">{c.objetoCompra}</h2>
            <p className="text-sm text-muted-foreground">{c.orgaoEntidade.razaoSocial} · Origem: {portalCompra(c)[1]}</p>
            <div className="flex flex-wrap gap-4 text-sm"><span>Estimativa: {c.valorTotalEstimado ? formatarMoeda(c.valorTotalEstimado) : 'Não informada'}</span><span>Publicação: {formatarData(c.dataPublicacaoPncp)}</span><span>Propostas até: {formatarData(c.dataEncerramentoProposta)}</span></div>
            <div className="flex flex-wrap items-center gap-4">
              <a className="text-sm text-primary hover:underline" href={linkCompra(c)} target="_blank" rel="noopener noreferrer">Ver edital oficial</a>
              {urlOrigem(c) && <a className="text-sm text-primary hover:underline" href={urlOrigem(c)!} target="_blank" rel="noopener noreferrer">Abrir portal de origem</a>}
              {existente ? <Link className="text-sm text-primary hover:underline" to={`/app/processos/${existente.id}`}>Abrir processo importado</Link> : podeEditar && <Button tamanho="sm" variante="contorno" disabled={!empresaId || processos.isLoading || processos.isError || salvar.isPending} onClick={() => importar(c)}>Importar para Processos</Button>}
            </div>
          </Card>
        })}</div>}
        {processos.isError && <p role="alert" className="mt-3 text-sm text-destructive">Não foi possível verificar os processos existentes. <button className="underline" onClick={() => processos.refetch()}>Tentar novamente</button></p>}
        {(q.data?.totalPaginas ?? 0) > 1 && <div className="mt-5 flex items-center justify-between gap-2">
          <Button variante="contorno" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}>Anterior</Button><span className="text-sm">Página {pagina} de {q.data?.totalPaginas}</span><Button variante="contorno" disabled={pagina >= (q.data?.totalPaginas ?? 0)} onClick={() => setPagina(p => p + 1)}>Próxima</Button>
        </div>}
      </>}
  </>
}
