// Cota mensal do Turso: o plano grátis bloqueia o banco quando passa do limite de linhas lidas ou escritas do mês.
// O cliente (server/turso.js) soma as linhas que o próprio Turso informa em cada resposta (rows_read/rows_written)
// e guarda o total do ciclo em coleta_estado. Com o total em mãos, o app freia sozinho antes de chegar ao limite:
//   normal   (< 70%)  tudo como sempre;
//   economia (70–90%) contagens da busca ficam 30 min em cache, a coleta roda em minutos alternados e os logs param;
//   critico  (90–97%) a busca volta para o Postgres e a coleta só acompanha as atualizações do dia (sem carga e sem itens);
//   parado   (≥ 97%)  a coleta para; nada mais lê nem escreve no Turso até virar o ciclo.
// Se o ritmo do ciclo projeta passar de 100% antes do fim, o nível sobe para "economia" mais cedo.
// Trocar de plano: TURSO_PLANO na Vercel (gratis, developer, scaler ou pro) e um Redeploy. Passo a passo em docs/turso.md.

/** Limites mensais de cada plano (linhas). Conferir em turso.tech/pricing; TURSO_LIMITE_* sobrepõe. */
export const PLANOS = {
  gratis: { nome: 'Grátis', leituras: 500_000_000, escritas: 10_000_000 },
  developer: { nome: 'Developer', leituras: 2_500_000_000, escritas: 25_000_000 },
  scaler: { nome: 'Scaler', leituras: 100_000_000_000, escritas: 100_000_000 },
  pro: { nome: 'Pro', leituras: 250_000_000_000, escritas: 250_000_000 },
}
const APELIDOS = { free: 'gratis', starter: 'gratis', 'grátis': 'gratis', hobby: 'gratis' }
export const NIVEIS = ['normal', 'economia', 'critico', 'parado']

const positivo = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : null }

/** Plano e limites a partir das variáveis da Vercel. */
export function configCota(env = process.env) {
  // Esta instalação do LicitaForce usa o Developer; uma configuração explícita continua prevalecendo.
  const id0 = String(env.TURSO_PLANO ?? 'developer').trim().toLowerCase()
  const id = PLANOS[id0] ? id0 : APELIDOS[id0] ?? 'gratis'
  const p = PLANOS[id]
  const dia = positivo(env.TURSO_CICLO_DIA)
  return {
    plano: id, nome: p.nome,
    leituras: positivo(env.TURSO_LIMITE_LEITURAS) ?? p.leituras,
    escritas: positivo(env.TURSO_LIMITE_ESCRITAS) ?? p.escritas,
    diaCiclo: dia && dia <= 28 ? dia : 1,
  }
}

/** Ciclo de cobrança atual (UTC): começa no dia diaCiclo de cada mês. */
export function cicloAtual(agora = new Date(), diaCiclo = 1) {
  let a = agora.getUTCFullYear(), m = agora.getUTCMonth()
  if (agora.getUTCDate() < diaCiclo) { m--; if (m < 0) { m = 11; a-- } }
  const inicio = new Date(Date.UTC(a, m, diaCiclo)), fim = new Date(Date.UTC(a, m + 1, diaCiclo))
  return { chave: inicio.toISOString().slice(0, 10), inicio, fim }
}

export const chavesConsumo = (ciclo) => ({ lidas: `lidas:${ciclo}`, escritas: `escritas:${ciclo}` })

/** Soma no total do ciclo (coleta_estado guarda texto; a soma converte). */
export const comandoSomar = (chave, n, agora = new Date().toISOString()) => [
  `insert into coleta_estado(chave,valor,atualizado_em) values(?,?,?)
    on conflict(chave) do update set valor = cast(cast(coleta_estado.valor as integer) + cast(excluded.valor as integer) as text), atualizado_em = excluded.atualizado_em`,
  [chave, String(Math.max(0, Math.round(n))), agora],
]

function nivelDe(uso, projecao) {
  const i = uso >= 0.97 ? 3 : uso >= 0.9 ? 2 : uso >= 0.7 ? 1 : 0
  // Ritmo: depois de 30% gastos, se a projeção do ciclo passa de 100%, já economiza.
  return Math.max(i, uso >= 0.3 && projecao > 1 ? 1 : 0)
}

/**
 * Nível de cada recurso a partir do estado guardado (chave → valor) e do que ainda não foi descarregado.
 * Devolve números para a tela do master e os níveis para o app decidir.
 */
export function nivelCota(estado, cfg, { agora = new Date(), pendente = { lidas: 0, escritas: 0 } } = {}) {
  const ciclo = cicloAtual(agora, cfg.diaCiclo), k = chavesConsumo(ciclo.chave)
  const lidas = (Number(estado?.[k.lidas]) || 0) + (pendente.lidas || 0)
  const escritas = (Number(estado?.[k.escritas]) || 0) + (pendente.escritas || 0)
  const decorrido = Math.max(1 / 48, (agora - ciclo.inicio) / (ciclo.fim - ciclo.inicio)) // meio dia no mínimo, para o 1º dia não exagerar
  const usoLeituras = lidas / cfg.leituras, usoEscritas = escritas / cfg.escritas
  const iL = nivelDe(usoLeituras, usoLeituras / decorrido), iE = nivelDe(usoEscritas, usoEscritas / decorrido)
  return {
    plano: cfg.plano, nomePlano: cfg.nome, ciclo: ciclo.chave, cicloFim: ciclo.fim.toISOString(),
    lidas, escritas, limiteLeituras: cfg.leituras, limiteEscritas: cfg.escritas,
    usoLeituras, usoEscritas, projecaoLeituras: usoLeituras / decorrido, projecaoEscritas: usoEscritas / decorrido,
    leituras: NIVEIS[iL], escritasNivel: NIVEIS[iE], nivel: NIVEIS[Math.max(iL, iE)],
  }
}

/** true se o nível a é pelo menos b. */
export const peloMenos = (a, b) => NIVEIS.indexOf(a) >= NIVEIS.indexOf(b)
