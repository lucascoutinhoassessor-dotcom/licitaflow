// LicitaForce Pregão ao Vivo — processo principal.
// Janela principal (login no LicitaForce, sessões e eventos) + uma janela por portal, onde o usuário faz o
// login e resolve o captcha com as próprias mãos. O programa acompanha a sala e manda os eventos ao site.
const { app, BrowserWindow, Menu, Notification, Tray, ipcMain, nativeImage, safeStorage, shell } = require('electron')
const os = require('node:os')
const path = require('node:path')
const { criarNuvem } = require('./nuvem.cjs')
const { monitorar, criarAmostrador } = require('./monitor.cjs')
const config = require('./config.cjs')
const comprasgov = require('./conectores/comprasgov.cjs')

const CONECTORES = { comprasgov }
const PORTAIS_FUTUROS = [
  { id: 'bll', nome: 'BLL Compras' }, { id: 'bnc', nome: 'BNC' },
  { id: 'licitanet', nome: 'Licitanet' }, { id: 'pcp', nome: 'Portal de Compras Públicas' },
]

// Registro local de erros (userData/registro.log), para o suporte entender um problema no computador do cliente.
function registrar(...partes) {
  try {
    const arq = path.join(app.getPath('userData'), 'registro.log')
    require('node:fs').appendFileSync(arq, `[${new Date().toISOString()}] ${partes.map((p) => (p instanceof Error ? p.stack : String(p))).join(' ')}\n`)
  } catch { /* sem registro */ }
}
process.on('uncaughtException', (e) => registrar('erro', e))
process.on('unhandledRejection', (e) => registrar('promessa', e))

if (!app.requestSingleInstanceLock()) app.quit()
app.setAppUserModelId('br.com.licitaforce.pregaoaovivo')

let principal = null
let bandeja = null
let saindo = false
let nuvem = null
const portais = new Map() // id do conector → { janela, parar, logado, estado: Map por chave }
const recentes = [] // últimos eventos para a janela principal
const status = { conectado: false, erro: '', ultimoEnvio: null }
const icone = path.join(__dirname, '..', 'build', 'icon.png')

function enviarUi(canal, dados) { if (principal && !principal.isDestroyed()) principal.webContents.send(canal, dados) }

function estadoUi() {
  return {
    versao: app.getVersion(), computador: os.hostname(),
    conta: nuvem?.org ? { org: nuvem.org } : null,
    status, sessoes: nuvem?.sessoes ?? [], recentes: recentes.slice(0, 80),
    portais: [
      ...Object.values(CONECTORES).map((c) => ({ id: c.id, nome: c.nome, disponivel: true, aberto: portais.has(c.id), logado: !!portais.get(c.id)?.logado })),
      ...PORTAIS_FUTUROS.map((p) => ({ ...p, disponivel: false })),
    ],
    pendentes: nuvem?.pendentes() ?? 0,
  }
}
const atualizarUi = () => enviarUi('estado', estadoUi())

function criarPrincipal() {
  principal = new BrowserWindow({
    width: 1040, height: 760, minWidth: 720, minHeight: 560, title: 'LicitaForce Pregão ao Vivo', icon: icone,
    backgroundColor: '#0b1220', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload-ui.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  principal.loadFile(path.join(__dirname, 'ui', 'index.html'))
  principal.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' } })
  principal.webContents.on('will-navigate', (e) => e.preventDefault())
  // Fechar a janela deixa o programa acompanhando na bandeja; sair só pelo menu.
  principal.on('close', (e) => {
    if (saindo) return
    e.preventDefault(); principal.hide()
    if (portais.size && Notification.isSupported()) new Notification({ title: 'Pregão ao Vivo continua acompanhando', body: 'O programa segue na bandeja, ao lado do relógio.', silent: true }).show()
  })
}

function criarBandeja() {
  bandeja = new Tray(nativeImage.createFromPath(icone).resize({ width: 16, height: 16 }))
  bandeja.setToolTip('LicitaForce Pregão ao Vivo')
  bandeja.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir o Pregão ao Vivo', click: () => { principal.show(); principal.focus() } },
    { type: 'separator' },
    { label: 'Sair', click: () => { saindo = true; app.quit() } },
  ]))
  bandeja.on('click', () => { principal.show(); principal.focus() })
}

// ---------- avisos ----------
const IMPORTANTE = (e) => e.tipo === 'convocacao' || e.tipo === 'situacao' || e.cita_cliente || (e.tipo === 'mensagem' && e.autor === 'Pregoeiro') ||
  (e.tipo === 'fase' && /aleat|encerr|aceit|habilit|recurso|suspens|desempate|adjudic|negocia/i.test(e.texto))

function avisar(sessao, e) {
  if (!IMPORTANTE(e)) return
  const titulo = e.tipo === 'convocacao' ? 'Convocação do pregoeiro' : e.cita_cliente ? 'O pregoeiro citou sua empresa' : e.tipo === 'fase' ? 'Mudança na sessão' : 'Mensagem na sessão'
  if (Notification.isSupported()) {
    const n = new Notification({ title: titulo, body: `${sessao.titulo ?? sessao.chave}\n${e.texto}`.slice(0, 250), icon: icone, urgency: 'critical' })
    n.on('click', () => { principal.show(); principal.focus() })
    n.show()
  }
  enviarUi('tocar', { forte: e.tipo === 'convocacao' || e.cita_cliente })
}

// ---------- portais ----------
function abrirPortal(idConector, ambiente = 'producao') {
  const conector = CONECTORES[idConector]
  if (!conector) throw new Error('Portal ainda não disponível.')
  const aberto = portais.get(idConector)
  if (aberto && !aberto.janela.isDestroyed()) { aberto.janela.show(); aberto.janela.focus(); return }

  const particao = `persist:portal-${idConector}`
  const janela = new BrowserWindow({
    width: 1280, height: 860, title: `${conector.nome} — Pregão ao Vivo`, icon: icone, autoHideMenuBar: true,
    webPreferences: { partition: particao, contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  })
  // Agente de navegador comum (alguns portais recusam o "Electron" no identificador).
  janela.webContents.setUserAgent(janela.webContents.getUserAgent().replace(/\s(Electron|licitaforce[^/]*)\/\S+/gi, ''))
  // Janelas que o portal abrir (gov.br, anexos) ficam na mesma sessão do portal.
  janela.webContents.setWindowOpenHandler(({ url }) => /^https:\/\//.test(url)
    ? { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: icone, webPreferences: { partition: particao, contextIsolation: true, sandbox: true } } }
    : { action: 'deny' })

  const estado = new Map()
  const reg = { janela, logado: false, estado, parar: null }
  portais.set(idConector, reg)
  const amostrar = criarAmostrador(path.join(app.getPath('userData'), 'descoberta', idConector))

  reg.parar = monitorar(janela.webContents, conector, {
    contexto: () => ({ estado, empresas: nuvem?.empresas ?? [], agora: new Date() }),
    amostrar: config.descoberta ? amostrar : null,
    aoLogin: () => { reg.logado = true; atualizarUi() },
    aoChave: (chave) => { comecar(conector, chave).catch((e) => falha(e)) },
    aoEventos: (chave, eventos) => { receber(conector, chave, eventos).catch((e) => falha(e)) },
    aoErro: (m) => falha(new Error(m)),
  })
  janela.on('closed', () => { reg.parar?.(); portais.delete(idConector); atualizarUi() })
  janela.loadURL(conector.entradas[ambiente] ?? conector.entradas.producao)
  atualizarUi()
}

async function comecar(conector, chave) {
  if (!nuvem?.org) return
  const s = await nuvem.garantirSessao(conector.id, chave, conector.tituloDaChave(chave))
  atualizarUi()
  return s
}

async function receber(conector, chave, eventos) {
  if (!nuvem?.org) return
  let s = nuvem.sessaoPorChave(conector.id, chave)
  if (!s) s = await comecar(conector, chave)
  if (!s || s.situacao !== 'acompanhando') return
  nuvem.enfileirar(s.id, eventos)
  for (const e of eventos) {
    recentes.unshift({ ...e, sessao: s.titulo ?? s.chave })
    avisar(s, e)
  }
  recentes.splice(200)
  atualizarUi()
}

function falha(e) {
  status.erro = e?.message ?? String(e)
  atualizarUi()
}

// ---------- ciclo ----------
async function ciclo() {
  if (!nuvem) return
  try {
    if (nuvem.org) {
      await nuvem.sinalDeVida()
      const n = await nuvem.enviarFila()
      status.conectado = true
      if (n) status.ultimoEnvio = new Date().toISOString()
      if (status.erro && /internet|conex/i.test(status.erro)) status.erro = ''
    }
  } catch (e) {
    status.conectado = false
    status.erro = nuvem.erroAmigavel(e)
  }
  atualizarUi()
}

// Eventos saem em poucos segundos; o sinal de vida fica no ciclo de 1 minuto.
async function enviarEventos() {
  if (!nuvem?.org || !nuvem.pendentes()) return
  try {
    if (await nuvem.enviarFila()) { status.ultimoEnvio = new Date().toISOString(); status.conectado = true; atualizarUi() }
  } catch (e) { status.conectado = false; status.erro = nuvem.erroAmigavel(e); atualizarUi() }
}

function registrarIpc() {
  ipcMain.handle('estado', () => estadoUi())
  ipcMain.handle('entrar', async (_e, { email, senha }) => {
    if (typeof email !== 'string' || typeof senha !== 'string') throw new Error('Dados inválidos')
    const conta = await nuvem.entrar(email.trim(), senha)
    status.conectado = true; status.erro = ''
    atualizarUi()
    return conta
  })
  ipcMain.handle('sair', async () => {
    for (const p of portais.values()) if (!p.janela.isDestroyed()) p.janela.close()
    await nuvem.sair(); recentes.length = 0; status.conectado = false
    atualizarUi()
  })
  ipcMain.handle('trocarOrg', async (_e, orgId) => { const c = await nuvem.prepararConta(String(orgId)); atualizarUi(); return c })
  ipcMain.handle('contas', async () => nuvem.prepararConta(nuvem.org?.id))
  ipcMain.handle('abrirPortal', (_e, { id, ambiente }) => { abrirPortal(String(id), ambiente === 'treinamento' ? 'treinamento' : 'producao') })
  ipcMain.handle('situacao', async (_e, { sessaoId, situacao }) => {
    if (!['acompanhando', 'pausada', 'encerrada'].includes(situacao)) throw new Error('Situação inválida')
    await nuvem.mudarSituacao(String(sessaoId), situacao)
    await nuvem.carregarSessoes(); atualizarUi()
  })
  ipcMain.handle('abrirSite', (_e, rota) => shell.openExternal(config.siteUrl + (typeof rota === 'string' && rota.startsWith('/') ? rota : '/app/pregao-ao-vivo')))
}

function atualizacoes() {
  if (!app.isPackaged) return
  try {
    const { autoUpdater } = require('electron-updater')
    autoUpdater.autoInstallOnAppQuit = true
    // Baixa em segundo plano e instala ao sair; nunca reinicia no meio de uma sessão.
    autoUpdater.checkForUpdates().catch(() => {})
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 3600e3)
  } catch { /* sem atualizador */ }
}

app.on('second-instance', () => { if (principal) { principal.show(); principal.focus() } })
app.on('before-quit', () => { saindo = true })
app.on('window-all-closed', () => { /* continua na bandeja */ })

app.whenReady().then(async () => {
  nuvem = criarNuvem({
    config, safeStorage, nomeComputador: os.hostname().slice(0, 80), versao: app.getVersion(),
    arquivoSessao: path.join(app.getPath('userData'), 'conta.bin'),
  })
  registrarIpc()
  criarPrincipal()
  criarBandeja()
  registrar('inicio', app.getVersion(), app.isPackaged ? 'instalado' : 'desenvolvimento')
  try { if (await nuvem.usuario()) { await nuvem.prepararConta(); status.conectado = true } } catch (e) { status.erro = nuvem.erroAmigavel(e) }
  atualizarUi()
  // Autoteste (LICITAFORCE_AUTOTESTE=arquivo.png): abre a tela, salva uma imagem dela e sai.
  if (process.env.LICITAFORCE_AUTOTESTE) {
    principal.webContents.once('did-finish-load', () => setTimeout(async () => {
      if (process.env.LICITAFORCE_AUTOTESTE_PAINEL) {
        // Painel com dados de exemplo (sem conta real), só para conferir o desenho da tela.
        const agora = new Date().toISOString()
        const exemplo = { ...estadoUi(), conta: { org: { nome: 'Org de exemplo' } }, status: { conectado: true, erro: '', ultimoEnvio: agora },
          sessoes: [{ id: '1', chave: '15841905900122026', titulo: 'UASG 158419 · Pregão 90012/2026', situacao: 'acompanhando', ultimo_evento_em: agora, processos: { objeto: 'Papel A4 para as unidades' } }],
          recentes: [
            { tipo: 'convocacao', item: '1', autor: 'Pregoeiro', texto: 'Convoco a empresa EXEMPLO LTDA a enviar a proposta ajustada no prazo de 2 (duas) horas.', quando: agora, prazo: new Date(Date.now() + 7200e3).toISOString(), cita_cliente: true, sessao: 'Pregão 90012/2026' },
            { tipo: 'fase', item: '3', autor: 'Sistema', texto: 'Item 3: Encerramento aleatório', quando: agora, sessao: 'Pregão 90012/2026' },
            { tipo: 'lance', item: '3', autor: 'Sistema', texto: 'Item 3: melhor lance R$ 10,20 · seu lance R$ 10,35', quando: agora, sessao: 'Pregão 90012/2026' },
          ] }
        await principal.webContents.executeJavaScript(`desenhar(${JSON.stringify(exemplo)})`)
        await new Promise((r) => setTimeout(r, 300))
      }
      const img = await principal.webContents.capturePage()
      require('node:fs').writeFileSync(process.env.LICITAFORCE_AUTOTESTE, img.toPNG())
      console.log('AUTOTESTE', await principal.webContents.executeJavaScript('document.body.innerText.slice(0, 600)'))
      saindo = true; app.quit()
    }, 1500))
  }
  setInterval(ciclo, 60_000)
  setInterval(enviarEventos, 3_000)
  atualizacoes()
})
