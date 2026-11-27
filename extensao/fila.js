// Coordenação das buscas de propostas, sem depender do Chrome (os efeitos vêm de fora; ver coordenador.js).
// Uma compra por vez, um item por vez, com intervalo entre os itens: o mesmo ritmo de uma pessoa navegando.

export const PORTAL = 'https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public/compras/acompanhamento-compra'
export const INTERVALO_MS = 2500 // entre um item e o próximo
export const ESPERA_MS = 30000 // sem resposta do item: pede ajuda à pessoa (pode ser uma verificação visível)
export const ESPERA_AJUDA_MS = 90000 // depois disso, pula o item
export const MAX_ITENS = 80
export const MAX_FILA = 5

export const enderecoItem = (idCompra, n) => `${PORTAL}/item/${n}?compra=${idCompra}`

/**
 * efeitos: { abrirAba(url) → Promise<tabId>, irPara(tabId, url), mostrarAba(tabId), fecharAba(tabId),
 *            avisar(tabOrigem, dados), agendar(ms, fn) → id, cancelar(id) }
 */
export function criarFila(efeitos) {
  let atual = null
  const espera = []

  const avisar = (job, dados) => efeitos.avisar(job.origem, { idCompra: job.idCompra, ...dados })
  const progresso = (job) => avisar(job, { tipo: 'progresso', feitos: job.pos, total: job.itens.length, guardados: Object.keys(job.dados).length })

  function vigiar(job) {
    efeitos.cancelar(job.relogio)
    job.relogio = efeitos.agendar(ESPERA_MS, () => {
      efeitos.mostrarAba(job.aba)
      avisar(job, { tipo: 'ajuda', mensagem: 'O Compras.gov.br não respondeu. Se a aba dele pedir uma verificação, resolva por lá; a busca continua sozinha.' })
      job.relogio = efeitos.agendar(ESPERA_AJUDA_MS, () => { job.falhas++; avancar(job) })
    })
  }

  function avancar(job) {
    if (job !== atual) return
    efeitos.cancelar(job.relogio)
    job.pos++
    progresso(job)
    if (job.pos >= job.itens.length || job.falhas >= 3) return terminar(job)
    job.relogio = efeitos.agendar(INTERVALO_MS, () => { efeitos.irPara(job.aba, enderecoItem(job.idCompra, job.itens[job.pos])); vigiar(job) })
  }

  function terminar(job, erro = null) {
    efeitos.cancelar(job.relogio)
    if (job.aba != null) efeitos.fecharAba(job.aba)
    const itens = Object.values(job.dados)
    if (erro) avisar(job, { tipo: 'erro', mensagem: erro, itens })
    else if (!itens.length) avisar(job, { tipo: 'erro', mensagem: 'O Compras.gov.br não entregou propostas para esta compra.', itens })
    else avisar(job, { tipo: 'concluido', itens, faltaram: job.itens.length - itens.length })
    atual = null
    const proximo = espera.shift()
    if (proximo) iniciar(proximo)
  }

  async function iniciar(job) {
    atual = job
    progresso(job)
    try {
      job.aba = await efeitos.abrirAba(enderecoItem(job.idCompra, job.itens[0]))
      vigiar(job)
    } catch {
      terminar(job, 'Não foi possível abrir o Compras.gov.br.')
    }
  }

  return {
    /** Pedido da página do LicitaForce (aba de origem) para buscar as propostas de uma compra. */
    buscar(idCompra, itens, origem) {
      const lista = [...new Set(itens)].filter((n) => Number.isInteger(n) && n > 0).sort((a, b) => a - b).slice(0, MAX_ITENS)
      if (!/^\d{15,20}$/.test(idCompra) || !lista.length) return
      const igual = [atual, ...espera].find((j) => j && j.idCompra === idCompra)
      if (igual) { igual.origem = origem; return progresso(igual) }
      const job = { idCompra, itens: lista, pos: 0, origem, aba: null, dados: {}, falhas: 0, relogio: null }
      if (atual) {
        if (espera.length >= MAX_FILA) return avisar(job, { tipo: 'erro', mensagem: 'Muitas compras na fila. Tente daqui a pouco.' })
        espera.push(job)
        return avisar(job, { tipo: 'fila', posicao: espera.length })
      }
      iniciar(job)
    },
    /** Propostas de um item, vindas da aba do Compras.gov.br. */
    propostas(aba, idCompra, item) {
      const job = atual
      if (!job || job.aba !== aba || job.idCompra !== idCompra || !item || !Number.isInteger(item.n)) return
      job.dados[`${item.t}${item.n}`] = item
      if (item.n === job.itens[job.pos]) avancar(job)
      else progresso(job)
    },
    /** A pessoa fechou a aba do Compras.gov.br ou a do LicitaForce. */
    abaFechada(aba) {
      if (atual && atual.aba === aba) { atual.aba = null; terminar(atual, 'A aba do Compras.gov.br foi fechada antes do fim.') }
      else if (atual && atual.origem === aba) terminar(atual, 'A página do LicitaForce foi fechada.')
    },
    estado: () => (atual ? { idCompra: atual.idCompra, pos: atual.pos, total: atual.itens.length, fila: espera.length } : null),
  }
}
