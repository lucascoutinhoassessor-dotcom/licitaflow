// Ensaia os limites de IA por plano e por cliente (migration 20261121000041) num Postgres em memória.
// Uso: node scripts/test-limites-ia.mjs
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
const U1 = '11111111-1111-1111-1111-111111111111', U2 = '22222222-2222-2222-2222-222222222222', ADM = '99999999-9999-9999-9999-999999999999'
await db.exec(`insert into auth.users (id, email) values ('${U1}', 'a@t.com'), ('${U2}', 'b@t.com'), ('${ADM}', 'm@t.com');
  insert into public.platform_admins (user_id) values ('${ADM}');`)
async function como(uid, sql, params) {
  await db.exec(uid === 'servico' ? 'set role service_role' : `set role authenticated; select set_config('request.jwt.sub', '${uid}', false);`)
  try { return (await db.query(sql, params)).rows } finally { await db.exec(`reset role; select set_config('request.jwt.sub', '', false);`) }
}
const falha = async (uid, sql, params) => { try { await como(uid, sql, params); return false } catch { return true } }

const o1 = (await como(U1, `select public.criar_organizacao('Org Ana', 'fornecedor') id`))[0].id
const o2 = (await como(U2, `select public.criar_organizacao('Org Beto', 'fornecedor') id`))[0].id
await db.exec(`update public.organizations set plano = 'essencial' where id = '${o1}'`)
const lim = async (org) => (await como('servico', `select public.ia_limite_e_uso($1, 'leitor-editais') r`, [org]))[0].r

ok((await lim(o1)).limite === 10 && (await lim(o1)).origem === 'plano', 'essencial começa com 10 leituras do Leitor por mês')
ok((await lim(o2)).limite === 3, 'teste grátis começa com 3 leituras')
const usar = (org, nova, quando = 'now()') => db.exec(`insert into public.ia_uso (org_id, agente, nova, custo_usd, created_at) values ('${org}', 'leitor-editais', ${nova}, ${nova ? 0.5 : 0}, ${quando})`)
await usar(o1, true); await usar(o1, true); await usar(o1, false); await usar(o1, true, "now() - interval '40 days'")
ok((await lim(o1)).usadas === 2, 'conta só usos novos do mês (reaproveitadas e meses anteriores ficam fora)')

ok(await falha(U1, `select public.ia_limite_e_uso($1, 'leitor-editais')`, [o1]), 'cliente não chama a função do servidor')
ok(await falha(U1, `insert into public.ia_limites_org (org_id, agente, limite) values ($1, 'leitor-editais', 999)`, [o1]), 'cliente não grava a própria exceção')
ok(await falha(U1, `select public.admin_salvar_limite_ia_org($1, 'leitor-editais', 999)`, [o1]), 'cliente não usa a função do master')
const pj = Object.fromEntries((await db.query('select id, limites_ia from public.plataforma_planos')).rows.map((r) => [r.id, r.limites_ia]))
ok(pj.trial?.juridico === 1 && pj.essencial?.juridico === 5 && pj.profissional?.juridico === 20 && pj.assessoria?.juridico === 60 && (pj.cancelado?.juridico ?? 0) === 0,
  'Jurídico com IA definido em todos os planos (1, 5, 20, 60, 0)')
ok(await falha(U1, `update public.plataforma_planos set limites_ia = '{"leitor-editais":null}' where id = 'essencial'`) ||
  (await db.query(`select limites_ia from public.plataforma_planos where id = 'essencial'`)).rows[0].limites_ia['leitor-editais'] === 10, 'cliente não altera o plano')

const resumo = (await como(U1, 'select public.ia_uso_resumo($1) r', [o1]))[0].r
ok(resumo['leitor-editais'].usadas === 2 && resumo['leitor-editais'].limite === 10, 'cliente vê limite e uso do mês')
ok(await falha(U2, 'select public.ia_uso_resumo($1)', [o1]), 'cliente não vê o uso de outra organização')

ok(await falha(ADM, `select public.admin_salvar_limites_ia_plano('essencial', '{"leitor-editais":-1}')`), 'recusa limite negativo')
ok(await falha(ADM, `select public.admin_salvar_limites_ia_plano('essencial', '{"leitor-editais":2.5}')`), 'recusa limite fracionado')
await como(ADM, `select public.admin_salvar_limites_ia_plano('essencial', '{"leitor-editais":15,"radar":null}')`)
ok((await lim(o1)).limite === 15, 'master muda o limite do plano')
ok((await como('servico', `select public.ia_limite_e_uso($1, 'radar') r`, [o1]))[0].r.limite === null, 'null no plano = sem limite')
ok((await como('servico', `select public.ia_limite_e_uso($1, 'cotador') r`, [o1]))[0].r.limite === 0, 'agente fora do plano = 0')

await como(ADM, `select public.admin_salvar_limite_ia_org($1, 'leitor-editais', 50)`, [o1])
ok((await lim(o1)).limite === 50 && (await lim(o1)).origem === 'cliente', 'exceção do cliente vale no lugar do plano')
await como(ADM, `select public.admin_salvar_limite_ia_org($1, 'leitor-editais', null)`, [o1])
ok((await lim(o1)).limite === null, 'exceção pode liberar sem limite')
await como(ADM, `select public.admin_salvar_limite_ia_org($1, 'leitor-editais', null, true)`, [o1])
ok((await lim(o1)).limite === 15 && (await lim(o1)).origem === 'plano', 'voltar ao plano remove a exceção')
ok((await db.query(`select count(*)::int c from public.admin_audit where alvo = 'ia_limites_org'`)).rows[0].c >= 3, 'mudanças nas exceções ficam na auditoria')

const ficha = (await como(ADM, 'select public.admin_ia_cliente($1) r', [o1]))[0].r
ok(ficha.plano.id === 'essencial' && ficha.uso['leitor-editais'].novas === 2 && ficha.uso['leitor-editais'].reaproveitadas === 1, 'ficha do cliente traz plano e consumo')
const consumo = (await como(ADM, 'select public.admin_consumo_ia() r'))[0].r
ok(consumo.linhas.length === 1 && Number(consumo.linhas[0].custo_usd) === 1 && consumo.linhas[0].org === 'Org Ana', 'consumo do mês soma o custo por cliente')
ok(await falha(U1, 'select public.admin_consumo_ia()'), 'cliente não vê o consumo geral')


console.log(`\n${n} verificações de limites de IA ok`)
