// Estratégia de cada item (lance mínimo, desconto, opções) e o modo simulação, guardados no computador
// do cliente (userData/estrategias.json). Ficam aqui porque o lance sai daqui: sem depender da internet
// com o LicitaForce no meio da disputa.
const fs = require('node:fs')
const path = require('node:path')
const { PADRAO } = require('./motor.cjs')

function numeroOuNulo(v, max = 1e12) {
  if (v === '' || v == null) return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 && n < max ? n : null
}

/** Valida o que veio da tela: só os campos conhecidos, com tipos certos. */
function limparEstrategia(p = {}) {
  const s = {}
  if ('ligado' in p) s.ligado = p.ligado === true
  if ('minimo' in p) s.minimo = numeroOuNulo(p.minimo)
  if ('desconto' in p) s.desconto = numeroOuNulo(p.desconto, 1e9)
  if ('tipoDesconto' in p) s.tipoDesconto = p.tipoDesconto === 'percentual' ? 'percentual' : 'valor'
  if ('casas4' in p) s.casas4 = p.casas4 === true
  if ('soNoFim' in p) s.soNoFim = p.soNoFim === true
  if ('intervaloSeg' in p) { const n = Math.round(Number(p.intervaloSeg)); s.intervaloSeg = Number.isFinite(n) ? Math.min(600, Math.max(3, n)) : PADRAO.intervaloSeg }
  return s
}

function criarEstrategias(pasta) {
  const arq = path.join(pasta, 'estrategias.json')
  let dados = { simulacao: true, itens: {} }
  try { dados = { ...dados, ...JSON.parse(fs.readFileSync(arq, 'utf8')) } } catch { /* primeira vez */ }
  const salvar = () => { try { fs.mkdirSync(pasta, { recursive: true }); fs.writeFileSync(arq, JSON.stringify(dados, null, 1)) } catch { /* sem disco */ } }
  const chave = (portal, compra, item) => `${portal}:${compra}:${item}`
  return {
    get simulacao() { return dados.simulacao !== false },
    definirSimulacao(v) { dados.simulacao = v !== false; salvar() },
    de(portal, compra, item) { return { ...PADRAO, ...(dados.itens[chave(portal, compra, item)] ?? {}) } },
    mudar(portal, compra, item, parcial) {
      const k = chave(portal, compra, item)
      dados.itens[k] = { ...(dados.itens[k] ?? {}), ...limparEstrategia(parcial) }
      salvar()
      return { ...PADRAO, ...dados.itens[k] }
    },
    /** Botão "Parar tudo": desliga todos os itens na hora. */
    pararTudo() { for (const k of Object.keys(dados.itens)) dados.itens[k].ligado = false; salvar() },
    ligados() { return Object.entries(dados.itens).filter(([, v]) => v.ligado).map(([k]) => k) },
  }
}

module.exports = { criarEstrategias, limparEstrategia }
