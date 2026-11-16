export const STATUS_CHAMADO = {aberto:'Aberto',em_andamento:'Em andamento',aguardando_cliente:'Aguardando cliente',resolvido:'Resolvido',fechado:'Fechado'}
export const PRIORIDADE_CHAMADO = {baixa:'Baixa',normal:'Normal',alta:'Alta',urgente:'Urgente'}
export function gerarCSV(linhas: Record<string,unknown>[], colunas: {chave:string;rotulo:string}[]) {
  const celula = (v:unknown) => {
    let texto=String(v ?? '')
    if(typeof v==='string' && /^\s*[=+\-@]/.test(texto)) texto="'"+texto
    return '"'+texto.replace(/"/g,'""')+'"'
  }
  return '\ufeff'+[colunas.map(c=>celula(c.rotulo)).join(';'),...linhas.map(l=>colunas.map(c=>celula(l[c.chave])).join(';'))].join('\r\n')
}
export function baixarCSV(nome:string,linhas:Record<string,unknown>[],colunas:{chave:string;rotulo:string}[]) {
  const url=URL.createObjectURL(new Blob([gerarCSV(linhas,colunas)],{type:'text/csv;charset=utf-8'}))
  const a=document.createElement('a');a.href=url;a.download=nome;document.body.appendChild(a);a.click();a.remove()
  setTimeout(()=>URL.revokeObjectURL(url),1000)
}
