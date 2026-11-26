// Somente servidor: e-mails da plataforma por SMTP (Gmail com senha de app ou outro provedor),
// configurados em Master → Integrações. Mesmo padrão do CallBot AI: remetente "LicitaForce", logo e botão.
import nodemailer from 'nodemailer'
import { decifrar } from './asaas.js'
import { LOGO_PNG_BASE64 } from './logo-email.js'

export const URL_SITE = 'https://licitaforce-app.vercel.app'
export const NOME_PADRAO = 'LicitaForce'
const COR = '#1d4ed8'

/** Configuração de envio a partir da linha de plataforma_email (senha decifrada). null se incompleta. */
export function montarSmtp(linha, env) {
  if (!linha?.host || !linha.usuario || !linha.senha_cifrada) return null
  return {
    ativo: !!linha.ativo, boasVindas: !!linha.boas_vindas,
    host: linha.host, porta: linha.porta || 465, usuario: linha.usuario, senha: decifrar(linha.senha_cifrada, env),
    nome: String(linha.remetente_nome || NOME_PADRAO).replace(/["\r\n<>]/g, '').trim() || NOME_PADRAO,
    endereco: linha.remetente_email || linha.usuario,
  }
}

export class ErroEmail extends Error {}

export async function enviarEmail(cfg, { para, assunto, html, texto }, transporte = nodemailer.createTransport) {
  const t = transporte({
    host: cfg.host, port: cfg.porta, secure: cfg.porta === 465, auth: { user: cfg.usuario, pass: cfg.senha },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  })
  try {
    return await t.sendMail({
      from: { name: cfg.nome, address: cfg.endereco }, to: para, subject: assunto, html, text: texto,
      attachments: html.includes('cid:licitaflow-logo')
        ? [{ filename: 'licitaforce.png', content: Buffer.from(LOGO_PNG_BASE64, 'base64'), cid: 'licitaflow-logo', contentDisposition: 'inline' }]
        : [],
    })
  } catch (e) {
    if (e?.responseCode === 535 || e?.code === 'EAUTH') throw new ErroEmail('O Gmail recusou o login. Confira o e-mail e use uma “senha de app” (não a senha normal da conta).')
    throw new ErroEmail('Não foi possível enviar o e-mail: ' + String(e?.message || 'falha de conexão').slice(0, 160))
  }
}

// ---------------- modelos ----------------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const data = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR') : '')
const ola = (nome) => (nome ? `Olá, ${String(nome).trim().split(/\s+/)[0]}!` : 'Olá!')

function layout(titulo, corpo, site = URL_SITE) {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
<div style="max-width:520px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7">
<div style="background:${COR};color:#ffffff;padding:18px 24px;font-size:18px;font-weight:bold"><img src="cid:licitaflow-logo" width="40" height="40" alt="LicitaForce" style="vertical-align:middle;margin-right:12px;border-radius:8px">LicitaForce</div>
<div style="padding:24px"><h1 style="font-size:20px;margin:0 0 16px">${esc(titulo)}</h1>${corpo}</div>
<div style="padding:16px 24px;font-size:12px;color:#71717a;border-top:1px solid #e4e4e7">Você recebeu este e-mail porque tem uma conta no LicitaForce. <a href="${site}" style="color:${COR}">${site.replace(/^https?:\/\//, '')}</a></div>
</div></body></html>`
}
const botao = (url, rotulo) =>
  `<p style="margin:24px 0"><a href="${esc(url)}" style="background:${COR};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;display:inline-block">${esc(rotulo)}</a></p>`
const nota = (t) => `<p style="font-size:13px;color:#52525b">${t}</p>`

/** "Esqueci minha senha". */
export function emailRedefinirSenha({ nome, url }) {
  const html = layout('Redefinir sua senha', `<p>${esc(ola(nome))}</p><p>Recebemos um pedido para criar uma nova senha para sua conta. Clique no botão abaixo (o link vale por 1 hora e só pode ser usado uma vez):</p>${botao(url, 'Criar nova senha')}${nota('Se não foi você, ignore este e-mail: sua senha atual continua valendo.')}`)
  const texto = `${ola(nome)}\n\nPara criar uma nova senha, abra (vale por 1 hora): ${url}\n\nSe não foi você, ignore este e-mail.`
  return { assunto: 'Redefinir sua senha do LicitaForce', html, texto }
}

/** Confirmação do cadastro. */
export function emailConfirmarCadastro({ nome, url }) {
  const html = layout('Confirme seu e-mail', `<p>${esc(ola(nome))}</p><p>Falta só um passo para ativar sua conta no LicitaForce. Clique no botão abaixo para confirmar seu e-mail e continuar o cadastro:</p>${botao(url, 'Confirmar meu e-mail')}${nota('Se você não criou uma conta no LicitaForce, ignore este e-mail.')}`)
  const texto = `${ola(nome)}\n\nConfirme seu e-mail para ativar sua conta no LicitaForce: ${url}\n\nSe você não criou uma conta, ignore este e-mail.`
  return { assunto: 'Confirme seu e-mail no LicitaForce', html, texto }
}

/** Primeiro pagamento confirmado (dados vindos de reservar_boas_vindas). */
export function emailAcessoLiberado(d) {
  const login = `${URL_SITE}/entrar`
  const ate = data(d.pago_ate)
  const html = layout('Seu acesso ao LicitaForce está liberado', `<p>${esc(ola(d.nome))}</p>
<p>O pagamento da empresa <b>${esc(d.organizacao)}</b> foi confirmado e o plano <b>${esc(d.plano)}</b> (${esc(d.ciclo)}) já está liberado${ate ? `, com acesso pago até <b>${ate}</b>` : ''}.</p>
<p><b>Seus dados de acesso:</b><br>Endereço: <a href="${login}" style="color:${COR}">${esc(login)}</a><br>E-mail: <b>${esc(d.email)}</b><br>Senha: ${d.senha ? `<b>${esc(d.senha)}</b>` : 'a definida no cadastro'}.</p>
${botao(login, 'Entrar no LicitaForce')}
${nota(`Esqueceu a senha? <a href="${URL_SITE}/recuperar-senha" style="color:${COR}">Crie uma nova aqui</a>. O recibo e as próximas faturas chegam pelo Asaas, nosso parceiro de pagamentos.`)}
<p>Dica: no celular, abra o LicitaForce e toque em “Instalar o app” para usar como aplicativo e receber avisos.</p>`)
  const texto = `${ola(d.nome)}\n\nO pagamento da empresa ${d.organizacao} foi confirmado e o plano ${d.plano} já está liberado${ate ? ` (pago até ${ate})` : ''}.\n\nEndereço: ${login}\nE-mail: ${d.email}\nSenha: ${d.senha || 'a definida no cadastro'}.\n\nEsqueceu a senha? ${URL_SITE}/recuperar-senha`
  return { assunto: 'Seu acesso ao LicitaForce está liberado', html, texto }
}

/** Cupom de dias de acesso resgatado pelo cliente: confirma o acesso no e-mail cadastrado. */
export function emailCupomAcesso({ nome, email, organizacao, codigo, dias, ate }) {
  const login = `${URL_SITE}/entrar`
  const fim = data(ate)
  const html = layout('Seu acesso ao LicitaForce foi liberado', `<p>${esc(ola(nome))}</p>
<p>O cupom <b>${esc(codigo)}</b> foi aplicado na empresa <b>${esc(organizacao)}</b>: são <b>${esc(dias)} dias</b> de acesso${fim ? `, até <b>${fim}</b>` : ''}.</p>
<p><b>Seus dados de acesso:</b><br>Endereço: <a href="${login}" style="color:${COR}">${esc(login)}</a><br>E-mail: <b>${esc(email)}</b><br>Senha: a definida no cadastro.</p>
${botao(login, 'Entrar no LicitaForce')}
${nota(`Esqueceu a senha? <a href="${URL_SITE}/recuperar-senha" style="color:${COR}">Crie uma nova aqui</a>.`)}`)
  const texto = `${ola(nome)}\n\nO cupom ${codigo} foi aplicado na empresa ${organizacao}: ${dias} dias de acesso${fim ? `, até ${fim}` : ''}.\n\nEndereço: ${login}\nE-mail: ${email}\nSenha: a definida no cadastro.\n\nEsqueceu a senha? ${URL_SITE}/recuperar-senha`
  return { assunto: 'Seu acesso ao LicitaForce foi liberado', html, texto }
}

/** Master liberou a conta (ou reenviou o acesso): endereço, e-mail de login e, se houver, o link para criar a senha. */
export function emailContaLiberada({ nome, email, organizacao, ate, urlSenha }) {
  const login = `${URL_SITE}/entrar`
  const fim = data(ate)
  const html = layout('Sua conta no LicitaForce está liberada', `<p>${esc(ola(nome))}</p>
<p>A conta da empresa <b>${esc(organizacao)}</b> está liberada${fim ? `, com acesso até <b>${fim}</b>` : ''}.</p>
<p><b>Seus dados de acesso:</b><br>Endereço: <a href="${login}" style="color:${COR}">${esc(login)}</a><br>E-mail: <b>${esc(email)}</b></p>
${urlSenha ? `<p>Para definir a sua senha, use o botão abaixo (o link vale por 1 hora):</p>${botao(urlSenha, 'Criar minha senha')}` : botao(login, 'Entrar no LicitaForce')}
${nota(`Esqueceu a senha depois? <a href="${URL_SITE}/recuperar-senha" style="color:${COR}">Crie uma nova aqui</a>.`)}`)
  const texto = `${ola(nome)}\n\nA conta da empresa ${organizacao} está liberada${fim ? `, com acesso até ${fim}` : ''}.\n\nEndereço: ${login}\nE-mail: ${email}${urlSenha ? `\nCrie sua senha (vale 1 hora): ${urlSenha}` : ''}`
  return { assunto: 'Sua conta no LicitaForce está liberada', html, texto }
}

/** Resumo das oportunidades novas, com acesso ao Radar para decidir a participação. */
export function emailRadar({ nome, empresa, org_id, empresa_id, oportunidades }) {
  const site = 'https://licitaforce.com.br'
  const urlRadar = `${site}/app/agentes/radar?org=${encodeURIComponent(org_id)}&empresa=${encodeURIComponent(empresa_id)}`
  const quantidade = oportunidades.length
  const titulo = `${quantidade} ${quantidade === 1 ? 'oportunidade nova' : 'oportunidades novas'} para ${empresa}`
  const fichas = oportunidades.map((o) => {
    const prazo = o.encerramento && Number.isFinite(Date.parse(o.encerramento))
      ? new Date(o.encerramento).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) + ' (Brasília)' : 'Não informado'
    const valor = o.valor != null && Number.isFinite(Number(o.valor))
      ? Number(o.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Não informado'
    const url = `${urlRadar}&sugestao=${encodeURIComponent(o.id)}`
    const motivos = Array.isArray(o.motivos) ? o.motivos : []
    return {
      html: `<div style="border:1px solid #e4e4e7;border-radius:8px;padding:16px;margin:16px 0"><h2 style="font-size:16px;margin:0 0 12px">${esc(o.objeto || 'Objeto não informado')}</h2><p>Órgão: ${esc(o.orgao || 'Não informado')}${o.uf ? ` / ${esc(o.uf)}` : ''}<br>Valor estimado: <b>${esc(valor)}</b><br>Prazo das propostas: <b>${esc(prazo)}</b></p>${motivos.length ? nota(motivos.map(esc).join('<br>')) : ''}${botao(url, 'Avaliar oportunidade')}</div>`,
      texto: `${o.objeto || 'Objeto não informado'}\nÓrgão: ${o.orgao || 'Não informado'} / ${o.uf || ''}\nValor estimado: ${valor}\nPrazo das propostas: ${prazo}\n${motivos.join('\n')}\nAvaliar oportunidade: ${url}`,
    }
  })
  return {
    assunto: `Radar LicitaForce · ${titulo}`.replace(/[\r\n]/g, ' '),
    html: layout(titulo, `<p>${esc(ola(nome))}</p><p>O Radar encontrou editais que combinam com o perfil da empresa <b>${esc(empresa)}</b>. Confira as oportunidades e escolha quais deseja adicionar ao funil para participar.</p>${fichas.map((f) => f.html).join('')}${botao(urlRadar, 'Ver oportunidades no Radar')}${nota('Entre com sua conta LicitaForce para ver os detalhes, adicionar ao funil ou descartar. Confira o edital antes de decidir participar.')}`, site),
    texto: `${ola(nome)}\n\n${titulo}\nEscolha no Radar quais oportunidades deseja adicionar ao funil para participar.\n\n${fichas.map((f) => f.texto).join('\n\n')}\n\nVer oportunidades no Radar: ${urlRadar}\nEntre com sua conta LicitaForce. Confira o edital antes de decidir participar.`,
  }
}

export function emailTeste() {
  return { assunto: 'Teste de e-mail do LicitaForce', html: layout('Envio funcionando', '<p>Este é um e-mail de teste enviado pelo Painel Master. Se chegou com o nome e o logo do LicitaForce, está tudo certo.</p>'), texto: 'Este é um e-mail de teste enviado pelo Painel Master.' }
}
