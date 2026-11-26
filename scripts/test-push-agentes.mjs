// Resumo diário das IAs: RLS, janela de Brasília, reserva e confirmação por aparelho.
// Uso: node scripts/test-push-agentes.mjs
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
const ok = (v, m) => { if (!v) throw Error(m); n++; console.log('PASS', m) }
const U1 = '11111111-1111-1111-1111-111111111111', U2 = '22222222-2222-2222-2222-222222222222'
await db.exec(`insert into auth.users(id,email) values ('${U1}','a@t.com'),('${U2}','b@t.com')`)
async function como(uid, sql, params) {
  await db.exec(`set role authenticated; select set_config('request.jwt.sub', '${uid}', false)`)
  try { return (await db.query(sql, params)).rows } finally { await db.exec("reset role; select set_config('request.jwt.sub','',false)") }
}
const rejeita = async (acao, msg) => { let falhou = false; try { await acao() } catch { falhou = true } ok(falhou, msg) }
const o1 = (await como(U1, `select public.criar_organizacao('Org Ana','fornecedor') id`))[0].id
const o2 = (await como(U2, `select public.criar_organizacao('Org Beto','fornecedor') id`))[0].id
await como(U1, `insert into public.push_agentes_preferencias(user_id,radar) values ($1,false)`, [U1])
ok((await como(U2, 'select * from public.push_agentes_preferencias')).length === 0, 'preferências de outra conta ficam ocultas')
await rejeita(() => como(U2, `insert into public.push_agentes_preferencias(user_id) values ($1)`, [U1]), 'não altera preferências de outra conta')
await rejeita(() => como(U1, 'select * from licitaflow_push_agentes.config'), 'token do cron fica privado')
await rejeita(() => como(U1, `select public.push_agentes_lote('x')`), 'cliente não consegue reservar a fila')
await rejeita(() => db.query(`select public.push_agentes_lote('x')`), 'token inválido é rejeitado pelo banco')
await db.exec(`update public.plataforma_modulos set estado='liberado' where id='agentes';
  update public.memberships set created_at='2026-01-01';
  insert into public.push_inscricoes(user_id,endpoint,p256dh,auth) values
  ('${U1}','https://push/a','p','a'),('${U1}','https://push/b','p','a'),('${U2}','https://push/c','p','a');`)
// Usa um dia fixo futuro: não depende da hora em que o teste for executado.
await db.query(`insert into public.ia_uso(org_id,user_id,agente,created_at) values
  ($1,$2,'leitor-editais','2030-01-02T10:00:00Z'),($3,$4,'cotador','2030-01-02T10:00:00Z'),
  ($1,$2,'leitor-editais','2030-01-02T11:30:00Z')`, [o1,U1,o2,U2])
await db.query(`select licitaflow_push_agentes.preparar('2030-01-02T10:59:00Z')`)
ok((await db.query('select count(*)::int n from licitaflow_push_agentes.fila')).rows[0].n === 0, 'antes das 8h de Brasília não prepara o resumo')
await db.query(`select licitaflow_push_agentes.preparar('2030-01-02T11:00:00Z')`)
let fila = (await db.query('select * from licitaflow_push_agentes.fila')).rows
ok(fila.length === 3, 'cria uma entrega por aparelho da organização com atividade')
ok(fila.filter(f => f.org_id === o1).every(f => f.payload.texto === 'Leitor: 1 leituras.'), 'janela de 24h não inclui atividade após as 8h nem outra organização')
await db.query(`select licitaflow_push_agentes.preparar('2030-01-02T12:00:00Z')`)
ok((await db.query('select count(*)::int n from licitaflow_push_agentes.fila')).rows[0].n === 3, 'preparação repetida não duplica o resumo')
const token = (await db.query('select token from licitaflow_push_agentes.config')).rows[0].token
// Traz a fila para o dia atual, para exercitar a reserva com o relógio real do banco.
await db.exec(`update licitaflow_push_agentes.fila set dia=(now() at time zone 'America/Sao_Paulo')::date`)
await como(U2, `insert into public.push_agentes_preferencias(user_id,resumo_diario) values ($1,false)`, [U2])
const reservar = async () => (await db.query('select public.push_agentes_lote($1) lote', [token])).rows[0].lote
let lote = await reservar()
ok(lote.length === 2 && lote.every(f => f.endpoint !== 'https://push/c'), 'revê a preferência antes de enviar e não manda para quem desligou')
ok((await reservar()).length === 0, 'chamada concorrente não reserva aparelhos já em processamento')
await db.query('select public.push_agentes_concluir($1,$2,$3,201)', [token,lote[0].id,lote[1].reserva])
ok((await db.query('select count(*)::int n from licitaflow_push_agentes.fila where enviado_em is not null')).rows[0].n === 0, 'confirmação com reserva errada não altera a entrega')
await db.query('select public.push_agentes_concluir($1,$2,$3,201)', [token,lote[0].id,lote[0].reserva])
await db.query('select public.push_agentes_concluir($1,$2,$3,503)', [token,lote[1].id,lote[1].reserva])
ok((await reservar()).length === 0, 'sucesso não repete e erro temporário aguarda o intervalo')
await db.query(`update licitaflow_push_agentes.fila set proxima_em=now()-interval '1 second' where id=$1`, [lote[1].id])
lote = await reservar()
ok(lote.length === 1, 'só o aparelho que falhou volta para nova tentativa')
await db.query('select public.push_agentes_concluir($1,$2,$3,410)', [token,lote[0].id,lote[0].reserva])
ok((await db.query(`select count(*)::int n from public.push_inscricoes where user_id=$1`, [U1])).rows[0].n === 1, 'inscrição expirada é removida sem afetar o aparelho que recebeu')
await db.exec(`update public.push_agentes_preferencias set resumo_diario=true where user_id='${U2}'; update public.organizations set suspensa=true where id='${o2}'`)
ok((await reservar()).length === 0, 'organização suspensa não recebe resumo pendente')
await db.exec(`update public.organizations set suspensa=false where id='${o2}'; delete from public.memberships where org_id='${o2}'`)
ok((await reservar()).length === 0, 'usuário removido da organização não recebe resumo pendente')
console.log(`${n} verificações do push das IAs passaram`)
await db.close()
