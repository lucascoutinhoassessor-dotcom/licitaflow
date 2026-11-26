import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const db = new PGlite()
await db.exec(`
create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.sub',true),'')::uuid$$;
create table public.organizations(id uuid primary key,suspensa boolean default false);
create table public.memberships(org_id uuid,user_id uuid);
create table public.documentos(validade date);
create table public.prazos(concluido boolean,data_hora timestamptz);
create table public.suporte_chamados(id uuid primary key default gen_random_uuid(),tipo text,created_at timestamptz default now(),updated_at timestamptz default now(),nao_lido_master boolean default true);
create function public.is_platform_admin() returns boolean language sql stable as $$select coalesce(auth.uid()='33333333-3333-3333-3333-333333333333'::uuid,false)$$;
create function public.exigir_admin() returns void language plpgsql as $$begin if not public.is_platform_admin() then raise exception 'Acesso restrito';end if;end$$;
create function public.is_member(p_org uuid) returns boolean language sql stable as $$select exists(select 1 from public.memberships m join public.organizations o on o.id=m.org_id where m.org_id=p_org and m.user_id=auth.uid() and not o.suspensa)$$;
create function public.set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;
grant usage on schema auth,public to authenticated,anon;
grant select on memberships,organizations,suporte_chamados to authenticated;
insert into organizations(id) values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into memberships values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111'),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222');
`)
// A implantação inicial é feita pelo proprietário do banco; o cron é opcional no teste local.
let migration = readFileSync(new URL('../supabase/migrations/20261126123512_quadro_informativo.sql',import.meta.url),'utf8')
// O PGlite usa outro session_user; a chamada inicial roda com um master de teste.
await db.exec(`select set_config('request.jwt.sub','33333333-3333-3333-3333-333333333333',false)`)
await db.exec(migration)
await db.exec(readFileSync(new URL('../supabase/migrations/20261126123717_quadro_privilegios.sql',import.meta.url),'utf8'))
const admin='33333333-3333-3333-3333-333333333333', ana='11111111-1111-1111-1111-111111111111', beto='22222222-2222-2222-2222-222222222222'
const orgA='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',orgB='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
async function as(uid, sql, params=[]) {
  await db.exec(`set role authenticated;select set_config('request.jwt.sub','${uid}',false)`)
  try { return await db.query(sql,params) } finally { await db.exec('reset role') }
}
const base={titulo:'Teste de conteúdo',texto:'Texto educativo de teste.',tipo:'dica',status:'publicado',publicar_em:new Date(Date.now()-60000).toISOString()}
async function save(p){return (await as(admin,'select public.admin_salvar_quadro($1::jsonb) id',[JSON.stringify({...base,...p})])).rows[0].id}
const publico=await save({})
const privado=await save({org_id:orgA})
const rascunho=await save({status:'rascunho'})
const futuro=await save({publicar_em:new Date(Date.now()+86400000).toISOString()})
const expirado=await save({publicar_em:new Date(Date.now()-86400000).toISOString(),expira_em:new Date(Date.now()-60000).toISOString()})
const arquivado=await save({status:'arquivado'})
let rows=(await as(ana,'select id from public.quadro_listar($1,100)',[orgA])).rows.map(r=>r.id)
assert(rows.includes(publico)&&rows.includes(privado));for(const id of [rascunho,futuro,expirado,arquivado])assert(!rows.includes(id))
console.log('PASS cliente vê publicados do público correto; rascunhos, agendados, expirados e arquivados ficam ocultos')
rows=(await as(beto,'select id from public.quadro_posts')).rows.map(r=>r.id)
assert(rows.includes(publico)&&!rows.includes(privado)&&!rows.includes(rascunho))
await assert.rejects(()=>as(beto,'select * from public.quadro_listar($1,100)',[orgA]))
console.log('PASS RLS bloqueia conteúdo e consultas de outra organização')
await assert.rejects(()=>as(ana,'select public.admin_salvar_quadro($1::jsonb)',[JSON.stringify(base)]))
await assert.rejects(()=>as(ana,"update public.quadro_posts set status='publicado' where id=$1 returning id",[rascunho]).then(r=>{if(r.rows.length===0)throw Error('RLS bloqueou')}))
await assert.rejects(()=>as(ana,'select public.admin_analisar_quadro()'))
await assert.rejects(()=>as(ana,'select licitaflow_quadro.analisar()'))
assert.equal((await as(ana,'select * from public.quadro_recomendacoes')).rows.length,0)
console.log('PASS cliente não publica, não analisa dados globais e não lê recomendações do master')
await db.exec(`set role anon`)
await assert.rejects(()=>db.query('select * from public.quadro_posts'))
await assert.rejects(()=>db.query('select public.admin_quadro_pendencias()'))
await db.exec('reset role')
console.log('PASS acesso anônimo bloqueado')
await assert.rejects(()=>save({link_url:'javascript:alert(1)',link_texto:'Abrir'}))
await assert.rejects(()=>save({link_url:'//example.com',link_texto:'Abrir'}))
await assert.rejects(()=>save({imagem_url:'http://example.com/a.png'}))
await assert.rejects(()=>save({tipo:'banner'}))
await assert.rejects(()=>save({expira_em:new Date(Date.now()-86400000).toISOString()}))
console.log('PASS banco rejeita links executáveis, banners sem imagem e períodos inválidos')
await db.exec(`insert into documentos values(current_date-1);insert into prazos values(false,now()-interval '1 day');insert into suporte_chamados(tipo) values('suporte'),('suporte'),('suporte'),('sugestao')`)
await as(admin,'select public.admin_analisar_quadro()')
const recs=(await as(admin,'select * from public.quadro_recomendacoes')).rows
assert.equal(recs.length,4)
await as(admin,'select public.admin_analisar_quadro()')
assert.equal((await as(admin,'select * from public.quadro_recomendacoes')).rows.length,4)
const rec=recs[0].id
const draft=(await as(admin,'select public.admin_decidir_recomendacao_quadro($1,true) id',[rec])).rows[0].id
assert.equal((await as(admin,'select public.admin_decidir_recomendacao_quadro($1,true) id',[rec])).rows[0].id,draft)
assert.equal((await as(admin,'select status from public.quadro_posts where id=$1',[draft])).rows[0].status,'rascunho')
await as(admin,'select public.admin_analisar_quadro()')
assert.equal((await as(admin,'select status from public.quadro_recomendacoes where id=$1',[rec])).rows[0].status,'rascunho')
await as(admin,'select public.admin_decidir_recomendacao_quadro($1,false)',[recs[1].id])
const pendencias=(await as(admin,'select public.admin_quadro_pendencias() p')).rows[0].p
assert.equal(pendencias.recomendacoes,2);assert.equal(pendencias.usuarios,1)
console.log('PASS análise por evidências, deduplicação, decisão idempotente, rascunho e contador do master')
await db.exec(`update organizations set suspensa=true where id='${orgA}'`)
await assert.rejects(()=>as(ana,'select * from public.quadro_listar($1,100)',[orgA]))
assert.equal((await as(ana,'select * from public.quadro_posts')).rows.length,0)
console.log('PASS organização suspensa não acessa o quadro')
await db.close()
console.log('Quadro informativo: todos os testes passaram.')
