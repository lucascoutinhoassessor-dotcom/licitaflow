// Ensaia a IA do próprio cliente (migration 20261127220000) num Postgres em memória.
// Uso: node scripts/test-ia-chave.mjs
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
const U1 = '11111111-1111-1111-1111-111111111111', U2 = '22222222-2222-2222-2222-222222222222', U3 = '33333333-3333-3333-3333-333333333333'
await db.exec(`insert into auth.users (id, email) values ('${U1}', 'a@t.com'), ('${U2}', 'b@t.com'), ('${U3}', 'c@t.com')`)
async function como(uid, sql, params) {
  await db.exec(`set role authenticated; select set_config('request.jwt.sub', '${uid}', false);`)
  try { return (await db.query(sql, params)).rows } finally { await db.exec(`reset role; select set_config('request.jwt.sub', '', false);`) }
}
const falha = async (uid, sql, params) => { try { await como(uid, sql, params); return false } catch (e) { return e.message } }

const o1 = (await como(U1, `select public.criar_organizacao('Org Ana', 'fornecedor') id`))[0].id
await como(U2, `select public.criar_organizacao('Org Beto', 'fornecedor')`)
await db.query(`insert into public.memberships (org_id, user_id, papel) values ($1, $2, 'membro')`, [o1, U3])

// O servidor (chave de serviço) grava a chave já cifrada.
const gravar = (prov, ativa = false) => db.query(`insert into public.ia_chaves_cliente (org_id, provedor, modelo, cifrada, final, ativa, created_by) values ($1, $2, 'modelo-x', 'v1.cifradacifradacifrada', 'a1B2', $3, $4)`, [o1, prov, ativa, U1])
await gravar('anthropic', true)
await gravar('google')

ok((await como(U1, 'select * from public.ia_chaves_cliente')).length === 0, 'cliente não lê a tabela das chaves (nem a cifrada)')
ok(await falha(U1, `insert into public.ia_chaves_cliente (org_id, provedor, modelo, cifrada, final) values ($1, 'openai', 'x1', 'v1.aaaaaaaaaaaaaaaaaaaa', 'abcd')`, [o1]), 'cliente não grava chave direto (só pelo servidor)')
const resumo = (await como(U3, 'select public.ia_chaves_resumo($1) r', [o1]))[0].r
ok(resumo.length === 2 && resumo.every((c) => !('cifrada' in c)) && resumo.find((c) => c.provedor === 'anthropic').ativa, 'membro vê provedor, modelo, final e qual está ativa, sem a chave')
ok(await falha(U2, 'select public.ia_chaves_resumo($1)', [o1]), 'outra organização não vê as chaves')
ok(String(await falha(U3, `select public.ia_ativar_chave($1, 'google')`, [o1])).includes('dono ou um administrador'), 'membro comum não troca a IA')
const r2 = (await como(U1, `select public.ia_ativar_chave($1, 'google') r`, [o1]))[0].r
ok(r2.filter((c) => c.ativa).map((c) => c.provedor).join() === 'google', 'dono troca a chave ativa (só uma ativa por vez)')
ok(await falha(U1, `select public.ia_ativar_chave($1, 'openai')`, [o1]), 'não ativa provedor sem chave cadastrada')
ok((await como(U1, `select public.ia_ativar_chave($1, null) r`, [o1]))[0].r.every((c) => !c.ativa), 'voltar para a IA do LicitaForce desliga todas')
ok(await falha(U2, `select public.ia_remover_chave($1, 'google')`, [o1]), 'outra organização não remove chave')
ok((await como(U1, `select public.ia_remover_chave($1, 'google') r`, [o1]))[0].r.length === 1, 'dono remove a chave')

// Uso com a chave do cliente não conta no limite do plano.
await db.query(`insert into public.ia_uso (org_id, user_id, agente, nova, provedor) values ($1, $2, 'juridico', true, 'licitaforce'), ($1, $2, 'juridico', true, 'anthropic'), ($1, $2, 'juridico', true, 'google')`, [o1, U1])
ok((await db.query(`select public.ia_usos_mes($1, 'juridico') n`, [o1])).rows[0].n === 1, 'só o uso com a IA do LicitaForce conta no limite')
ok(await db.query(`insert into public.ia_uso (org_id, agente, provedor) values ($1, 'juridico', 'outro')`, [o1]).then(() => false, () => true), 'provedor fora da lista é recusado')

console.log(`\n${n} verificações da IA do cliente ok`)
