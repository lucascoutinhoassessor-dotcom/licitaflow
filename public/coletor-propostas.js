/* LicitaForce: coletor de propostas do Compras.gov.br.
 * Carregado pelo botão favorito na página "Acompanhar Contratação" (cnetmobile.estaleiro.serpro.gov.br).
 * Não faz consultas próprias: só guarda as respostas de propostas que a página já baixa quando a pessoa
 * abre cada item (o captcha continua sendo da página). No fim, abre o LicitaForce com os dados no endereço
 * (depois do #, que não vai para servidor nenhum) para a pessoa logada gravar na compra. */
(function () {
  'use strict'
  var HOST = 'cnetmobile.estaleiro.serpro.gov.br'
  var script = document.currentScript
  var ORIGEM = (function () { try { return new URL(script && script.src).origin } catch (e) { return 'https://licitaforce-app.vercel.app' } })()
  if (location.host !== HOST) {
    alert('LicitaForce: use este favorito na página "Acompanhar Contratação" do Compras.gov.br (abra a compra pelo botão "Ver disputa no portal").')
    return
  }
  if (window.__lfColetor) { window.__lfColetor.mostrar(); return }

  var RE = /\/compras\/(\d{15,20})\/itens\/(\d{1,5})\/propostas(?:[?#]|$)/
  var idCompraDaPagina = function () { return new URLSearchParams(location.search).get('compra') || '' }
  var chave = function (id) { return 'lf-propostas-' + id }
  var estado = { idCompra: idCompraDaPagina(), itens: {} }
  try { var salvo = JSON.parse(sessionStorage.getItem(chave(estado.idCompra)) || 'null'); if (salvo && salvo.itens) estado.itens = salvo.itens } catch (e) { /* sem cópia salva */ }

  var num = function (v) { var n = Number(v); return isFinite(n) && n > 0 ? Math.round(n * 10000) / 10000 : null }
  var texto = function (v, max) { return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null }
  var unitario = function (vals, k) { return vals && vals[k] && vals[k].valorCalculado ? num(vals[k].valorCalculado.valorUnitario) : null }
  var total = function (vals, k) { return vals && vals[k] && vals[k].valorCalculado ? num(vals[k].valorCalculado.valorTotal) : null }
  function motivo(p) {
    for (var k in p) if (/^(motivo|justificativa)/i.test(k) && typeof p[k] === 'string' && p[k].trim()) return p[k].trim().slice(0, 400)
    return null
  }
  // Só o necessário, com nomes curtos (vai no endereço da página do LicitaForce).
  function reduzir(item) {
    var propostas = Array.isArray(item.propostasItem) ? item.propostasItem : []
    return {
      t: item.tipo === 'G' ? 'g' : 'i', n: Number(item.numero), d: texto(item.descricao, 120), s: texto(String(item.situacao || ''), 4),
      p: propostas.slice(0, 300).map(function (p) {
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
  function guardar(url, corpo) {
    var m = RE.exec(url || '')
    if (!m || !corpo || typeof corpo !== 'object' || !Array.isArray(corpo.propostasItem)) return
    if (m[1] !== estado.idCompra) { estado = { idCompra: m[1], itens: {} } }
    var r = reduzir(corpo)
    if (!r.n) return
    estado.itens[r.t + r.n] = r
    try { sessionStorage.setItem(chave(estado.idCompra), JSON.stringify(estado)) } catch (e) { /* cheio: segue só na memória */ }
    desenhar()
  }

  // Escuta as respostas que a página recebe (XHR do Angular e fetch).
  var abrir = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function () {
    this.addEventListener('load', function () {
      try {
        if (!RE.test(this.responseURL || '')) return
        var corpo = this.responseType === 'json' ? this.response : JSON.parse(this.responseText)
        guardar(this.responseURL, corpo)
      } catch (e) { /* resposta que não é JSON */ }
    })
    return abrir.apply(this, arguments)
  }
  if (window.fetch) {
    var buscar = window.fetch
    window.fetch = function () {
      return buscar.apply(this, arguments).then(function (r) {
        try { if (RE.test(r.url)) r.clone().json().then(function (j) { guardar(r.url, j) }).catch(function () {}) } catch (e) { /* ignora */ }
        return r
      })
    }
  }

  // Painel flutuante (shadow DOM para não herdar o estilo da página).
  var host = document.createElement('div')
  // Canto esquerdo: os botões de cada item ficam à direita da página.
  host.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:2147483647'
  var raiz = host.attachShadow({ mode: 'open' })
  document.body.appendChild(host)
  function desenhar() {
    var lista = Object.keys(estado.itens).map(function (k) { return estado.itens[k] }).sort(function (a, b) { return a.n - b.n })
    var empresas = {}
    lista.forEach(function (i) { i.p.forEach(function (p) { if (p.c) empresas[p.c] = 1 }) })
    var nomes = lista.map(function (i) { return (i.t === 'g' ? 'G' : '') + i.n }).join(', ')
    raiz.innerHTML =
      '<style>*{box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}' +
      '.c{width:320px;background:#0b1220;color:#e5e7eb;border:1px solid #1e3a5f;border-radius:16px;padding:14px;box-shadow:0 12px 40px rgba(0,0,0,.45);font-size:13px;line-height:1.4}' +
      '.t{font-weight:700;font-size:14px;display:flex;justify-content:space-between;align-items:center}.m{color:#94a3b8;margin-top:6px}' +
      '.n{font-size:22px;font-weight:800;color:#34d399;margin-top:8px}button{cursor:pointer;border:0;border-radius:999px;font-weight:700;font-size:13px}' +
      '.e{width:100%;margin-top:12px;padding:10px;background:#10b981;color:#04130d}.e:disabled{opacity:.45;cursor:default}.x{background:transparent;color:#94a3b8;font-size:18px;padding:0 4px}' +
      '.l{margin-top:4px;color:#cbd5e1;max-height:60px;overflow:auto;word-break:break-word}</style>' +
      '<div class="c"><div class="t"><span>LicitaForce · propostas</span><button class="x" title="Fechar">×</button></div>' +
      '<div class="n">' + lista.length + (lista.length === 1 ? ' item' : ' itens') + ' · ' + Object.keys(empresas).length + ' empresas</div>' +
      (nomes ? '<div class="l">Itens: ' + nomes + '</div>' : '') +
      '<div class="m">Abra cada item que quiser (ícone de lista ao lado do item) e o LicitaForce guarda todas as propostas. ' +
      'Se o item já estava aberto, clique no botão de atualizar da página.</div>' +
      '<button class="e"' + (lista.length ? '' : ' disabled') + '>Enviar para o LicitaForce</button></div>'
    raiz.querySelector('.x').onclick = function () { host.style.display = 'none' }
    raiz.querySelector('.e').onclick = enviar
  }
  function base64url(bytes) {
    var bin = ''
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }
  function enviar() {
    var dados = JSON.stringify({ v: 1, idCompra: estado.idCompra, itens: Object.keys(estado.itens).map(function (k) { return estado.itens[k] }) })
    var janela = window.open('', '_blank')
    var ir = function (frag) { var url = ORIGEM + '/app/importar-propostas#lf-propostas=' + frag; if (janela) janela.location.href = url; else location.href = url }
    var bytes = new TextEncoder().encode(dados)
    if (window.CompressionStream) {
      new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()
        .then(function (b) { ir('z.' + base64url(new Uint8Array(b))) })
        .catch(function () { ir('j.' + base64url(bytes)) })
    } else ir('j.' + base64url(bytes))
  }

  window.__lfColetor = { mostrar: function () { host.style.display = ''; desenhar() }, estado: function () { return estado } }
  desenhar()
})()
