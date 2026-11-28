// Testes das mensagens da IA por cliente (migração 20261127210000_mensagens_ia.sql) num Postgres em memória.
// Uso: node scripts/test-mensagens-ia.mjs
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import assert from 'node:assert/strict'

const dir = new URL('../supabase/migrations/', import.meta.url)
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
grant usage on schema public, auth, storage to authenticated, anon;
`)
for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) await db.exec(readFileSync(new URL(f, dir), 'utf8'))
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;`)

const ANA = '11111111-1111-1111-1111-111111111111', BETO = '22222222-2222-2222-2222-222222222222', MASTER = '33333333-3333-3333-3333-333333333333'
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
  ('${ANA}', 'ana@teste.com', '{"nome":"Ana"}'), ('${BETO}', 'beto@teste.com', '{"nome":"Beto"}'), ('${MASTER}', 'm@teste.com', '{"nome":"Master"}');
  insert into public.platform_admins(user_id) values ('${MASTER}');`)
async function as(uid, sql, params = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.sub', '${uid}', false);`)
  try { return await db.query(sql, params) } finally { await db.exec('reset role;') }
}
const um = async (sql, params) => (await db.query(sql, params)).rows[0]

const orgA = (await as(ANA, `select public.criar_organizacao('Papelaria Ana', 'fornecedor') as id`)).rows[0].id
const orgB = (await as(BETO, `select public.criar_organizacao('Beto Obras', 'fornecedor') as id`)).rows[0].id
const empA = (await as(ANA, `insert into public.empresas (org_id, cnpj, razao_social, nome_fantasia, palavras_chave) values ($1, '12345678000190', 'Ana LTDA', 'Papelaria Ana', '{papel}') returning id`, [orgA])).rows[0].id
await as(BETO, `insert into public.empresas (org_id, cnpj, razao_social) values ($1, '98765432000110', 'Beto Obras LTDA')`, [orgB])

// Rodada às 13h de Brasília de hoje; dados de Ana relativos a essa hora.
const agora = (await um(`select ((now() at time zone 'America/Sao_Paulo')::date + time '13:00') at time zone 'America/Sao_Paulo' as t`)).t
await db.query(`insert into public.radar_sugestoes (org_id, empresa_id, controle, objeto, orgao, uf, valor, encerramento, pontuacao, created_at)
  values ($1, $2, '1-1-1/2026', 'Papel A4 para as escolas', 'Prefeitura X', 'SP', 5000, $3::timestamptz + interval '5 days', 90, $3::timestamptz - interval '1 hour'),
         ($1, $2, '1-1-2/2026', 'Canetas', 'Prefeitura Y', 'MG', 800, $3::timestamptz + interval '3 days', 40, $3::timestamptz - interval '2 hours')`, [orgA, empA, agora])
await db.query(`insert into public.processos (org_id, empresa_id, objeto, orgao_nome, etapa, data_abertura) values ($1, $2, 'Material de escritório', 'Câmara Z', 'proposta', $3::timestamptz + interval '2 hours')`, [orgA, empA, agora])
await db.query(`insert into public.prazos (org_id, titulo, tipo, data_hora) values ($1, 'Enviar amostra', 'amostra', $2::timestamptz + interval '3 hours')`, [orgA, agora])
await db.query(`insert into public.documentos (org_id, nome, categoria, validade) values ($1, 'CND Federal', 'certidao', ($2::timestamptz at time zone 'America/Sao_Paulo')::date + 5)`, [orgA, agora])
// Ana tem push; Beto não.
await db.query(`insert into public.push_inscricoes (user_id, endpoint, p256dh, auth) values ($1, 'https://push.exemplo/ana', 'k', 'a')`, [ANA])

// Desligada por padrão: nada sai.
assert.equal((await um(`select licitaflow_lembretes.preparar_ia($1::timestamptz) n`, [agora])).n, 0)
console.log('PASS rotina desligada não envia nada')

await db.query(`update public.mensagens_ia_config set ativo = true, dias = '{0,1,2,3,4,5,6}', horarios = '{13}'`)
assert.equal((await um(`select licitaflow_lembretes.preparar_ia($1::timestamptz - interval '1 hour') n`, [agora])).n, 0)
console.log('PASS fora do horário configurado não envia')

assert.equal((await um(`select licitaflow_lembretes.preparar_ia($1::timestamptz) n`, [agora])).n, 2)
const envA = (await db.query(`select * from public.notificacoes_envios where org_id = $1 and origem = 'ia'`, [orgA])).rows
assert.equal(envA.length, 1)
assert.equal(envA[0].canal, 'push')
assert.match(envA[0].titulo, /novidades para Papelaria Ana/)
assert.match(envA[0].texto, /Disputa hoje às 15:00: Material de escritório \(Câmara Z\)/)
assert.match(envA[0].texto, /Prazo hoje às 16:00: Enviar amostra/)
assert.match(envA[0].texto, /2 oportunidades novas no Radar para Papelaria Ana\. Destaque: Papel A4 para as escolas \(SP\)/)
assert.match(envA[0].texto, /1 documento vence em até 15 dias: CND Federal/)
console.log('PASS mensagem de Ana junta disputa, prazo, oportunidades e documento, e sai por push')
console.log('     →', envA[0].titulo, '|', envA[0].texto.replace(/\n/g, ' / '))

const sinoA = (await as(ANA, `select titulo, mensagem, tipo from public.notificacoes where lida_em is null`)).rows
assert.equal(sinoA.length, 1); assert.equal(sinoA[0].tipo, 'ia')
const sinoB = (await as(BETO, `select titulo, mensagem from public.notificacoes where lida_em is null`)).rows
assert.equal(sinoB.length, 1); assert.match(sinoB[0].titulo, /Dica do LicitaForce/)
assert.equal((await db.query(`select * from public.notificacoes_envios where org_id = $1 and status = 'pendente'`, [orgB])).rows.length, 0)
console.log('PASS Beto (sem push, sem novidades) recebe uma dica só no sino; nenhum envio pendente para ele')
console.log('     →', sinoB[0].titulo, '|', sinoB[0].mensagem)

assert.equal((await as(BETO, `select * from public.notificacoes where org_id = $1`, [orgA])).rows.length, 0)
assert.equal((await as(ANA, `update public.notificacoes set lida_em = now() where lida_em is null returning id`)).rows.length, 1)
console.log('PASS cada usuário só vê e marca o próprio sino')

// Mesma hora de novo: trava da hora.
assert.equal((await um(`select licitaflow_lembretes.preparar_ia($1::timestamptz) n`, [agora])).n, 0)
// Próximo horário (14h) sem novidade: não repete disputa, prazo, oportunidades nem documento; dica já saiu hoje.
await db.query(`update public.mensagens_ia_config set horarios = '{13,14}'`)
{ const r = (await um(`select licitaflow_lembretes.preparar_ia($1::timestamptz + interval '1 hour') n`, [agora])).n; if (r !== 0) { console.log("DEBUG", JSON.stringify((await db.query(`select org_id, titulo, texto, refs, chaves, status, created_at from public.notificacoes_envios where origem = 'ia' order by created_at`)).rows, null, 1)); } assert.equal(r, 0) }
console.log('PASS no horário seguinte nada se repete (trava da hora, itens e dica do dia)')

// Oportunidade nova às 14h30 entra no horário das 15h, só ela.
await db.query(`update public.mensagens_ia_config set horarios = '{13,14,15}'`)
await db.query(`insert into public.radar_sugestoes (org_id, empresa_id, controle, objeto, uf, pontuacao, created_at) values ($1, $2, '1-1-3/2026', 'Grampeadores', 'RJ', 70, $3::timestamptz + interval '90 minutes')`, [orgA, empA, agora])
assert.equal((await um(`select licitaflow_lembretes.preparar_ia($1::timestamptz + interval '2 hours') n`, [agora])).n, 1)
const nova = await um(`select titulo, texto from public.notificacoes_envios where org_id = $1 order by created_at desc, id limit 1`, [orgA])
assert.equal(nova.titulo, '1 oportunidade nova para Papelaria Ana')
assert.doesNotMatch(nova.texto, /Disputa|Prazo|documento/)
console.log('PASS oportunidade que surgiu depois sai sozinha no horário seguinte')

// Exceções: cliente fora da rotina e horário próprio.
await db.query(`insert into public.mensagens_ia_clientes (org_id, fora) values ($1, true)`, [orgB])
await db.query(`insert into public.mensagens_ia_clientes (org_id, horarios) values ($1, '{10}')`, [orgA])
await db.query(`insert into public.radar_sugestoes (org_id, empresa_id, controle, objeto, pontuacao, created_at) values ($1, $2, '1-1-4/2026', 'Clipes', 10, now())`, [orgA, empA])
const amanha13 = (await um(`select $1::timestamptz + interval '1 day' t`, [agora])).t
assert.equal((await um(`select licitaflow_lembretes.preparar_ia($1::timestamptz) n`, [amanha13])).n, 0)
console.log('PASS cliente fora da rotina e cliente com horário próprio não recebem no horário padrão')

// Painel master: cliente não usa; master vê prévia, análises e envia avulsa.
await assert.rejects(() => as(ANA, `select public.admin_mensagens_ia_previa($1)`, [orgA]))
await assert.rejects(() => as(ANA, `select public.admin_mensagens_ia_enviar('[]'::jsonb)`))
await assert.rejects(() => as(ANA, `update public.mensagens_ia_config set ativo = false returning id`).then((r) => { if (!r.rows.length) throw Error('RLS') }))
await assert.rejects(() => as(ANA, `select licitaflow_lembretes.preparar_ia()`))
console.log('PASS cliente não acessa prévia, envio, configuração nem a rotina')

const previa = (await as(MASTER, `select public.admin_mensagens_ia_previa($1) p`, [orgA])).rows[0].p
assert.equal(previa.analise.empresa, 'Papelaria Ana')
const analises = (await as(MASTER, `select public.admin_mensagens_ia_analises($1) a`, [[orgA, orgB]])).rows[0].a
assert.equal(analises.length, 2)
assert.ok(analises.find((x) => x.org_id === orgA).analise.oportunidades.quantidade >= 1)
const n = (await as(MASTER, `select public.admin_mensagens_ia_enviar($1::jsonb) n`, [JSON.stringify([
  { org_id: orgB, titulo: 'Novidade no LicitaForce', texto: 'Agora o Cotador busca preços do Painel de Preços.', link: '/app/cotador' },
  { org_id: orgA, titulo: 'Link estranho', texto: 'Teste de link', link: 'https://golpe.exemplo' },
])])).rows[0].n
assert.equal(n, 2)
const reservaB = await um(`select canal, link from public.notificacoes_envios where org_id = $1 and 'manual' = any(chaves)`, [orgB])
assert.equal(reservaB.canal, 'email'); assert.equal(reservaB.link, '/app/cotador')
assert.equal((await um(`select link from public.notificacoes where org_id = $1 and titulo = 'Link estranho'`, [orgA])).link, '/app')
console.log('PASS master vê prévia e análises; avulsa vai ao sino, por push ou reserva, e links externos viram /app')

// Lembretes também passam a aparecer no sino.
await db.query(`insert into public.notificacoes_envios (user_id, org_id, origem, titulo, texto, link, canal) values ($1, $2, 'lembrete', 'Ative as notificações', 'Texto', '/app/avisos', 'push')`, [ANA, orgA])
assert.equal((await as(ANA, `select * from public.notificacoes where tipo = 'lembrete'`)).rows.length, 1)
console.log('PASS lembrete enviado por push também aparece no sino')

// Resumo diário das IAs: um registro no sino por pessoa e dia, mesmo com dois aparelhos.
await db.query(`insert into public.push_inscricoes (user_id, endpoint, p256dh, auth) values ($1, 'https://push.exemplo/ana2', 'k', 'a')`, [ANA])
await db.query(`insert into licitaflow_push_agentes.fila (org_id, inscricao_id, user_id, dia, payload)
  select $1, s.id, s.user_id, current_date, '{"titulo":"Suas IAs · Papelaria Ana","texto":"Radar: 3 oportunidades encontradas.","url":"/app/agentes"}'::jsonb
  from public.push_inscricoes s where s.user_id = $2`, [orgA, ANA])
await db.query(`update licitaflow_push_agentes.fila set enviado_em = now()`)
const resumo = (await as(ANA, `select titulo, link from public.notificacoes where tipo = 'agentes'`)).rows
assert.equal(resumo.length, 1); assert.equal(resumo[0].link, '/app/agentes')
console.log('PASS resumo diário das IAs entra uma vez no sino, mesmo com dois aparelhos')

// Todo link que a rotina pode gerar (função de texto e lembretes) existe nas rotas do app.
const appTsx = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const trechoApp = appTsx.slice(appTsx.indexOf('path="/app"'), appTsx.indexOf('</Route>', appTsx.indexOf('path="/app"')))
const rotasApp = [...trechoApp.matchAll(/path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== '/app' && p !== ':modulo')
const existe = (l) => l === '/app' || rotasApp.some((r) => { const a = r.split('/'), b = l.slice(5).split('/'); return a.length === b.length && a.every((s, i) => s.startsWith(':') || s === b[i]) })
const fonte = (await um(`select pg_get_functiondef('licitaflow_lembretes.texto_ia(jsonb, public.mensagens_ia_config, boolean, date)'::regprocedure) d`)).d
  + (await um(`select pg_get_functiondef('licitaflow_lembretes.preparar(boolean, timestamptz)'::regprocedure) d`)).d
const linksSql = [...new Set([...fonte.matchAll(/'(\/app(?:\/[a-z0-9_-]+)*)'/g)].map((m) => m[1]))]
assert.ok(linksSql.includes('/app/agentes/radar'))
assert.deepEqual(linksSql.filter((l) => !existe(l)), [])
console.log('PASS todos os links das mensagens e lembretes levam a telas que existem:', linksSql.join(', '))

console.log('\nTodos os testes das mensagens da IA passaram.')
