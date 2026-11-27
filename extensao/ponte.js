// Lado da extensão nas páginas do LicitaForce: avisa que está instalada, recebe o pedido de propostas
// de uma compra e devolve o andamento e o resultado. Só conversa com a própria página (mesma origem).
(function () {
  'use strict'
  var VERSAO = chrome.runtime.getManifest().version
  function paraPagina(dados) { window.postMessage(Object.assign({ origem: 'lf-extensao', versao: VERSAO }, dados), location.origin) }
  window.addEventListener('message', function (e) {
    if (e.source !== window || e.origin !== location.origin || !e.data || e.data.origem !== 'licitaforce') return
    if (e.data.tipo === 'ping') paraPagina({ tipo: 'pronta' })
    if (e.data.tipo === 'buscar-propostas' && /^\d{15,20}$/.test(String(e.data.idCompra))) {
      var itens = (Array.isArray(e.data.itens) ? e.data.itens : []).map(Number).filter(function (n) { return Number.isInteger(n) && n > 0 })
      try { chrome.runtime.sendMessage({ tipo: 'buscar', idCompra: String(e.data.idCompra), itens: itens }) } catch (err) { paraPagina({ tipo: 'erro', idCompra: e.data.idCompra, mensagem: 'Recarregue a página: a extensão foi atualizada.' }) }
    }
  })
  chrome.runtime.onMessage.addListener(function (msg) { if (msg && msg.paraPagina) paraPagina(msg.paraPagina) })
  paraPagina({ tipo: 'pronta' })
})()
