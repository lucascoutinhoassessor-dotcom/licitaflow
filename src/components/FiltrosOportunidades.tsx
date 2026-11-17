import { Button, Campo, Input, Select } from '@/components/ui'
import { MODALIDADES, filtrosExtras, type FiltrosOportunidades as Filtros } from '@/lib/filtrosOportunidades'
import { PORTAIS } from '@/lib/portais'
import type { CompraPNCP } from '@/lib/pncp'

export default function FiltrosOportunidades({ f, mudar, compras }: { f: Filtros; mudar: (f: Filtros) => void; compras: CompraPNCP[] }) {
  const set = (k: keyof Filtros, value: string | boolean | string[]) => mudar({...f,[k]:value})
  const marcar = (k: 'portais' | 'modalidades', id: string) => set(k,f[k].includes(id)?f[k].filter(x=>x!==id):[...f[k],id])
  const orgaos=[...new Map(compras.map(c=>[c.orgaoEntidade.cnpj,c.orgaoEntidade])).values()].sort((a,b)=>a.razaoSocial.localeCompare(b.razaoSocial))
  const checkbox = (k: 'naoDivulgado' | 'exclusivo' | 'excluirSrp', texto: string) => <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-primary" checked={f[k]} onChange={e=>set(k,e.target.checked)} />{texto}</label>
  return <div className="col-span-full space-y-3">
    <details className="rounded-lg border p-3" open><summary className="cursor-pointer font-medium">Portais de compras</summary>
      <p className="mt-2 text-xs text-muted-foreground">Filtra os registros publicados nas fontes oficiais pela identificação do portal de origem. A disponibilidade depende do que cada portal publica; esta seleção não representa conexão direta com suas contas.</p>
      <div className="my-3 flex flex-wrap gap-2">{PORTAIS.map(([id,nome])=><label key={id} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${f.portais.includes(id)?'border-primary bg-primary/10':''}`}><input type="checkbox" className="accent-primary" checked={f.portais.includes(id)} onChange={()=>marcar('portais',id)} />{nome}</label>)}</div>
      <div className="flex flex-wrap gap-4 text-sm"><button type="button" className="text-primary underline" onClick={()=>set('portais',PORTAIS.map(p=>p[0]))}>Marcar todos os portais</button><button type="button" className="text-primary underline" onClick={()=>set('portais',[])}>Desmarcar todos os portais</button></div>
    </details>
    <details className="rounded-lg border p-3" open><summary className="cursor-pointer font-medium">Modalidades</summary>
      <div className="my-3 flex flex-wrap gap-3">{MODALIDADES.map(([id,nome])=><label key={id} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" className="accent-primary" checked={f.modalidades.includes(id)} onChange={()=>marcar('modalidades',id)} />{nome}</label>)}</div>
      <p className="mb-3 text-xs text-muted-foreground">Dispensa inclui os registros divulgados nessa modalidade; confirme no edital se há disputa eletrônica.</p>
      <div className="flex flex-wrap gap-4 text-sm"><button type="button" className="text-primary underline" onClick={()=>set('modalidades',MODALIDADES.map(m=>m[0]))}>Marcar todas as modalidades</button><button type="button" className="text-primary underline" onClick={()=>set('modalidades',[])}>Desmarcar todas as modalidades</button></div>
    </details>
    <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">Órgãos e valores</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Órgão nos registros carregados" htmlFor="oportunidade-orgao"><Select id="oportunidade-orgao" value={f.orgao} onChange={e=>set('orgao',e.target.value)}><option value="">Todos os órgãos</option>{f.orgao && !orgaos.some(o=>o.cnpj===f.orgao) && <option value={f.orgao}>{f.orgao}</option>}{orgaos.map(o=><option key={o.cnpj} value={o.cnpj}>{o.razaoSocial} · {o.cnpj}</option>)}</Select></Campo>
        <Campo rotulo="Quantidade máxima de itens do edital" htmlFor="oportunidade-maxItens"><Input id="oportunidade-maxItens" type="number" min="1" step="1" value={f.maxItens} onChange={e=>set('maxItens',e.target.value)} /></Campo>
        {([['minimo','Valor total mínimo (R$)'],['maximo','Valor total máximo (R$)'],['itemMinimo','Valor unitário mínimo do item (R$)'],['itemMaximo','Valor unitário máximo do item (R$)']] as const).map(([k,t])=><Campo key={k} rotulo={t} htmlFor={`oportunidade-${k}`}><Input id={`oportunidade-${k}`} type="number" min="0" step="0.01" disabled={f.naoDivulgado && (k==='minimo'||k==='maximo')} value={f[k]} onChange={e=>set(k,e.target.value)} /></Campo>)}
      </div>
      <div className="mt-4">{checkbox('naoDivulgado','Somente compras com valor total não divulgado ou zerado')}</div>
      <p className="mt-2 text-xs text-muted-foreground">Faixas monetárias consideram somente valores positivos divulgados. Valor ausente ou zerado não comprova sigilo. Filtros de item consultam o detalhamento e podem levar mais tempo.</p>
    </details>
    <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">Outros filtros</summary><div className="mt-3 flex flex-wrap gap-5">{checkbox('exclusivo','Com item exclusivo para ME/EPP')}{checkbox('excluirSrp','Excluir registro de preços')}</div><p className="mt-2 text-xs text-muted-foreground">ME/EPP e faixa unitária devem corresponder ao mesmo item. O benefício não comprova exclusividade de todos os itens do edital.</p></details>
    <p className="text-xs text-muted-foreground">Cada página carrega até 50 publicações por modalidade. Portal, órgão, palavras-chave, valores e itens filtram esse lote. Use Próxima para consultar os demais registros.</p>
    <Button type="button" variante="contorno" tamanho="sm" onClick={()=>mudar({...f,...filtrosExtras,orgao:''})}>Limpar filtros adicionais</Button>
  </div>
}
