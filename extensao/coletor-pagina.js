// Roda dentro da página "Acompanhar Contratação" do Compras.gov.br (mundo da página, antes do app carregar).
// Não faz consultas próprias: só copia as respostas de propostas que a própria página baixa
// (com a verificação dela) e repassa ao coletor.js da extensão.
(function () {
  'use strict'
  var RE = /\/compras\/(\d{15,20})\/itens\/(\d{1,5})\/propostas(?:[?#]|$)/
  function repassar(url, corpo) {
    if (!RE.test(url || '') || !corpo || !Array.isArray(corpo.propostasItem)) return
    window.postMessage({ __licitaforce: 'propostas', url: String(url).split('?')[0], corpo: corpo }, location.origin)
  }
  var abrir = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function () {
    this.addEventListener('load', function () {
      try {
        if (!RE.test(this.responseURL || '')) return
        repassar(this.responseURL, this.responseType === 'json' ? this.response : JSON.parse(this.responseText))
      } catch (e) { /* resposta que não é JSON */ }
    })
    return abrir.apply(this, arguments)
  }
  if (window.fetch) {
    var buscar = window.fetch
    window.fetch = function () {
      return buscar.apply(this, arguments).then(function (r) {
        try { if (RE.test(r.url)) r.clone().json().then(function (j) { repassar(r.url, j) }).catch(function () {}) } catch (e) { /* ignora */ }
        return r
      })
    }
  }
})()
