// Testes de permissão das tabelas de push (migration 20261121000030) num Postgres em memória.
import {PGlite} from '@electric-sql/pglite'
import {readFileSync} from 'node:fs'
const db=new PGlite()
await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;create table public.plataforma_avisos(id uuid primary key);create function public.exigir_admin() returns void language plpgsql as $$begin if coalesce(current_setting('app.admin',true),'')<>'1' then raise exception 'Acesso restrito'; end if; end$$;insert into public.plataforma_avisos values('33333333-3333-3333-3333-333333333333');
insert into auth.users values('11111111-1111-1111-1111-111111111111'),('22222222-2222-2222-2222-222222222222');`)
await db.exec(readFileSync('supabase/migrations/20261121000030_push.sql','utf8'))
await db.exec(`insert into push_vapid(publica,privada) values('a','b');insert into push_inscricoes(user_id,endpoint,p256dh,auth) values('22222222-2222-2222-2222-222222222222','https://x/2','p','a')`)
await db.exec(`set role authenticated;select set_config('request.jwt.sub','11111111-1111-1111-1111-111111111111',false)`)
try{await db.query('select * from push_vapid');throw Error('cliente leu as chaves VAPID')}catch{console.log('PASS vapid bloqueado')}
if((await db.query('select count(*)::int n from push_inscricoes')).rows[0].n!==0)throw Error('viu inscrição de outro usuário');console.log('PASS só vê as próprias')
try{await db.query(`insert into push_inscricoes(user_id,endpoint,p256dh,auth) values('22222222-2222-2222-2222-222222222222','https://x/3','p','a')`);throw Error('inseriu inscrição para outro usuário')}catch{console.log('PASS nao insere para outro')}
try{await db.query(`select public.admin_excluir_aviso('33333333-3333-3333-3333-333333333333')`);throw Error('cliente excluiu aviso')}catch(e){if(e.message==='cliente excluiu aviso')throw e;console.log('PASS cliente não exclui aviso')}
await db.exec(`reset role;select set_config('app.admin','1',false)`)
await db.query(`select public.admin_excluir_aviso('33333333-3333-3333-3333-333333333333')`)
if((await db.query('select count(*)::int n from plataforma_avisos')).rows[0].n!==0)throw Error('aviso não foi excluído')
console.log('PASS master exclui aviso')
