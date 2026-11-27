import type { CompraPreco } from './precos'

export function termoDoItem(descricao = '') {
  return descricao.replace(/^(?:lote|grupo)\s*(?:n[º°o.]*)?\s*[:\-–]?\s*\d+\s*[:\-–]?\s*/i, '').split(/[:,;\n]/)[0].trim().slice(0, 100)
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase()
const marcaValida = (s: string) => !!s && !/^(?:NULL|N\/A|NA|NI|NAO INFORMAD[AO]|NAO SE APLICA|SEM MARCA|GENERICO|GENERICA|PROPRI[AO]|MARCA PROPRIA|OUTR[AO]S?|-+)$/.test(normalizar(s))

/** Evidências deduplicadas por compra e item; propostas recusadas não sustentam uma indicação. */
export function potenciaisDoHistorico(compras: CompraPreco[]) {
  const empresas = new Map<string, { cnpj: string; nome: string; fontes: CompraPreco[]; marcas: Set<string> }>()
  const marcas = new Map<string, { nome: string; fontes: CompraPreco[] }>()
  const adicionarFonte = (fontes: CompraPreco[], c: CompraPreco) => {
    if (!fontes.some((f) => f.idCompra === c.idCompra && f.numeroItem === c.numeroItem)) fontes.push(c)
  }
  for (const c of compras) {
    const registros = [
      { cnpj: c.cnpj, fornecedor: c.fornecedor, marca: c.marca },
      ...(c.propostas ?? []).filter((p) => ['vencedora', 'classificada'].includes(p.situacao)),
    ]
    for (const r of registros) {
      const marca = (r.marca ?? '').trim()
      if (marcaValida(marca)) {
        const chave = normalizar(marca)
        const m = marcas.get(chave) ?? { nome: marca, fontes: [] }
        adicionarFonte(m.fontes, c)
        marcas.set(chave, m)
      }
      const cnpj = (r.cnpj ?? '').replace(/\D/g, '')
      if (!/^\d{14}$/.test(cnpj)) continue
      const e = empresas.get(cnpj) ?? { cnpj, nome: r.fornecedor?.trim() || cnpj, fontes: [], marcas: new Set<string>() }
      if (r.fornecedor?.trim()) e.nome = r.fornecedor.trim()
      adicionarFonte(e.fontes, c)
      if (marcaValida(marca)) e.marcas.add(normalizar(marca))
      empresas.set(cnpj, e)
    }
  }
  const ordenar = <T extends { fontes: CompraPreco[] }>(lista: T[]) => lista.sort((a, b) => b.fontes.length - a.fontes.length)
  return { empresas: ordenar([...empresas.values()]), marcas: ordenar([...marcas.values()]) }
}
