// Ensaia o agente Cotador (migration 20261123000090) num Postgres em memória.
// Uso: node scripts/test-cotador.mjs
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
const U1 = '11111111-1111-1111-1111-111111111111', U2 = '22222222-2222-2222-2222-222222222222'
await db.exec(`insert into auth.users (id, email) values ('${U1}', 'a@t.com'), ('${U2}', 'b@t.com')`)
async function como(uid, sql, params) {
  await db.exec(`set role authenticated; select set_config('request.jwt.sub', '${uid}', false);`)
  try { return (await db.query(sql, params)).rows } finally { await db.exec(`reset role; select set_config('request.jwt.sub', '', false);`) }
}
const falha = async (uid, sql, params) => { try { await como(uid, sql, params); return false } catch (e) { return e.message } }

const o1 = (await como(U1, `select public.criar_organizacao('Org Ana', 'fornecedor') id`))[0].id
await como(U2, `select public.criar_organizacao('Org Beto', 'fornecedor')`)
const e1 = (await como(U1, `insert into public.empresas (org_id, cnpj, razao_social) values ($1, '12345678000190', 'Ana LTDA') returning id`, [o1]))[0].id
const proc = async (i) => (await como(U1, `insert into public.processos (org_id, empresa_id, objeto) values ($1, $2, $3) returning id`, [o1, e1, 'Compra ' + i]))[0].id
const p = []
for (let i = 1; i <= 4; i++) p.push(await proc(i))
const usar = (pid, uid = U1) => como(uid, 'select public.cotador_usar($1) r', [pid])

ok(String(await falha(U1, 'select public.cotador_usar($1)', [p[0]])).includes('não estão liberados'), 'sem o módulo agentes liberado, o Cotador não roda')
await db.exec(`update public.plataforma_modulos set estado = 'liberado' where id = 'agentes'`)
let r = (await usar(p[0]))[0].r
ok(r.contou === true && r.usadas === 1 && r.limite === 3, 'primeira cotação do processo conta 1 de 3 (teste grátis)')
r = (await usar(p[0]))[0].r
ok(r.contou === false && r.usadas === 1, 'o mesmo processo no mesmo mês não conta de novo')
await usar(p[1]); await usar(p[2])
ok(String(await falha(U1, 'select public.cotador_usar($1)', [p[3]])).includes('limite do plano'), 'quarto processo no mês passa do limite do teste grátis')
ok((await usar(p[0]))[0].r.contou === false, 'processo já cotado continua liberado mesmo no limite')
await db.exec(`update public.organizations set plano = 'essencial' where id = '${o1}'`)
ok((await usar(p[3]))[0].r.limite === 20, 'no Essencial o limite é 20 por mês')
ok(await falha(U2, 'select public.cotador_usar($1)', [p[0]]), 'outra organização não usa o Cotador no processo')
await db.exec(`update public.ia_uso set created_at = now() - interval '40 days' where agente = 'cotador'`)
ok((await usar(p[0]))[0].r.contou === true, 'no mês seguinte o processo conta de novo')

// Colunas da cotação e selo no Kanban.
await como(U1, `insert into public.processo_itens (org_id, processo_id, numero_item, descricao, unidade, quantidade, valor_ref_unit, origem, catalogo_tipo, catalogo_codigo, mercado, preco_proposto_unit)
  values ($1, $2, 1, 'Papel A4', 'UN', 100, 25, 'edital', 'M', 19746, '{"mediana": 22.5, "n": 40}', 24), ($1, $2, 2, 'Caneta', 'UN', 50, 2, 'edital', null, null, null, null)`, [o1, p[0]])
const est = (await como(U1, 'select public.agentes_estado_processos($1) r', [o1]))[0].r
ok(est[p[0]].cotador?.motivo === 'Preço de mercado em 1 de 2 itens', 'selo do Cotador mostra quantos itens têm preço de mercado')
ok(!est[p[1]].cotador, 'processo sem itens cotados não ganha o selo')
const planos = Object.fromEntries((await db.query('select id, limites_ia from public.plataforma_planos')).rows.map((x) => [x.id, x.limites_ia]))
ok(planos.trial.cotador === 3 && planos.essencial.cotador === 20 && planos.profissional.cotador === 100 && planos.assessoria.cotador === null && planos.cancelado.cotador === 0, 'Cotador definido em todos os planos (3, 20, 100, sem limite, 0)')
const uso = (await como(U1, 'select public.ia_uso_resumo($1) r', [o1]))[0].r
ok(uso.cotador.usadas === 1 && uso.cotador.limite === 20, '"Meu plano" mostra processos cotados no mês')

console.log(`\n${n} verificações do Cotador ok`)
