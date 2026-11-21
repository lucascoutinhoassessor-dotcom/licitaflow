import type React from 'react'
import { Button, Campo, Input, Select } from '@/components/ui'
import { MODALIDADES, MODOS_DISPUTA, TIPOS_ITEM, filtrosExtras, type FiltrosOportunidades as Filtros } from '@/lib/filtrosOportunidades'
import { PORTAIS } from '@/lib/portais'
import IconePortal from '@/components/IconePortal'
import type { CompraPNCP } from '@/lib/pncp'

/** Botão que liga/desliga um filtro (no lugar da caixa de marcar). */
function Pilula({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={ativo} onClick={onClick}
    className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${ativo ? 'border-emerald-600 bg-emerald-600 text-white shadow-[0_8px_20px_-12px_rgba(16,185,129,0.9)]' : 'bg-card text-muted-foreground hover:border-emerald-500/50 hover:text-foreground'}`}>{children}</button>
}

export default function FiltrosOportunidades({ f, mudar, compras, orgaos: opcoes }: { f: Filtros; mudar: (f: Filtros) => void; compras: CompraPNCP[]; orgaos?: {cnpj:string;razaoSocial:string}[] }) {
  const set = (k: keyof Filtros, value: string | boolean | string[]) => mudar({...f,[k]:value})
  const marcar = (k: 'portais' | 'modalidades', id: string) => set(k,f[k].includes(id)?f[k].filter(x=>x!==id):[...f[k],id])
  const orgaos=opcoes??[...new Map(compras.map(c=>[c.orgaoEntidade.cnpj,c.orgaoEntidade])).values()].sort((a,b)=>a.razaoSocial.localeCompare(b.razaoSocial))
  const checkbox = (k: 'naoDivulgado' | 'exclusivo' | 'excluirSrp', texto: string) => <Pilula ativo={f[k]} onClick={()=>set(k,!f[k])}>{texto}</Pilula>
  const alternarModo = (id: string) => set('modosDisputa', f.modosDisputa.includes(id) ? f.modosDisputa.filter(x=>x!==id) : [...f.modosDisputa,id])
  return <div className="col-span-full space-y-3">
    <details open className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">Palavras, tipo e modo de disputa</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Excluir editais com estas palavras" htmlFor="oportunidade-excluir" ajuda='Separe por ";" (ex.: locação; manutenção).'><Input id="oportunidade-excluir" maxLength={300} value={f.excluir} onChange={e=>set('excluir',e.target.value)} placeholder="locação; manutenção" /></Campo>
        <Campo rotulo="Tipo de item" htmlFor="oportunidade-tipo" ajuda="Pelos itens do edital ou, enquanto os itens não chegam, pelo objeto (marcado como estimado).">
          <Select id="oportunidade-tipo" value={f.tipoItem} onChange={e=>set('tipoItem',e.target.value)}>{TIPOS_ITEM.map(([id,nome])=><option key={id} value={id}>{nome}</option>)}</Select>
        </Campo>
      </div>
      <p className="mt-3 text-sm font-medium">Modo de disputa</p>
      <div className="mt-2 flex flex-wrap gap-2">{MODOS_DISPUTA.map(([id,nome])=><Pilula key={id} ativo={f.modosDisputa.includes(id)} onClick={()=>alternarModo(id)}>{nome}</Pilula>)}</div>
      <p className="mt-2 text-xs text-muted-foreground">Nenhum modo marcado = todos. Na busca principal, separe termos por ";" para encontrar editais com qualquer um deles (ex.: notebook; computador).</p>
    </details>
    <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">Portais de compras</summary>
      <p className="mt-2 text-xs text-muted-foreground">Filtra os registros publicados nas fontes oficiais pela identificação do portal de origem. A disponibilidade depende do que cada portal publica; esta seleção não representa conexão direta com suas contas.</p>
      <div className="my-3 flex flex-wrap gap-2">{PORTAIS.map(([id,nome])=><Pilula key={id} ativo={f.portais.includes(id)} onClick={()=>marcar('portais',id)}><IconePortal id={id} nome={nome} />{nome}</Pilula>)}</div>
      <div className="flex flex-wrap gap-4 text-sm"><button type="button" className="text-primary underline" onClick={()=>set('portais',PORTAIS.map(p=>p[0]))}>Marcar todos os portais</button><button type="button" className="text-primary underline" onClick={()=>set('portais',[])}>Desmarcar todos os portais</button></div>
    </details>
    <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">Modalidades</summary>
      <div className="my-3 flex flex-wrap gap-3">{MODALIDADES.map(([id,nome])=><Pilula key={id} ativo={f.modalidades.includes(id)} onClick={()=>marcar('modalidades',id)}>{nome}</Pilula>)}</div>
      <p className="mb-3 text-xs text-muted-foreground">Dispensa inclui os registros divulgados nessa modalidade; confirme no edital se há disputa eletrônica.</p>
      <div className="flex flex-wrap gap-4 text-sm"><button type="button" className="text-primary underline" onClick={()=>set('modalidades',MODALIDADES.map(m=>m[0]))}>Marcar todas as modalidades</button><button type="button" className="text-primary underline" onClick={()=>set('modalidades',[])}>Desmarcar todas as modalidades</button></div>
    </details>
    <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">Órgãos e valores</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Órgão encontrado na consulta" htmlFor="oportunidade-orgao"><Select id="oportunidade-orgao" value={f.orgao} onChange={e=>set('orgao',e.target.value)}><option value="">Todos os órgãos</option>{f.orgao && !orgaos.some(o=>o.cnpj===f.orgao) && <option value={f.orgao}>{f.orgao}</option>}{orgaos.map(o=><option key={o.cnpj} value={o.cnpj}>{o.razaoSocial} · {o.cnpj}</option>)}</Select></Campo>
        <Campo rotulo="Quantidade máxima de itens do edital" htmlFor="oportunidade-maxItens"><Input id="oportunidade-maxItens" type="number" min="1" step="1" value={f.maxItens} onChange={e=>set('maxItens',e.target.value)} /></Campo>
        {([['minimo','Valor total mínimo (R$)'],['maximo','Valor total máximo (R$)'],['itemMinimo','Valor unitário mínimo do item (R$)'],['itemMaximo','Valor unitário máximo do item (R$)']] as const).map(([k,t])=><Campo key={k} rotulo={t} htmlFor={`oportunidade-${k}`}><Input id={`oportunidade-${k}`} type="number" min="0" step="0.01" disabled={f.naoDivulgado && (k==='minimo'||k==='maximo')} value={f[k]} onChange={e=>set(k,e.target.value)} /></Campo>)}
      </div>
      <div className="mt-4">{checkbox('naoDivulgado','Somente compras com valor total não divulgado ou zerado')}</div>
      <p className="mt-2 text-xs text-muted-foreground">Faixas monetárias consideram somente valores positivos divulgados. Valor ausente ou zerado não comprova sigilo. Filtros de item consultam o detalhamento e podem levar mais tempo.</p>
    </details>
    <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">Outros filtros</summary><div className="mt-3 flex flex-wrap gap-5">{checkbox('exclusivo','Com item exclusivo para ME/EPP')}{checkbox('excluirSrp','Excluir registro de preços')}</div><p className="mt-2 text-xs text-muted-foreground">ME/EPP e faixa unitária devem corresponder ao mesmo item. O benefício não comprova exclusividade de todos os itens do edital.</p></details>
    <p className="text-xs text-muted-foreground">Os filtros são aplicados na base pesquisável antes da paginação dos resultados.</p>
    <Button type="button" variante="contorno" tamanho="sm" onClick={()=>mudar({...f,...filtrosExtras,busca:f.busca,orgao:''})}>Limpar filtros adicionais</Button>
  </div>
}
