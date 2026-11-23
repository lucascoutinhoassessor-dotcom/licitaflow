// Ensaia o agente Radar (migration 20261123000080) num Postgres em memória.
// Uso: node scripts/test-radar.mjs
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
const falha = async (uid, sql, params) => { try { await como(uid, sql, params); return false } catch { return true } }

const o1 = (await como(U1, `select public.criar_organizacao('Org Ana', 'fornecedor') id`))[0].id
const o2 = (await como(U2, `select public.criar_organizacao('Org Beto', 'fornecedor') id`))[0].id
const e1 = (await como(U1, `insert into public.empresas (org_id, cnpj, razao_social, uf, palavras_chave) values ($1, '12345678000190', 'Papelaria Ana LTDA', 'MG', '{papel,toner}') returning id`, [o1]))[0].id
const e2 = (await como(U1, `insert into public.empresas (org_id, cnpj, razao_social, palavras_chave) values ($1, '12345678000271', 'Ana Limpeza LTDA', '{detergente}') returning id`, [o1]))[0].id
await como(U2, `insert into public.empresas (org_id, cnpj, razao_social, palavras_chave) values ($1, '98765432000110', 'Beto LTDA', '{papel}')`, [o2])

// Editais de exemplo no índice (a cópia enxuta oportunidades_busca é mantida pelos gatilhos).
const edital = (i, objeto, uf, dias, valor = 1000, situacao = 1) => db.query(
  `insert into public.oportunidades_indice (controle, objeto, orgao_cnpj, orgao_nome, uf, modalidade, portal_id, publicacao, encerramento, situacao, valor, srp, compra)
   values ($1, $2, '11222333000144', 'Prefeitura ' || $3, $3, 6, 'comprasnet', now() - interval '1 day', now() + ($4 || ' days')::interval, $5, $6, false, $7)`,
  [`11222333000144-1-${String(i).padStart(6, '0')}/2026`, objeto, uf, String(dias), situacao, valor, JSON.stringify({ numeroControlePNCP: `11222333000144-1-${String(i).padStart(6, '0')}/2026`, objetoCompra: objeto })])
await edital(1, 'Aquisição de papel A4 para as escolas', 'MG', 10)
await edital(2, 'Compra de toner e cartuchos', 'SP', 5, 50000)
await edital(3, 'Serviço de limpeza com detergente', 'RJ', 7)
await edital(4, 'Papel higiênico para hospitais', 'MG', 0.5) // prazo curto demais (menos de 24 h)
await edital(5, 'Papel reciclado', 'BA', 9, 1000, 4) // suspensa
await edital(6, 'Obra de pavimentação', 'MG', 20)
const sugestoes = async (empresa) => (await db.query('select controle, pontuacao, motivos from public.radar_sugestoes where empresa_id = $1 order by controle', [empresa])).rows

ok((await db.query('select licitaflow_radar.rodada() r')).rows[0].r.empresas === 0, 'sem o módulo agentes liberado, nenhuma empresa é monitorada')
await db.exec(`update public.plataforma_modulos set estado = 'teste', orgs_teste = array['${o1}']::uuid[] where id = 'agentes'`)
const r1 = (await db.query('select licitaflow_radar.rodada() r')).rows[0].r
ok(r1.empresas === 1, 'teste grátis monitora 1 empresa (a mais antiga), e só da organização em teste')
let s = await sugestoes(e1)
ok(s.length === 2 && s.map((x) => x.controle.slice(-11)).join() === '000001/2026,000002/2026', 'acha papel e toner; ignora prazo curto, compra suspensa e o que não combina')
ok(s[0].pontuacao === 65 && s[0].motivos.includes('O objeto cita: papel') && s[0].motivos.includes('No mesmo estado da empresa (MG)'), 'pontuação e motivos explicam a escolha')
ok((await sugestoes(e2)).length === 0, 'a segunda empresa fica fora do limite do plano')
ok((await db.query('select licitaflow_radar.rodada() r')).rows[0].r.novas === 0, 'nova rodada não repete sugestões')

// Perfil: excluir palavra, estados e valor máximo.
await como(U1, `insert into public.radar_perfis (empresa_id, org_id, excluir, ufs, valor_max) values ($1, $2, '{cartuchos}', '{MG,SP}', 10000)`, [e1, o1])
await db.exec(`delete from public.radar_sugestoes; delete from licitaflow_radar.execucoes`)
await db.query('select licitaflow_radar.buscar($1)', [e1])
s = await sugestoes(e1)
ok(s.length === 1 && s[0].controle.endsWith('000001/2026'), 'perfil filtra palavra excluída, estados e valor máximo')

// Plano maior: as duas empresas.
await db.exec(`update public.organizations set plano = 'profissional' where id = '${o1}'`)
await db.query('select licitaflow_radar.rodada()')
ok((await sugestoes(e2)).length === 1, 'plano Profissional (3) monitora a segunda empresa também')

// App: buscar agora, decidir, resumo e segurança.
ok(await falha(U1, 'select public.radar_buscar_agora($1)', [e1]), '"Buscar agora" respeita o intervalo de 10 minutos')
await db.exec(`update licitaflow_radar.execucoes set executado_em = now() - interval '1 hour'`)
ok((await como(U1, 'select public.radar_buscar_agora($1) r', [e1]))[0].r.novas === 0, '"Buscar agora" roda a busca para a empresa')
ok(await falha(U2, 'select public.radar_buscar_agora($1)', [e1]), 'outra organização não usa o "Buscar agora" da empresa')
const sug = (await db.query('select id from public.radar_sugestoes where empresa_id = $1', [e1])).rows[0].id
ok(await falha(U1, `update public.radar_sugestoes set status = 'adicionada' where id = $1`, [sug]) || (await db.query('select status from public.radar_sugestoes where id = $1', [sug])).rows[0].status === 'nova', 'cliente não altera sugestão direto na tabela')
const proc = (await como(U1, `insert into public.processos (org_id, empresa_id, objeto, pncp_controle) values ($1, $2, 'Papel A4', '11222333000144-1-000001/2026') returning id`, [o1, e1]))[0].id
await como(U1, `select public.radar_decidir($1, 'adicionada', $2)`, [sug, proc])
ok((await db.query('select status, processo_id from public.radar_sugestoes where id = $1', [sug])).rows[0].processo_id === proc, 'adicionar ao funil grava o processo criado')
ok(await falha(U2, `select public.radar_decidir($1, 'descartada')`, [sug]), 'outra organização não decide a sugestão')
const est = (await como(U1, 'select public.agentes_estado_processos($1) r', [o1]))[0].r
ok(est[proc].radar?.motivo === 'Encontrado pelo Radar', 'processo vindo do Radar ganha o selo no Kanban')
const resumo = (await como(U1, 'select public.radar_resumo($1) r', [o1]))[0].r
ok(resumo.empresas.length === 2 && resumo.empresas.every((x) => x.monitorada) && resumo.limite.limite === 3, 'resumo mostra empresas monitoradas e o limite')
ok(await falha(U2, 'select public.radar_resumo($1)', [o1]), 'outra organização não vê o resumo')
ok((await como(U2, 'select * from public.radar_sugestoes')).length === 0, 'outra organização não vê as sugestões')
const uso = (await como(U1, 'select public.ia_uso_resumo($1) r', [o1]))[0].r
ok(uso.radar.usadas === 2, 'uso do plano mostra as empresas monitoradas')
const planos = Object.fromEntries((await db.query('select id, limites_ia from public.plataforma_planos')).rows.map((r) => [r.id, r.limites_ia]))
ok(planos.trial.radar === 1 && planos.essencial.radar === 1 && planos.profissional.radar === 3 && planos.assessoria.radar === null && planos.cancelado.radar === 0, 'Radar definido em todos os planos (1, 1, 3, sem limite, 0)')

// Push: só as não avisadas, uma vez.
const token = (await db.query('select token from licitaflow_radar.config')).rows[0].token
await db.exec(`update public.radar_sugestoes set notificado_em = null, status = 'nova'`)
await db.exec('set role service_role')
const av = (await db.query('select public.radar_para_avisar($1) r', [token])).rows[0].r
const av2 = (await db.query('select public.radar_para_avisar($1) r', [token])).rows[0].r
await db.exec('reset role')
ok(av.length === 2 && av.every((a) => a.quantidade >= 1 && a.empresa) && av2.length === 0, 'avisos agrupados por empresa, uma vez só')
ok(await falha(U1, 'select public.radar_para_avisar($1)', [token]), 'cliente não chama a função de avisos')

console.log(`\n${n} verificações do Radar ok`)
