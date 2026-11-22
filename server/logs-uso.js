// Registro de uso por usuário, gravado no Turso (o Supabase está perto do limite de 500 MB).
// O navegador junta os eventos (páginas abertas, ações, erros e lentidões) e manda em lotes para
// /api/oportunidades?acao=turso-logs-registrar; o master lê em /api/oportunidades?acao=turso-logs.
// Não guarda corpo de requisição nem filtros de busca: só caminho, método, status, tempo e a mensagem de erro.

export const TIPOS = ['pagina', 'acao', 'erro', 'lento']
export const RETENCAO_DIAS = 90
const MAX_EVENTOS = 50

export const ESQUEMA_LOGS = [
  `create table if not exists logs_uso (
    id integer primary key autoincrement, criado_em text not null, usuario text not null, email text,
    org text, tipo text not null, area text, mensagem text not null, detalhe text, duracao_ms integer, navegador text)`,
  'create index if not exists logs_uso_criado on logs_uso(criado_em)',
  'create index if not exists logs_uso_usuario on logs_uso(usuario, criado_em)',
  'create index if not exists logs_uso_tipo on logs_uso(tipo, criado_em)',
]

const corta = (v, n) => (v === null || v === undefined || v === '' ? null : String(v).slice(0, n))
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Valida e enxuga os eventos que vêm do navegador. Descarta o que não tem tipo ou mensagem. */
export function normalizarEventos(eventos, agora = Date.now()) {
  if (!Array.isArray(eventos)) return []
  return eventos.slice(0, MAX_EVENTOS).flatMap((e) => {
    if (!e || typeof e !== 'object' || !TIPOS.includes(e.tipo)) return []
    const mensagem = corta(e.mensagem, 500)
    if (!mensagem) return []
    // Hora do navegador, desde que plausível (até 1 dia atrás); senão, a do servidor.
    const t = Date.parse(e.em)
    const criado = Number.isFinite(t) && t <= agora + 60_000 && t >= agora - 86400_000 ? t : agora
    let detalhe = null
    if (e.detalhe !== undefined && e.detalhe !== null) {
      try { detalhe = corta(typeof e.detalhe === 'string' ? e.detalhe : JSON.stringify(e.detalhe), 2000) } catch { detalhe = null }
    }
    const duracao = Number(e.duracao_ms)
    return [{
      criado_em: new Date(criado).toISOString(), tipo: e.tipo, area: corta(e.area, 200), mensagem, detalhe,
      duracao_ms: Number.isFinite(duracao) && duracao >= 0 ? Math.min(Math.round(duracao), 3_600_000) : null,
    }]
  })
}

let esquemaPronto = false
async function garantirEsquema(turso) {
  if (esquemaPronto) return
  await turso.pipeline(ESQUEMA_LOGS.map((s) => [s]))
  esquemaPronto = true
}
export function _reiniciarEsquema() { esquemaPronto = false }

/** Grava um lote do usuário. De vez em quando apaga o que passou da retenção. */
export async function registrarLogs(turso, { usuario, email, org, navegador }, eventos, sortear = Math.random) {
  const lista = normalizarEventos(eventos)
  if (!lista.length) return 0
  await garantirEsquema(turso)
  const orgOk = typeof org === 'string' && UUID.test(org) ? org : null
  const comandos = lista.map((e) => [
    'insert into logs_uso(criado_em, usuario, email, org, tipo, area, mensagem, detalhe, duracao_ms, navegador) values(?,?,?,?,?,?,?,?,?,?)',
    [e.criado_em, usuario, corta(email, 254), orgOk, e.tipo, e.area, e.mensagem, e.detalhe, e.duracao_ms, corta(navegador, 200)],
  ])
  if (sortear() < 0.02) comandos.push([`delete from logs_uso where criado_em < ?`, [new Date(Date.now() - RETENCAO_DIAS * 86400_000).toISOString()]])
  await turso.pipeline(comandos)
  return lista.length
}

/** Consulta do master: eventos filtrados (mais novos primeiro), resumo por usuário e totais das últimas 24 h. */
export async function consultarLogs(turso, filtros = {}) {
  await garantirEsquema(turso)
  const horas = [1, 24, 168, 720, 2160].includes(Number(filtros.horas)) ? Number(filtros.horas) : 168
  const desde = new Date(Date.now() - horas * 3600_000).toISOString()
  const dia = new Date(Date.now() - 86400_000).toISOString()
  const onde = ['criado_em >= ?'], args = [desde]
  if (TIPOS.includes(filtros.tipo)) { onde.push('tipo = ?'); args.push(filtros.tipo) }
  if (filtros.usuario && UUID.test(String(filtros.usuario))) { onde.push('usuario = ?'); args.push(String(filtros.usuario)) }
  const busca = String(filtros.busca ?? '').trim().slice(0, 100)
  if (busca) { onde.push(`(email like ? escape '\\' or mensagem like ? escape '\\' or area like ? escape '\\')`); const b = `%${busca.replace(/[\\%_]/g, (c) => '\\' + c)}%`; args.push(b, b, b) }
  const antes = Number(filtros.antes)
  const ondeEventos = [...onde], argsEventos = [...args]
  if (Number.isInteger(antes) && antes > 0) { ondeEventos.push('id < ?'); argsEventos.push(antes) }
  const limite = 100
  const [eventos, usuarios, totais] = await turso.lote([
    [`select id, criado_em, usuario, email, org, tipo, area, mensagem, detalhe, duracao_ms, navegador from logs_uso
      where ${ondeEventos.join(' and ')} order by id desc limit ${limite + 1}`, argsEventos],
    [`select usuario, max(email) as email, max(org) as org, count(*) as eventos,
        sum(tipo = 'erro') as erros, sum(tipo = 'lento') as lentos, max(criado_em) as ultimo
      from logs_uso where ${onde.join(' and ')} group by usuario order by erros desc, lentos desc, ultimo desc limit 200`, args],
    [`select count(*) as eventos, coalesce(sum(tipo = 'erro'), 0) as erros, coalesce(sum(tipo = 'lento'), 0) as lentos,
        count(distinct usuario) as usuarios from logs_uso where criado_em >= ?`, [dia]],
  ])
  return { eventos: eventos.slice(0, limite), haMais: eventos.length > limite, usuarios, ultimas24h: totais[0] ?? { eventos: 0, erros: 0, lentos: 0, usuarios: 0 } }
}
