// Lado da extensão na página do Compras.gov.br: recebe as propostas copiadas por coletor-pagina.js,
// reduz ao que o LicitaForce usa e manda ao coordenador.
(function () {
  'use strict'
  var RE = /\/compras\/(\d{15,20})\/itens\/(\d{1,5})\/propostas$/
  var num = function (v) { var n = Number(v); return isFinite(n) && n > 0 ? Math.round(n * 10000) / 10000 : null }
  var texto = function (v, max) { return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null }
  var unitario = function (vals, k) { return vals && vals[k] && vals[k].valorCalculado ? num(vals[k].valorCalculado.valorUnitario) : null }
  var total = function (vals, k) { return vals && vals[k] && vals[k].valorCalculado ? num(vals[k].valorCalculado.valorTotal) : null }
  function motivo(p) {
    for (var k in p) if (/^(motivo|justificativa)/i.test(k) && typeof p[k] === 'string' && p[k].trim()) return p[k].trim().slice(0, 400)
    return null
  }
  // Mesmo formato curto que o servidor do LicitaForce aceita (server/atas.js, itensDoPortal).
  function reduzir(item) {
    return {
      t: item.tipo === 'G' ? 'g' : 'i', n: Number(item.numero), d: texto(item.descricao, 120),
      p: item.propostasItem.slice(0, 300).map(function (p) {
        var part = p.participante || {}, vals = p.valores || {}
        var final = vals.valorNegociado ? 'valorNegociado' : vals.valorPropostaInicialOuLances ? 'valorPropostaInicialOuLances' : 'valorPropostaInicial'
        return {
          c: String(part.identificacao || '').replace(/\D/g, ''), nm: texto(part.nome, 200), uf: texto(part.endereco && part.endereco.uf, 2),
          me: !!p.declaracaoMeEpp, v: unitario(vals, final), vt: total(vals, final), vi: unitario(vals, 'valorPropostaInicial'),
          cl: Number.isInteger(p.classificacao) ? p.classificacao : null, st: texto(String(p.situacao || ''), 4), mo: motivo(p),
          ma: texto(p.marcaFabricante, 80), mod: texto(p.modeloVersao, 120), q: num(p.quantidadeOfertada),
        }
      }),
    }
  }
  window.addEventListener('message', function (e) {
    if (e.source !== window || !e.data || e.data.__licitaforce !== 'propostas') return
    var m = RE.exec(e.data.url || '')
    if (!m) return
    try { chrome.runtime.sendMessage({ tipo: 'propostas', idCompra: m[1], item: reduzir(e.data.corpo) }) } catch (err) { /* extensão recarregada */ }
  })
})()
