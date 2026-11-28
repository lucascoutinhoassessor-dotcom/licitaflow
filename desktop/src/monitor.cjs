// Observa a janela do portal pelo protocolo de depuração do Chromium (o mesmo das ferramentas do
// desenvolvedor): lê as respostas dos serviços da sala e as mensagens do WebSocket que a própria página
// recebeu. Não faz chamadas ao portal, não lê senha nem guarda o token de acesso.
const fs = require('node:fs')
const path = require('node:path')

const LIMITE_CORPO = 2_000_000
const LIMITE_AMOSTRA_DIA = 20 * 1024 * 1024

function criarAmostrador(pasta) {
  // Modo descoberta: guarda no computador do cliente amostras do que o portal mandou, para ajustar o conector.
  return (registro) => {
    try {
      fs.mkdirSync(pasta, { recursive: true })
      const arq = path.join(pasta, new Date().toISOString().slice(0, 10) + '.jsonl')
      if (fs.existsSync(arq) && fs.statSync(arq).size > LIMITE_AMOSTRA_DIA) return
      fs.appendFileSync(arq, JSON.stringify({ em: new Date().toISOString(), ...registro, corpo: String(registro.corpo ?? '').slice(0, 20000) }) + '\n')
    } catch { /* amostra é opcional */ }
  }
}

/**
 * Liga o monitor numa janela. Callbacks:
 *  aoLogin()                        — a página começou a usar o token do usuário
 *  aoChave(chave, url)              — a página abriu uma compra
 *  aoEventos(chave, eventos)        — novidades lidas pelo conector
 *  aoErro(mensagem)
 */
function monitorar(wc, conector, { contexto, aoLogin, aoChave, aoEventos, aoErro, amostrar }) {
  const dbg = wc.debugger
  const respostas = new Map()
  const sockets = new Map()
  let logado = false
  let ultimaChave = null

  try { dbg.attach('1.3') } catch (e) { aoErro?.('Não foi possível acompanhar a janela: ' + e.message); return () => {} }
  dbg.sendCommand('Network.enable', { maxResourceBufferSize: 5_000_000, maxTotalBufferSize: 50_000_000 }).catch((e) => aoErro?.(e.message))

  const chaveVista = (url) => {
    const c = conector.chaveDaUrl(url)
    if (c && c !== ultimaChave) { ultimaChave = c; aoChave?.(c, url) }
    return c
  }

  const tratar = (chave, r) => { const c = r.chave ?? chave ?? ultimaChave; if (c && r.eventos.length) aoEventos?.(c, r.eventos) }

  dbg.on('message', async (_ev, metodo, p) => {
    try {
      if (metodo === 'Network.requestWillBeSent') {
        chaveVista(p.request.url)
        if (!logado && conector.indicaLogin(p.request.url, p.request.headers)) { logado = true; aoLogin?.() }
      } else if (metodo === 'Network.responseReceived') {
        if (conector.interessa(p.response.url) && p.type !== 'Preflight' && p.response.status < 400) respostas.set(p.requestId, p.response.url)
      } else if (metodo === 'Network.loadingFinished') {
        const url = respostas.get(p.requestId)
        if (!url) return
        respostas.delete(p.requestId)
        if (p.encodedDataLength > LIMITE_CORPO) return
        const r = await dbg.sendCommand('Network.getResponseBody', { requestId: p.requestId })
        const corpo = r.base64Encoded ? Buffer.from(r.body, 'base64').toString('utf8') : r.body
        amostrar?.({ tipo: 'http', url, corpo })
        tratar(conector.chaveDaUrl(url), conector.lerResposta(url, corpo, contexto()))
      } else if (metodo === 'Network.loadingFailed') {
        respostas.delete(p.requestId)
      } else if (metodo === 'Network.webSocketCreated') {
        if (conector.interessaWs(p.url)) sockets.set(p.requestId, p.url)
      } else if (metodo === 'Network.webSocketFrameReceived') {
        const url = sockets.get(p.requestId)
        if (!url || p.response.opcode !== 1) return
        amostrar?.({ tipo: 'ws', url, corpo: p.response.payloadData })
        tratar(null, conector.lerQuadroWs(p.response.payloadData, contexto()))
      } else if (metodo === 'Network.webSocketClosed') {
        sockets.delete(p.requestId)
      }
    } catch (e) {
      // Corpo já descartado pela página ou janela fechada: segue sem esse pedaço.
      if (!/No resource with given identifier|Target closed|No data found/i.test(e.message)) aoErro?.(e.message)
    }
  })

  dbg.on('detach', (_ev, motivo) => {
    if (motivo !== 'target closed') aoErro?.('O acompanhamento da janela foi interrompido (' + motivo + '). Feche e abra a janela do portal de novo.')
  })

  return () => { try { dbg.detach() } catch { /* já fechada */ } }
}

module.exports = { monitorar, criarAmostrador }
