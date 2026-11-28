// Ensaia o Pregão ao Vivo (migration 20261127090000) num Postgres em memória.
// Uso: node scripts/test-pregao.mjs
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
const o2 = (await como(U2, `select public.criar_organizacao('Org Beto', 'fornecedor') id`))[0].id
const e1 = (await como(U1, `insert into public.empresas (org_id, cnpj, razao_social) values ($1, '12345678000190', 'Ana LTDA') returning id`, [o1]))[0].id
const p1 = (await como(U1, `insert into public.processos (org_id, empresa_id, objeto, uasg, numero) values ($1, $2, 'Papel A4', '158419', '90012/2026') returning id`, [o1, e1]))[0].id

const planos = Object.fromEntries((await db.query('select id, limites_ia from public.plataforma_planos')).rows.map((r) => [r.id, r.limites_ia['pregao-ao-vivo']]))
ok(planos.trial === 1 && planos.essencial === 2 && planos.profissional === 5 && planos.assessoria === 15 && (planos.cancelado ?? 0) === 0, 'limite de sessões em todos os planos (1, 2, 5, 15, 0)')

const novaSessao = (uid, org, chave, extra = '') => como(uid, `insert into public.pav_sessoes (org_id, portal, chave${extra ? ', situacao' : ''}) values ($1, 'comprasgov', $2${extra ? `, '${extra}'` : ''}) returning *`, [org, chave])
ok(String(await falha(U1, `insert into public.pav_computadores (org_id, nome) values ($1, 'PC')`, [o1])).includes('não está liberado'), 'sem o módulo liberado, o computador não conecta')
ok(String(await falha(U1, `insert into public.pav_sessoes (org_id, portal, chave) values ($1, 'comprasgov', '15841905900122026')`, [o1])).includes('não está liberado'), 'sem o módulo liberado, não acompanha sessão')
await db.query(`insert into public.plataforma_modulos (id, estado, orgs_teste) values ('pregao-ao-vivo', 'teste', $1)`, [[o1]])
ok(String(await falha(U2, `insert into public.pav_computadores (org_id, nome) values ($1, 'PC')`, [o2])).includes('não está liberado'), 'em teste, só a organização escolhida usa')

// A organização nasce no teste grátis (1 sessão); a exceção do cliente sobe para 2.
await db.query(`insert into public.ia_limites_org (org_id, agente, limite) values ($1, 'pregao-ao-vivo', 2)`, [o1])
const pc = (await como(U1, `insert into public.pav_computadores (org_id, nome, versao) values ($1, 'NOTE-ANA', '0.1.0') returning id, user_id`, [o1]))[0]
ok(pc.user_id === U1, 'computador fica com o usuário logado')
ok(await falha(U1, `insert into public.pav_computadores (org_id, user_id, nome) values ($1, $2, 'OUTRO')`, [o1, U2]), 'não registra computador em nome de outro usuário')
ok(await falha(U2, `insert into public.pav_computadores (org_id, nome) values ($1, 'INTRUSO')`, [o1]), 'não registra computador em outra organização')
await como(U1, `update public.pav_computadores set sinal_em = now() where id = $1`, [pc.id])

const s1 = (await novaSessao(U1, o1, '15841905900122026'))[0]
ok(s1.processo_id === p1, 'sessão do Compras.gov se liga ao processo pela UASG e pelo número/ano')
ok((await novaSessao(U1, o1, '99999905000012026'))[0].processo_id === null, 'sem processo correspondente, fica sem vínculo')
ok(await falha(U1, `insert into public.pav_sessoes (org_id, portal, chave) values ($1, 'outro', 'x')`, [o1]), 'portal fora da lista é recusado')
ok(await falha(U1, `insert into public.pav_sessoes (org_id, portal, chave) values ($1, 'bll', 'a b;drop')`, [o1]), 'chave com caracteres estranhos é recusada')

ok(String(await falha(U1, `insert into public.pav_sessoes (org_id, portal, chave) values ($1, 'bll', 'PREG-3')`, [o1])).includes('ao mesmo tempo'), 'limite de sessões simultâneas do plano')
ok((await novaSessao(U1, o1, 'PREG-PAUSADA', 'pausada')).length === 1, 'sessão pausada não conta no limite')
await como(U1, `update public.pav_sessoes set situacao = 'encerrada' where chave = '99999905000012026'`)
ok((await novaSessao(U1, o1, 'PREG-4')).length === 1, 'encerrar uma libera vaga para outra')
ok(String(await falha(U1, `update public.pav_sessoes set situacao = 'acompanhando' where chave = 'PREG-PAUSADA'`)).includes('ao mesmo tempo'), 'retomar uma pausada também respeita o limite')

const ev = (uid, sessao, tipo, texto, impressao, extra = {}) => como(uid,
  `insert into public.pav_eventos (sessao_id, org_id, tipo, texto, impressao, item, prazo) values ($1, $2, $3, $4, $5, $6, $7) on conflict (sessao_id, impressao) do nothing returning *`,
  [sessao, extra.org ?? o1, tipo, texto, impressao, extra.item ?? null, extra.prazo ?? null])
const m1 = (await ev(U1, s1.id, 'mensagem', 'Srs. fornecedores, a sessão será retomada às 14h.', 'msg-0000001'))[0]
ok(m1 && m1.org_id === o1, 'evento gravado com a organização da sessão')
ok((await ev(U1, s1.id, 'mensagem', 'Srs. fornecedores, a sessão será retomada às 14h.', 'msg-0000001')).length === 0, 'evento repetido é ignorado')
ok(await falha(U2, `insert into public.pav_eventos (sessao_id, org_id, tipo, texto, impressao) values ($1, $2, 'aviso', 'x', 'intruso-01')`, [s1.id, o2]), 'não grava evento na sessão de outra organização')
ok((await como(U2, 'select * from public.pav_eventos')).length === 0, 'outra organização não vê os eventos')
ok(await falha(U1, `update public.pav_eventos set texto = 'mudado' where id = $1`, [m1.id]) || (await como(U1, 'select texto from public.pav_eventos where id = $1', [m1.id]))[0].texto !== 'mudado', 'evento não é editado')

const prazo = new Date(Date.now() + 2 * 3600e3).toISOString()
await ev(U1, s1.id, 'convocacao', 'Convoco a empresa Ana LTDA a enviar a proposta ajustada em 2 horas.', 'conv-000001', { item: '1', prazo })
const pz = await como(U1, `select titulo, tipo, origem from public.prazos where processo_id = $1`, [p1])
ok(pz.length === 1 && pz[0].tipo === 'proposta' && pz[0].origem === 'sistema' && pz[0].titulo.includes('item 1'), 'convocação com prazo vira prazo do processo')
ok((await como(U1, 'select ultimo_evento_em from public.pav_sessoes where id = $1', [s1.id]))[0].ultimo_evento_em, 'sessão guarda a hora do último evento')
const resumo = (await como(U1, 'select public.ia_uso_resumo($1) r', [o1]))[0].r['pregao-ao-vivo']
ok(resumo.limite === 2 && resumo.usadas === 2, 'Meu plano mostra as sessões acompanhadas e o limite')

console.log(`\n${n} verificações do Pregão ao Vivo ok`)
