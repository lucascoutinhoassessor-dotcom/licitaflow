import { Banknote, Gavel, Globe, Landmark, Sparkles, Type } from 'lucide-react'
import { Campo, Input, Select } from '@/components/ui'
import { MODALIDADES, MODOS_DISPUTA, TIPOS_ITEM, type FiltrosOportunidades as Filtros } from '@/lib/filtrosOportunidades'
import { PORTAIS } from '@/lib/portais'
import IconePortal from '@/components/IconePortal'
import type { CompraPNCP } from '@/lib/pncp'
import { FiltroLiberado as F, useAlgumFiltroVisivel } from '@/components/FiltroLiberado'
import { AcaoSecao, ChipFiltro, SecaoFiltro } from '@/components/MenuFiltros'
import { useFiltrosLiberados } from '@/hooks/useModulos'
import { estadoModalidade } from '@/lib/filtrosLiberacao'

/** Filtros adicionais de Oportunidades, em seções do menu Filtros. Cada um aparece conforme o master liberou em Funcionalidades. */
/** aoAbrirOrgaos: a lista de órgãos da base rápida só é pedida quando o seletor abre (economiza a cota do Turso). */
export default function FiltrosOportunidades({ f, mudar, compras, orgaos: opcoes, aoAbrirOrgaos, carregandoOrgaos }: { f: Filtros; mudar: (f: Filtros) => void; compras: CompraPNCP[]; orgaos?: {cnpj:string;razaoSocial:string}[]; aoAbrirOrgaos?: () => void; carregandoOrgaos?: boolean }) {
  const set = (k: keyof Filtros, value: string | boolean | string[]) => mudar({...f,[k]:value})
  const marcar = (k: 'portais' | 'modalidades' | 'modosDisputa', id: string) => set(k,f[k].includes(id)?f[k].filter(x=>x!==id):[...f[k],id])
  const orgaos=opcoes??[...new Map(compras.map(c=>[c.orgaoEntidade.cnpj,c.orgaoEntidade])).values()].sort((a,b)=>a.razaoSocial.localeCompare(b.razaoSocial))
  const alternar = (k: 'naoDivulgado' | 'exclusivo' | 'excluirSrp', texto: string) => <ChipFiltro ativo={f[k]} onClick={()=>set(k,!f[k])} className="w-full justify-start rounded-md px-3 text-left">{texto}</ChipFiltro>
  const visivel = useAlgumFiltroVisivel()
  const { estados } = useFiltrosLiberados()
  // Só as modalidades que o master liberou para este cliente; em breve aparece desativada.
  const modalidades = MODALIDADES.map(([id,nome])=>({id,nome,estado:estadoModalidade(estados,id)})).filter(m=>m.estado!=='oculto')
  return <>
    {visivel('filtro-excluir-palavras','filtro-tipo-item')&&<SecaoFiltro icone={Type} cor="azul" titulo="Palavras e tipo de item" descricao='Na busca principal, separe termos por ";" para achar qualquer um deles'>
      <F id="filtro-tipo-item"><div className="grid grid-cols-3 gap-1.5">{TIPOS_ITEM.map(([id,nome])=><ChipFiltro key={id} ativo={f.tipoItem===id} onClick={()=>set('tipoItem',id)} className="rounded-md leading-tight">{nome.replace('Somente ','Só ')}</ChipFiltro>)}</div></F>
      <F id="filtro-excluir-palavras" className="mt-2"><Campo rotulo="Excluir editais com estas palavras" htmlFor="oportunidade-excluir" ajuda='Separe por ";" (ex.: locação; manutenção).'><Input id="oportunidade-excluir" maxLength={300} value={f.excluir} onChange={e=>set('excluir',e.target.value)} placeholder="locação; manutenção" /></Campo></F>
    </SecaoFiltro>}
    <F id="filtro-modo-disputa"><SecaoFiltro icone={Gavel} cor="violeta" titulo="Modo de disputa" descricao="Nenhum marcado = todos">
      <div className="grid grid-cols-2 gap-1.5">{MODOS_DISPUTA.map(([id,nome])=><ChipFiltro key={id} ativo={f.modosDisputa.includes(id)} onClick={()=>marcar('modosDisputa',id)} className="rounded-md">{nome}</ChipFiltro>)}</div>
    </SecaoFiltro></F>
    <F id="filtro-portais"><SecaoFiltro icone={Globe} cor="verde" titulo="Portais de compras" descricao={`${f.portais.length} de ${PORTAIS.length} marcados`}
      acao={<AcaoSecao onClick={()=>set('portais',f.portais.length===PORTAIS.length?[]:PORTAIS.map(p=>p[0]))}>{f.portais.length===PORTAIS.length?'Desmarcar todos':'Marcar todos'}</AcaoSecao>}>
      <div className="grid grid-cols-2 gap-1.5">{PORTAIS.map(([id,nome])=><ChipFiltro key={id} title={nome} ativo={f.portais.includes(id)} onClick={()=>marcar('portais',id)} className="justify-start rounded-md text-left">
        <IconePortal id={id} nome={nome} /><span className="line-clamp-2 min-w-0 leading-tight">{nome}</span></ChipFiltro>)}</div>
      <p className="px-1 pt-2 text-[11px] text-muted-foreground">Pela identificação do portal de origem nas fontes oficiais; não é conexão com suas contas.</p>
    </SecaoFiltro></F>
    <F id="filtro-modalidades"><SecaoFiltro icone={Landmark} cor="ambar" titulo="Modalidades" descricao="Dispensa inclui as divulgadas nessa modalidade; confira no edital se há disputa"
      acao={<AcaoSecao onClick={()=>{const todas=modalidades.filter(m=>m.estado==='liberado').map(m=>m.id);set('modalidades',todas.every(id=>f.modalidades.includes(id))?[]:todas)}}>{modalidades.filter(m=>m.estado==='liberado').every(m=>f.modalidades.includes(m.id))?'Desmarcar todas':'Marcar todas'}</AcaoSecao>}>
      <div className="grid grid-cols-2 gap-1.5">{modalidades.map(({id,nome,estado})=>estado==='em_breve'
        ?<span key={id} title="Em breve" className="flex min-h-10 cursor-not-allowed items-center justify-center gap-1.5 rounded-md border border-dashed px-2.5 text-xs font-semibold text-muted-foreground opacity-60 sm:min-h-8">{nome}<span className="text-[10px] uppercase">em breve</span></span>
        :<ChipFiltro key={id} ativo={f.modalidades.includes(id)} onClick={()=>marcar('modalidades',id)} className="rounded-md">{nome}</ChipFiltro>)}</div>
    </SecaoFiltro></F>
    {visivel('filtro-orgao','filtro-max-itens','filtro-valor-total','filtro-valor-item','filtro-nao-divulgado')&&<SecaoFiltro icone={Banknote} cor="neutro" titulo="Órgãos e valores" descricao="Só valores positivos divulgados; filtros de item podem demorar mais">
      <div className="grid gap-2 px-1 sm:grid-cols-2">
        <F id="filtro-orgao" className="sm:col-span-2"><Campo rotulo="Órgão encontrado na consulta" htmlFor="oportunidade-orgao"><Select id="oportunidade-orgao" value={f.orgao} onChange={e=>set('orgao',e.target.value)} onFocus={aoAbrirOrgaos} onPointerDown={aoAbrirOrgaos}><option value="">{carregandoOrgaos?'Carregando órgãos...':'Todos os órgãos'}</option>{f.orgao && !orgaos.some(o=>o.cnpj===f.orgao) && <option value={f.orgao}>{f.orgao}</option>}{orgaos.map(o=><option key={o.cnpj} value={o.cnpj}>{o.razaoSocial} · {o.cnpj}</option>)}</Select></Campo></F>
        <F id="filtro-max-itens" className="sm:col-span-2"><Campo rotulo="Quantidade máxima de itens do edital" htmlFor="oportunidade-maxItens"><Input id="oportunidade-maxItens" type="number" min="1" step="1" value={f.maxItens} onChange={e=>set('maxItens',e.target.value)} /></Campo></F>
        {([['minimo','Valor total mínimo (R$)'],['maximo','Valor total máximo (R$)'],['itemMinimo','Valor unitário mín. do item (R$)'],['itemMaximo','Valor unitário máx. do item (R$)']] as const).map(([k,t])=><F key={k} id={k==='minimo'||k==='maximo'?'filtro-valor-total':'filtro-valor-item'}><Campo rotulo={t} htmlFor={`oportunidade-${k}`}><Input id={`oportunidade-${k}`} type="number" min="0" step="0.01" disabled={f.naoDivulgado && (k==='minimo'||k==='maximo')} value={f[k]} onChange={e=>set(k,e.target.value)} /></Campo></F>)}
      </div>
      <F id="filtro-nao-divulgado" className="mt-2">{alternar('naoDivulgado','Somente valor total não divulgado ou zerado')}</F>
    </SecaoFiltro>}
    {visivel('filtro-me-epp','filtro-excluir-srp')&&<SecaoFiltro icone={Sparkles} cor="rosa" titulo="Outros filtros" descricao="ME/EPP e faixa unitária valem para o mesmo item">
      <div className="grid gap-1.5 sm:grid-cols-2"><F id="filtro-me-epp">{alternar('exclusivo','Com item exclusivo ME/EPP')}</F><F id="filtro-excluir-srp">{alternar('excluirSrp','Excluir registro de preços')}</F></div>
    </SecaoFiltro>}
    <p className="px-2 py-1 text-[11px] text-muted-foreground">Os filtros são aplicados na base pesquisável antes da paginação.</p>
  </>
}
