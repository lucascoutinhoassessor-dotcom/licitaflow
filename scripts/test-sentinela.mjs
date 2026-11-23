// Ensaia o agente Sentinela (migration 20261121000050) num Postgres em memória.
// Uso: node scripts/test-sentinela.mjs
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
  await db.exec(uid === 'servico' ? 'set role service_role' : `set role authenticated; select set_config('request.jwt.sub', '${uid}', false);`)
  try { return (await db.query(sql, params)).rows } finally { await db.exec(`reset role; select set_config('request.jwt.sub', '', false);`) }
}
const falha = async (uid, sql, params) => { try { await como(uid, sql, params); return false } catch { return true } }
const token = (await db.query('select token from licitaflow_sentinela.config')).rows[0].token

const o1 = (await como(U1, `select public.criar_organizacao('Org Ana', 'fornecedor') id`))[0].id
const o2 = (await como(U2, `select public.criar_organizacao('Org Beto', 'fornecedor') id`))[0].id
const e1 = (await como(U1, `insert into public.empresas (org_id, cnpj, razao_social) values ($1, '12345678000190', 'Ana LTDA') returning id`, [o1]))[0].id
const e2 = (await como(U2, `insert into public.empresas (org_id, cnpj, razao_social) values ($1, '98765432000110', 'Beto LTDA') returning id`, [o2]))[0].id
const C = (i) => `11222333000144-1-${String(i).padStart(6, '0')}/2026`
const proc = async (uid, org, emp, i, etapa = 'captacao') => (await como(uid, `insert into public.processos (org_id, empresa_id, objeto, pncp_controle, etapa, data_abertura) values ($1, $2, $3, $4, $5, now() + ($6 || ' days')::interval) returning id`, [org, emp, 'Compra ' + i, C(i), etapa, String(i)]))[0].id
const p1 = await proc(U1, o1, e1, 1)
await proc(U1, o1, e1, 2, 'perdido')
for (let i = 3; i <= 8; i++) await proc(U1, o1, e1, i) // org 1 (teste grátis, limite 5): 7 ativos → 5 vigiados
const pB = await proc(U2, o2, e2, 1) // org 2 acompanha o mesmo edital C(1)

const lote = async () => (await como('servico', 'select public.sentinela_lote($1, 60) r', [token]))[0].r
ok((await lote()).length === 0, 'sem o módulo agentes liberado, nada é vigiado')
await db.exec(`update public.plataforma_modulos set estado = 'teste', orgs_teste = array['${o1}']::uuid[] where id = 'agentes'`)
const l1 = await lote()
ok(l1.length === 5 && !l1.some((x) => x.controle === C(2)), 'em teste, só a org liberada; limite 5 do teste grátis; perdido fica fora')
ok(!l1.some((x) => x.controle === C(1)), 'os mais recentes têm preferência no limite (o mais antigo ficou de fora)')
ok((await lote()).length === 0, 'lote já tentado não volta antes de 10 minutos')
ok(await falha('servico', `select public.sentinela_lote('errado')`), 'token errado é recusado')
ok(await falha(U1, 'select public.sentinela_lote($1)', [token]), 'cliente não chama o lote')

await db.exec(`update public.plataforma_modulos set estado = 'liberado' where id = 'agentes'`)
await db.exec(`update public.organizations set plano = 'essencial' where id = '${o1}'`)
await db.exec(`update licitaflow_sentinela.editais set tentado_em = null`)
const l2 = await lote()
ok(l2.length === 7 && l2.some((x) => x.controle === C(1)), 'liberado para todos e plano Essencial (20): todos os ativos das duas orgs, cada edital uma vez')

const futuro = new Date(Date.now() + 3600e3).toISOString()
const avisos = (await como('servico', 'select public.sentinela_gravar($1, $2) r', [token, JSON.stringify([
  { controle: C(1), estado: { situacao: 'Suspensa' }, proxima_em: futuro, eventos: [{ tipo: 'situacao', nivel: 'alto', titulo: 'Compra suspensa pelo órgão', detalhe: { de: 'Divulgada', para: 'Suspensa' } }] },
  { controle: C(3), estado: { situacao: 'Divulgada' }, proxima_em: futuro, eventos: [] },
  { controle: C(4), erro: 'PNCP fora do ar', proxima_em: futuro },
])]))[0].r
ok(avisos.length === 2 && avisos.every((a) => a.titulo === 'Compra suspensa pelo órgão'), 'evento vira aviso para cada processo que acompanha o edital (duas orgs)')
const linhas = (await db.query(`select org_id, tipo, origem, titulo from public.processo_eventos where tipo = 'sentinela'`)).rows
ok(linhas.length === 2 && linhas.every((l) => l.origem === 'agente' && l.titulo.startsWith('Sentinela:')), 'evento entra na linha do tempo dos dois processos')
ok((await db.query(`select falhas from licitaflow_sentinela.editais where controle = $1`, [C(4)])).rows[0].falhas === 1, 'falha conta e reagenda')

ok((await como(U1, 'select * from public.sentinela_eventos')).length === 1, 'cliente vê o evento do edital que acompanha')
await db.exec(`update public.processos set pncp_controle = null where id = '${pB}'`)
ok((await como(U2, 'select * from public.sentinela_eventos')).length === 0, 'quem não acompanha o edital não vê o evento')

const resumo = (await como(U1, 'select public.sentinela_resumo($1) r', [o1]))[0].r
ok(resumo.liberado && resumo.vigiados.length === 7 && resumo.limite.limite === 20, 'resumo do cliente traz limite e processos vigiados')
ok(resumo.vigiados.find((v) => v.processo_id === p1).situacao === 'Suspensa', 'resumo mostra a situação lida do PNCP')
ok(await falha(U2, 'select public.sentinela_resumo($1)', [o1]), 'cliente não vê o resumo de outra organização')
const uso = (await como(U1, 'select public.ia_uso_resumo($1) r', [o1]))[0].r
ok(uso.sentinela.usadas === 7 && uso.sentinela.limite === 20, 'uso do plano mostra processos vigiados agora')
const planos = Object.fromEntries((await db.query('select id, limites_ia from public.plataforma_planos')).rows.map((r) => [r.id, r.limites_ia]))
ok(planos.trial.sentinela === 5 && planos.essencial.sentinela === 20 && planos.profissional.sentinela === 100 && planos.assessoria.sentinela === null && planos.cancelado.sentinela === 0,
  'Sentinela definida em todos os planos (5, 20, 100, sem limite, 0)')
ok(planos.essencial['leitor-editais'] === 10, 'limites do Leitor continuam')

// Estado real dos agentes em cada processo (cartão do Kanban).
const idDe = async (i) => (await db.query('select id from public.processos where org_id = $1 and pncp_controle = $2', [o1, C(i)])).rows[0].id
const estados = async (uid = U1, org = o1) => (await como(uid, 'select public.agentes_estado_processos($1) r', [org]))[0].r
let est = await estados()
ok(est[p1].sentinela.estado === 'ativo' && est[p1].sentinela.verificado_em, 'edital já verificado: Sentinela ativa, com a hora da verificação')
ok(est[await idDe(4)].sentinela.estado === 'na_fila', 'ligado mas ainda sem verificação: na fila')
ok(est[await idDe(2)].sentinela.estado === 'indisponivel' && est[await idDe(2)].sentinela.motivo === 'Processo encerrado', 'processo perdido: indisponível (encerrado)')
ok(!est[p1]['leitor-editais'], 'sem leitura guardada, o Leitor não aparece no processo')
await db.exec(`insert into public.ia_leituras_edital (controle, resultado, modelo) values ('${C(1)}', '{}', 'claude-opus-5-5')`)
await db.exec(`update public.processos set monitorar = false where id = '${await idDe(3)}'`)
est = await estados()
ok(est[p1]['leitor-editais'].estado === 'ativo', 'edital lido pela IA aparece no processo')
ok(est[await idDe(3)].sentinela.estado === 'desligado', 'desligado pelo cliente no processo')
await db.exec(`update public.organizations set plano = 'trial' where id = '${o1}'`)
est = await estados()
const parados = Object.values(est).filter((x) => x.sentinela?.estado === 'parado')
ok(parados.length === 1 && parados[0].sentinela.motivo.includes('Fora do limite do plano (5'), 'acima do limite do plano: parado, com o motivo e o limite')
await db.exec(`update public.plataforma_modulos set estado = 'oculto' where id = 'agentes'`)
est = await estados()
ok(est[p1].sentinela.estado === 'parado' && est[p1].sentinela.motivo.includes('não liberados'), 'módulo agentes não liberado: parado, mesmo com o cartão ligado')
ok(est[pB] === undefined, 'só devolve processos da própria organização')
ok(await falha(U2, 'select public.agentes_estado_processos($1)', [o1]), 'outra organização não consulta os estados')

console.log(`\n${n} verificações da Sentinela ok`)
