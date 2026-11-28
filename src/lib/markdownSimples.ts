/**
 * Markdown simples para as respostas da IA (sem HTML cru): títulos, listas, parágrafos, blocos de código,
 * **negrito**, *itálico*, `código` e [links](https://…). O componente TextoIA transforma isto em elementos React.
 */
export type Trecho = { t: 'texto' | 'negrito' | 'italico' | 'codigo'; v: string } | { t: 'link'; v: string; url: string }
export type Bloco =
  | { tipo: 'titulo'; nivel: 1 | 2 | 3; trechos: Trecho[] }
  | { tipo: 'paragrafo'; trechos: Trecho[] }
  | { tipo: 'lista'; ordenada: boolean; itens: Trecho[][] }
  | { tipo: 'codigo'; texto: string }

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|\*[^*\n]+\*|_[^_\n]+_)/g

export function trechos(linha: string): Trecho[] {
  const saida: Trecho[] = []
  let ultimo = 0
  for (const m of linha.matchAll(INLINE)) {
    const i = m.index ?? 0
    if (i > ultimo) saida.push({ t: 'texto', v: linha.slice(ultimo, i) })
    const s = m[0]
    if (s.startsWith('**')) saida.push({ t: 'negrito', v: s.slice(2, -2) })
    else if (s.startsWith('`')) saida.push({ t: 'codigo', v: s.slice(1, -1) })
    else if (s.startsWith('[')) { const k = s.indexOf(']('); saida.push({ t: 'link', v: s.slice(1, k), url: s.slice(k + 2, -1) }) }
    else saida.push({ t: 'italico', v: s.slice(1, -1) })
    ultimo = i + s.length
  }
  if (ultimo < linha.length) saida.push({ t: 'texto', v: linha.slice(ultimo) })
  return saida
}

export function blocos(texto: string): Bloco[] {
  const linhas = String(texto ?? '').replace(/\r\n/g, '\n').split('\n')
  const saida: Bloco[] = []
  let paragrafo: string[] = []
  let lista: { ordenada: boolean; itens: Trecho[][] } | null = null
  const fecharParagrafo = () => { if (paragrafo.length) { saida.push({ tipo: 'paragrafo', trechos: trechos(paragrafo.join(' ')) }); paragrafo = [] } }
  const fecharLista = () => { if (lista) { saida.push({ tipo: 'lista', ...lista }); lista = null } }
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i]
    if (/^\s*```/.test(l)) {
      fecharParagrafo(); fecharLista()
      const corpo: string[] = []
      for (i++; i < linhas.length && !/^\s*```/.test(linhas[i]); i++) corpo.push(linhas[i])
      saida.push({ tipo: 'codigo', texto: corpo.join('\n') })
      continue
    }
    const titulo = /^\s*(#{1,6})\s+(.*)$/.exec(l)
    const item = /^\s*(?:([-*•])|(\d+)[.)])\s+(.*)$/.exec(l)
    if (titulo) { fecharParagrafo(); fecharLista(); saida.push({ tipo: 'titulo', nivel: Math.min(3, titulo[1].length) as 1 | 2 | 3, trechos: trechos(titulo[2]) }) }
    else if (item) {
      fecharParagrafo()
      const ordenada = !item[1]
      if (!lista || lista.ordenada !== ordenada) { fecharLista(); lista = { ordenada, itens: [] } }
      lista.itens.push(trechos(item[3]))
    } else if (!l.trim()) { fecharParagrafo(); fecharLista() }
    else { fecharLista(); paragrafo.push(l.trim()) }
  }
  fecharParagrafo(); fecharLista()
  return saida
}
