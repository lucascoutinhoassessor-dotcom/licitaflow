import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Package, ExternalLink } from 'lucide-react'
import { Button, Input, Select, Carregando } from '@/components/ui'
import { itensDoEdital } from '@/lib/itensIndice'
import { agruparItens, identificacaoGrupo, valorItem } from '@/lib/itensEdital'
import { normalizar, urlOrigem } from '@/lib/portais'
import { linkCompra, type CompraPNCP } from '@/lib/pncp'

export default function ItensEdital({ compra }: {compra:CompraPNCP}) {
  const [aberto,setAberto]=useState(false),[busca,setBusca]=useState(''),[por,setPor]=useState<'item'|'grupo'|'lote'>('item')
  const q=useQuery({queryKey:['itens-edital',compra.numeroControlePNCP],enabled:aberto,queryFn:({signal})=>itensDoEdital(compra,signal),staleTime:300_000,retry:1})
  const lista=(q.data??[]).filter(i=>normalizar(`${i.numeroItem} ${i.descricao??''}`).includes(normalizar(busca.trim())))
  const grupos=por==='item'?new Map([['Itens',lista]]):agruparItens(lista,por)
  const temGrupos=por!=='item' && (q.data??[]).some(i=>identificacaoGrupo(i,por))
  return <Dialog.Root open={aberto} onOpenChange={setAberto}>
    <Dialog.Trigger asChild><Button variante="contorno" tamanho="sm"><Package className="h-4 w-4" />Ver itens</Button></Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
      <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[94dvh] min-w-0 flex-col rounded-t-xl border bg-card shadow-xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100%-2rem)] sm:max-w-3xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl">
        <div className="shrink-0 border-b p-4 sm:px-6"><div className="flex items-center justify-between gap-3"><Dialog.Title className="text-lg font-semibold">Itens do edital · {compra.numeroCompra}</Dialog.Title><Dialog.Close asChild><Button variante="fantasma" tamanho="icone" aria-label="Fechar itens"><X className="h-5 w-5" /></Button></Dialog.Close></div><Dialog.Description className="mt-1 text-sm text-muted-foreground">{compra.orgaoEntidade.razaoSocial} · {compra.modalidadeNome}{compra.srp===true?' · Registro de preços':''}</Dialog.Description></div>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:px-6">
          <p className="mb-4 line-clamp-3 text-sm">{compra.objetoCompra}</p>
          <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_160px]"><Input aria-label="Buscar item" placeholder="Descrição ou número do item" value={busca} onChange={e=>setBusca(e.target.value)} /><Select aria-label="Visualização dos itens" value={por} onChange={e=>setPor(e.target.value as typeof por)}><option value="item">Por item</option><option value="grupo">Por grupo</option><option value="lote">Por lote</option></Select></div>
          {q.isFetching ? <Carregando /> : q.isError ? <div role="alert" className="space-y-3"><p className="text-sm">Não foi possível carregar os itens. A consulta do edital continua disponível no portal de origem.</p><Button variante="contorno" onClick={()=>q.refetch()}>Tentar novamente</Button></div> : <>
            <p className="mb-3 text-xs text-muted-foreground">{q.data?.length??0} itens publicados · {lista.length} exibidos</p>
            {por!=='item' && !temGrupos && <p className="mb-3 rounded-lg bg-muted p-3 text-sm">A fonte não informou a divisão por {por==='grupo'?'grupo':'lote'}. Os itens estão listados abaixo; confirme o agrupamento no edital original.</p>}
            {lista.length===0 && <p className="py-5 text-sm text-muted-foreground">{q.data?.length?'Nenhum item corresponde à busca.':'A fonte não disponibilizou itens para este edital.'}</p>}
            <div className="space-y-4">{[...grupos].map(([nome,itens])=><section key={nome}>
              {por!=='item' && <h3 className="mb-2 text-sm font-semibold">{nome} · {itens.length} {itens.length===1?'item':'itens'}</h3>}
              <div className="space-y-2">{itens.map(i=><article key={i.numeroItem} className="rounded-lg border p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs"><span className="font-semibold">Item {i.numeroItem}</span>{i.orcamentoSigiloso && <span className="rounded bg-amber-500/10 px-2 py-1 text-amber-700">Orçamento sigiloso</span>}{i.tipoBeneficioNome && <span className="text-muted-foreground">{i.tipoBeneficioNome}</span>}</div>
                <p className="whitespace-pre-wrap break-words text-sm">{i.descricao||'Descrição não informada pela fonte.'}</p>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3"><div><dt className="text-muted-foreground">Quantidade</dt><dd className="mt-1 font-medium">{typeof i.quantidade==='number'?i.quantidade.toLocaleString('pt-BR'):'Não informada'} {i.unidadeMedida??''}</dd></div><div><dt className="text-muted-foreground">Estimativa unitária</dt><dd className="mt-1 font-medium">{valorItem(i)}</dd></div><div><dt className="text-muted-foreground">Estimativa total</dt><dd className="mt-1 font-medium">{valorItem(i,true)}</dd></div></dl>
                {(i.criterioJulgamentoNome||i.situacaoCompraItemNome) && <p className="mt-2 text-xs text-muted-foreground">{[i.criterioJulgamentoNome,i.situacaoCompraItemNome].filter(Boolean).join(' · ')}</p>}
              </article>)}</div>
            </section>)}</div>
          </>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-4 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-sm sm:px-6"><a className="inline-flex items-center gap-1 text-primary hover:underline" href={linkCompra(compra)} target="_blank" rel="noopener noreferrer">Edital oficial<ExternalLink className="h-3 w-3" /></a>{urlOrigem(compra)&&<a className="text-primary hover:underline" href={urlOrigem(compra)!} target="_blank" rel="noopener noreferrer">Portal de origem</a>}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
