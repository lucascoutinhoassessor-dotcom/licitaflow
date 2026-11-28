// Motor de lances: decide, a cada novidade da sala, se dá lance, de quanto e quando.
// Função pura (sem rede): o processo principal chama decidir() e, se a resposta for "enviar", manda o
// lance pela própria página do portal. Travas que nunca mudam:
//  - nunca abaixo do lance mínimo do cliente;
//  - só com o item aberto para lances (e, no modo "só no fim", só na fase final);
//  - nunca dois lances do mesmo item ao mesmo tempo, e sempre respeitando o intervalo mínimo;
//  - quem está ganhando não dá lance.
const { faseAberta, faseFinal } = require('./conectores/comprasgov.cjs')

const PADRAO = { ligado: false, minimo: null, desconto: 0.01, tipoDesconto: 'valor', casas4: false, soNoFim: false, intervaloSeg: 20 }

/** Arredonda para baixo nas casas decimais (sem os erros de ponto flutuante). */
function paraBaixo(v, casas) {
  const f = 10 ** casas
  return Math.floor(v * f + 1e-7) / f
}
function paraCima(v, casas) {
  const f = 10 ** casas
  return Math.ceil(v * f - 1e-7) / f
}

/**
 * config: estratégia do item (ver PADRAO). item: estado lido da sala (fase, melhor, meu, posicao, variacao…).
 * controle: { ultimoEnvio (ms), enviando }. Devolve { acao: 'parado'|'esperar'|'enviar'|'limite'|'erro', valor?, motivo }.
 */
function decidir(configParcial, item, controle = {}, agora = Date.now()) {
  const c = { ...PADRAO, ...configParcial }
  if (!c.ligado) return { acao: 'parado', motivo: 'Parado' }
  const minimo = Number(c.minimo)
  if (!(minimo > 0)) return { acao: 'erro', motivo: 'Defina o lance mínimo do item.' }
  const desconto = Number(c.desconto)
  if (!(desconto > 0)) return { acao: 'erro', motivo: 'Defina o desconto de cada lance.' }
  if (!item || !faseAberta(item.fase)) return { acao: 'esperar', motivo: 'Item não está aberto para lances.' }
  if (c.soNoFim && !faseFinal(item.fase)) return { acao: 'esperar', motivo: 'Aguardando a fase final (aleatório ou prorrogação).' }
  const melhor = Number(item.melhor)
  if (!(melhor > 0)) return { acao: 'esperar', motivo: 'Aguardando o melhor lance da sala.' }
  if (item.posicao === 1 || (item.meu != null && Number(item.meu) <= melhor)) return { acao: 'esperar', motivo: 'Você está ganhando.' }
  if (controle.enviando) return { acao: 'esperar', motivo: 'Enviando lance…' }
  const intervalo = Math.max(1, Number(c.intervaloSeg) || PADRAO.intervaloSeg) * 1000
  if (controle.ultimoEnvio && agora - controle.ultimoEnvio < intervalo) {
    return { acao: 'esperar', motivo: `Intervalo mínimo: próximo lance em ${Math.ceil((intervalo - (agora - controle.ultimoEnvio)) / 1000)} s.` }
  }
  const casas = c.casas4 ? 4 : 2
  const passoCliente = c.tipoDesconto === 'percentual' ? (melhor * desconto) / 100 : desconto
  const variacao = Number(item.variacao) > 0 ? (item.variacaoPercentual ? (melhor * Number(item.variacao)) / 100 : Number(item.variacao)) : 0
  const passo = Math.max(passoCliente, variacao, 1 / 10 ** casas)
  let valor = paraBaixo(melhor - passo, casas)
  if (valor < minimo) {
    const noMinimo = paraCima(minimo, casas)
    // Ainda dá para cobrir o melhor lance sem passar do mínimo: vai no mínimo.
    if (noMinimo <= paraBaixo(melhor - Math.max(variacao, 1 / 10 ** casas), casas)) valor = noMinimo
    else return { acao: 'limite', motivo: 'Chegou ao seu lance mínimo: a máquina não desce mais.' }
  }
  if (item.meu != null && valor >= Number(item.meu)) return { acao: 'esperar', motivo: 'O próximo lance não fica abaixo do seu último lance.' }
  return { acao: 'enviar', valor, motivo: `Cobrindo o melhor lance (${melhor}).` }
}

module.exports = { decidir, PADRAO, paraBaixo }
