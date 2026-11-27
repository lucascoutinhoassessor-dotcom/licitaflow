// Service worker da extensão: liga a fila (fila.js) às abas do Chrome.
import { criarFila } from './fila.js'

const LICITAFORCE = /^(https:\/\/(licitaforce-app|licitaflow-prod)\.vercel\.app|http:\/\/localhost(:\d+)?)$/

const fila = criarFila({
  abrirAba: async (url) => (await chrome.tabs.create({ url, active: false })).id,
  irPara: (aba, url) => { chrome.tabs.update(aba, { url }).catch(() => {}) },
  mostrarAba: (aba) => { chrome.tabs.update(aba, { active: true }).catch(() => {}) },
  fecharAba: (aba) => { chrome.tabs.remove(aba).catch(() => {}) },
  avisar: (aba, dados) => { chrome.tabs.sendMessage(aba, { paraPagina: dados }).catch(() => {}) },
  agendar: (ms, fn) => setTimeout(fn, ms),
  cancelar: (id) => clearTimeout(id),
})

chrome.runtime.onMessage.addListener((msg, remetente) => {
  const aba = remetente.tab?.id
  if (aba == null || !msg) return
  const origem = (() => { try { return new URL(remetente.url).origin } catch { return '' } })()
  // Pedidos só das páginas do LicitaForce; propostas só da página do Compras.gov.br.
  if (msg.tipo === 'buscar' && LICITAFORCE.test(origem)) fila.buscar(String(msg.idCompra), msg.itens ?? [], aba)
  if (msg.tipo === 'propostas' && origem === 'https://cnetmobile.estaleiro.serpro.gov.br') fila.propostas(aba, String(msg.idCompra), msg.item)
})
chrome.tabs.onRemoved.addListener((aba) => fila.abaFechada(aba))
