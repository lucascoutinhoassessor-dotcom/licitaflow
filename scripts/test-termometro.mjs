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

console.log(`\n${n} verificações do Termômetro ok`)
