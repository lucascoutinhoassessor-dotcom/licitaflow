// Tela principal do Pregão ao Vivo. Só fala com o processo principal pela ponte window.pav.
const $ = (id) => document.getElementById(id)
const el = (tag, cls, texto) => { const e = document.createElement(tag); if (cls) e.className = cls; if (texto != null) e.textContent = texto; return e }
const hora = (iso) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''

const ROTULO = { mensagem: 'Mensagem', convocacao: 'Convocação', fase: 'Fase', lance: 'Lance', posicao: 'Posição', situacao: 'Sessão', aviso: 'Aviso' }
const SITUACAO = { acompanhando: 'Acompanhando', pausada: 'Pausada', encerrada: 'Encerrada' }

function botao(texto, cls, fn) { const b = el('button', cls, texto); b.addEventListener('click', fn); return b }

async function agir(fn, botaoAlvo) {
  if (botaoAlvo) botaoAlvo.disabled = true
  try { await fn() } catch (e) { mostrarErro(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')) } finally { if (botaoAlvo) botaoAlvo.disabled = false }
}
function mostrarErro(m) { const f = $('erroGeral'); f.textContent = m; f.classList.toggle('oculto', !m) }

function desenhar(s) {
  const logado = !!s.conta
  $('entrar').classList.toggle('oculto', logado)
  $('painel').classList.toggle('oculto', !logado)
  $('ponto').className = 'ponto ' + (logado && s.status.conectado ? 'ok' : logado ? 'alerta' : '')

  const topo = $('topoDir'); topo.replaceChildren()
  if (logado) {
    topo.append(el('span', 'mudo', s.conta.org.nome), botao('Sair', 'link', () => agir(() => window.pav.sair())))
  }
  if (!logado) return
  mostrarErro(s.status.erro)

  const portais = $('portais'); portais.replaceChildren()
  for (const p of s.portais) {
    const c = el('div', 'portal' + (p.disponivel ? '' : ' desligado'))
    c.append(el('strong', null, p.nome))
    if (!p.disponivel) { c.append(el('span', 'selo', 'em breve')); portais.append(c); continue }
    c.append(el('span', 'selo ' + (p.logado ? 'ok' : p.aberto ? 'alerta' : ''), p.logado ? 'logado' : p.aberto ? 'aguardando login' : 'fechado'))
    const acoes = el('div', 'acoes')
    acoes.append(botao(p.aberto ? 'Mostrar janela' : 'Abrir portal', '', (e) => agir(() => window.pav.abrirPortal(p.id, 'producao'), e.target)))
    if (!p.aberto) acoes.append(botao('Treinamento', 'secundario', (e) => agir(() => window.pav.abrirPortal(p.id, 'treinamento'), e.target)))
    c.append(acoes)
    portais.append(c)
  }

  const lista = $('sessoes'); lista.replaceChildren()
  if (!s.sessoes.length) lista.append(el('li', 'vazio', 'Nenhuma sessão ainda. Abra a sala de disputa de um pregão na janela do portal.'))
  for (const x of s.sessoes) {
    const li = el('li', 'sessao')
    const info = el('div')
    info.append(el('strong', null, x.titulo ?? x.chave))
    info.append(el('div', 'mudo', [x.processos?.objeto ? 'Processo: ' + x.processos.objeto.slice(0, 90) : 'Sem processo ligado', x.ultimo_evento_em ? 'último evento ' + hora(x.ultimo_evento_em) : ''].filter(Boolean).join(' · ')))
    li.append(info, el('span', 'selo ' + (x.situacao === 'acompanhando' ? 'ok' : ''), SITUACAO[x.situacao] ?? x.situacao))
    const acoes = el('div', 'acoes')
    if (x.situacao === 'acompanhando') acoes.append(botao('Pausar', 'secundario', (e) => agir(() => window.pav.situacao(x.id, 'pausada'), e.target)))
    else acoes.append(botao('Retomar', 'secundario', (e) => agir(() => window.pav.situacao(x.id, 'acompanhando'), e.target)))
    acoes.append(botao('Encerrar', 'secundario', (e) => agir(() => window.pav.situacao(x.id, 'encerrada'), e.target)))
    li.append(acoes)
    lista.append(li)
  }

  const ev = $('eventos'); ev.replaceChildren()
  if (!s.recentes.length) ev.append(el('li', 'vazio', 'As mensagens do pregoeiro, convocações, fases dos itens e lances aparecem aqui assim que acontecem.'))
  for (const e of s.recentes) {
    const li = el('li', 'evento ' + e.tipo + (e.cita_cliente ? ' cita' : ''))
    const cab = el('div', 'cab')
    cab.append(el('span', 'tipo', ROTULO[e.tipo] ?? e.tipo), el('span', 'mudo', [e.sessao, e.item ? 'item ' + e.item : '', e.autor, hora(e.quando)].filter(Boolean).join(' · ')))
    li.append(cab, el('p', null, e.texto))
    if (e.prazo) li.append(el('p', 'prazo', 'Prazo: ' + hora(e.prazo)))
    ev.append(li)
  }

  window.desenharGuia?.(s)
  window.desenharDisputa?.(s)

  $('rodape').textContent = `Computador ${s.computador} · versão ${s.versao}` + (s.pendentes ? ` · ${s.pendentes} evento(s) aguardando envio` : '') +
    (s.status.ultimoEnvio ? ` · último envio ${hora(s.status.ultimoEnvio)}` : '')
}

$('formEntrar').addEventListener('submit', async (ev) => {
  ev.preventDefault()
  $('erroEntrar').textContent = ''
  $('botaoEntrar').disabled = true
  try { await window.pav.entrar($('email').value, $('senha').value); $('senha').value = '' } catch (e) {
    $('erroEntrar').textContent = e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
  } finally { $('botaoEntrar').disabled = false }
})
$('verSite').addEventListener('click', () => window.pav.abrirSite('/app/pregao-ao-vivo'))

window.pav.aoEstado(desenhar)
window.pav.aoTocar(({ forte }) => {
  const a = $('som'); a.currentTime = 0; a.volume = forte ? 1 : 0.6
  a.play().catch(() => {})
})
window.pav.estado().then(desenhar)
