// Ensaia o agente Termômetro de Pagamento (migration 20261123000100) num Postgres em memória.
// Uso: node scripts/test-termometro.mjs
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'

const db = new PGlite()
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema storage;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', created_at timestamptz default now(), last_sign_in_at timestamptz, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
grant usage on schema public, auth, storage to authenticated, anon, service_role;`)
for (const f of readdirSync('supabase/migrations').filter((x) => x.endsWith('.sql')).sort()) await db.exec(readFileSync('supabase/migrations/' + f, 'utf8'))
await db.exec('grant select, insert, update, delete on all tables in schema public to authenticated, service_role; grant usage on all sequences in schema public to authenticated, service_role;')

let n = 0
const ok = (v, m) => { if (!v) { console.log('FAIL', m); process.exit(1) } n++; console.log('PASS', m) }
const U1 = '11111111-1111-1111-1111-111111111111'
await db.exec(`insert into auth.users (id, email) values ('${U1}', 'a@t.com')`)
async function como(papel, sql, params) {
  await db.exec(papel === 'anon' ? 'set role anon' : papel === 'servico' ? 'set role service_role' : `set role authenticated; select set_config('request.jwt.sub', '${papel}', false);`)
  try { return (await db.query(sql, params)).rows } finally { await db.exec(`reset role; select set_config('request.jwt.sub', '', false);`) }
}
const falha = async (p, sql, params) => { try { await como(p, sql, params); return false } catch { return true } }
const token = (await db.query('select token from licitaflow_termometro.config')).rows[0].token

const linhas = [
  { chave: 'M:4304705', esfera: 'M', ibge: '4304705', uf: 'RS', nome: 'Carazinho', nota: 'A', indicador3: 0.085, nota3: 'A', posicao: '01/09/2026' },
  { chave: 'E:MG', esfera: 'E', ibge: null, uf: 'MG', nome: 'Minas Gerais', nota: 'D', indicador3: -0.17, nota3: 'C', posicao: '2026' },
  { chave: 'X:1', esfera: 'M', uf: 'RS', nome: 'inválida' },
]
ok((await como('servico', 'select public.termometro_gravar($1, $2, $3) r', [token, JSON.stringify(linhas), JSON.stringify({ municipios: 'm1' })]))[0].r === 2, 'servidor grava os entes válidos e ignora chave inválida')
ok((await db.query('select recursos from licitaflow_termometro.config')).rows[0].recursos.municipios === 'm1', 'guarda o id do arquivo carregado')
ok((await db.query(`select nome_busca from public.capag where chave = 'E:MG'`)).rows[0].nome_busca === 'minas gerais', 'nome sem acento para busca')
await como('servico', 'select public.termometro_gravar($1, $2)', [token, JSON.stringify([{ ...linhas[0], nota: 'B' }])])
ok((await db.query(`select nota from public.capag where chave = 'M:4304705'`)).rows[0].nota === 'B', 'nota nova substitui a antiga')
ok(await falha('servico', `select public.termometro_gravar('errado', '[]')`), 'token errado é recusado')
ok(await falha(U1, 'select public.termometro_gravar($1, $2)', [token, '[]']), 'cliente não grava a CAPAG')
ok((await como(U1, 'select chave from public.capag')).length === 2, 'usuário logado lê a CAPAG')
ok(await falha('anon', 'select chave from public.capag') || (await como('anon', 'select chave from public.capag')).length === 0, 'visitante não lê')
ok(await falha(U1, 'select public.termometro_estado($1)', [token]), 'cliente não consulta o estado interno')
const planos = Object.fromEntries((await db.query('select id, limites_ia from public.plataforma_planos')).rows.map((x) => [x.id, x.limites_ia]))
ok(planos.trial.termometro === null && planos.essencial.termometro === null && planos.assessoria.termometro === null && planos.cancelado.termometro === 0, 'Termômetro em todos os planos sem limite, exceto Cancelado')

// Federal: liquidação → pagamento pelo empenho (FIFO), resumo por UG e pelo órgão.
const E1 = '158129264042026NE000001', E2 = '158129264042026NE000002', E3 = '200360000012026NE000009'
const ugs = [['158129', 'INST FED BAIANO', '26404', 'Instituto Federal Baiano', '26000', 'Ministério da Educação'], ['200360', 'SR/PF/SP', '30108', 'Polícia Federal', '30000', 'MJSP']]
const dia = (d, liq, pag, u = []) => como('servico', 'select public.termometro_federal_dia($1, $2, $3, $4, $5) r', [token, d, JSON.stringify(liq), JSON.stringify(pag), JSON.stringify(u)])
// 01/10: E1 liquida (serviço de agosto), E2 e E3 liquidam.
ok((await dia('20261001', [[E1, '2026-10-01', '2026-08-31'], [E2, '2026-10-01', null], [E3, '2026-10-01', null]], [], ugs))[0].r.casados === 0, 'liquidação sem pagamento fica na fila')
// 05/10: E1 pago (4 dias). E2 pago duas vezes no dia: só uma liquidação aberta, casa uma.
ok((await dia('20261005', [], [[E1, '2026-10-05'], [E2, '2026-10-05'], [E2, '2026-10-05']]))[0].r.casados === 2, 'cada pagamento quita uma liquidação aberta do empenho')
ok((await dia('20261005', [], [[E3, '2026-10-05']]))[0].r.situacao === 'já gravado', 'dia repetido não conta de novo')
// 10/11: E2 liquida de novo e é pago no mesmo dia; E3 pago 40 dias depois.
await dia('20261110', [[E2, '2026-11-10', null]], [[E2, '2026-11-10'], [E3, '2026-11-10']])
const t = Object.fromEntries((await db.query(`select ug || ':' || to_char(mes, 'MM') k, n, soma_dias, ate5, acima30, nc, soma_c, c60 from public.termometro_federal`)).rows.map((x) => [x.k, x]))
ok(t['158129:10'].n === 2 && t['158129:10'].soma_dias === 8 && t['158129:10'].ate5 === 2, 'resumo de outubro: 2 pagamentos, 4 dias cada')
ok(t['158129:10'].nc === 1 && t['158129:10'].soma_c === 35 && t['158129:10'].c60 === 0, 'mês do serviço: 35 dias entre o fim de agosto e o pagamento')
ok(t['158129:11'].n === 1 && t['158129:11'].soma_dias === 0, 'pago no mesmo dia da liquidação conta 0 dias')
ok(t['200360:11'].acima30 === 1 && t['200360:11'].soma_dias === 40, 'pagamento com mais de 30 dias')
ok((await db.query('select count(*)::int c from licitaflow_termometro.fed_pendente')).rows[0].c === 0, 'liquidações pagas saem da fila')
ok(await falha(U1, 'select public.termometro_federal_dia($1, $2, $3, $4, $5)', [token, '20261201', '[]', '[]', '[]']), 'cliente não grava o federal')
ok((await como(U1, 'select public.termometro_federal_posicao() r'))[0].r === '20261110', 'posição: último dia lido')
ok((await como(U1, `select nome from public.termometro_federal_ug where nome_busca like '%baiano%'`)).length === 1, 'busca de UG pelo nome')
const cons = (await como(U1, `select public.termometro_federal_consulta(array['158129', '999999']) r`))[0].r
ok(cons.length === 1 && cons[0].orgao === 'Instituto Federal Baiano', 'consulta devolve só a UG conhecida')

// Lotes: o dia só conta como lido no último lote; lote repetido não grava de novo; fora de ordem é recusado.
const E4 = '158129264042026NE000004', E5 = '158129264042026NE000005'
await dia('20261111', [[E4, '2026-11-11', null], [E5, '2026-11-11', null]], [])
const lote = (d, parte, partes, liq, pag) => como('servico', 'select public.termometro_federal_dia($1, $2, $3, $4, $5, $6, $7) r', [token, d, JSON.stringify(liq), JSON.stringify(pag), '[]', parte, partes])
ok((await lote('20261112', 0, 2, [], [[E4, '2026-11-12']]))[0].r.casados === 1, 'primeiro lote grava')
const cfg = async () => (await db.query('select recursos from licitaflow_termometro.config')).rows[0].recursos
ok((await cfg()).federal === '20261111' && (await cfg()).federal_parte === '20261112:1', 'no meio do dia guarda o lote, não o dia')
ok((await lote('20261112', 0, 2, [], [[E4, '2026-11-12']]))[0].r.situacao === 'já gravado', 'lote repetido não conta de novo')
ok(await falha('servico', 'select public.termometro_federal_dia($1, $2, $3, $4, $5, $6, $7)', [token, '20261113', '[]', '[]', '[]', 0, 1]), 'dia seguinte antes de terminar o atual é recusado')
ok((await lote('20261112', 1, 2, [], [[E5, '2026-11-12']]))[0].r.casados === 1, 'último lote grava')
ok((await cfg()).federal === '20261112' && !('federal_parte' in (await cfg())), 'no último lote o dia conta como lido')
ok((await db.query(`select n from public.termometro_federal where ug = '158129' and mes = '2026-11-01'`)).rows[0].n === 3, 'os dois lotes somam no resumo')

console.log(`\n${n} verificações do Termômetro ok`)
