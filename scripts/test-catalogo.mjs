// Ensaia o catálogo de materiais/serviços (migration 20261120000016) com a fonte simulada.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const db = new PGlite()
let n = 0
const ok = (v, m) => { if (!v) throw new Error(m); n++; console.log('PASS', m) }
await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.sub',true),'')::uuid$$;
grant usage on schema auth,public to authenticated,anon;
create schema net;create table net.http_request_queue(id bigint generated always as identity primary key,url text,params jsonb);
create table net._http_response(id bigint,status_code integer,headers jsonb,content text,timed_out boolean default false,error_msg text,created timestamptz default now());
create function net.http_get(url text,params jsonb default '{}',timeout_milliseconds integer default 2000) returns bigint language plpgsql as $$declare v bigint;begin insert into net.http_request_queue(url,params) values(url,params) returning id into v;return v;end$$;`)
for (const f of ['20261117035403_indice_oportunidades.sql', '20261117035735_coleta_oportunidades.sql', '20261120000016_catalogo_precos.sql']) await db.exec(readFileSync('supabase/migrations/' + f, 'utf8'))

const uid = '11111111-1111-1111-1111-111111111111'
const buscar = async (termo, tipo = '') => {
  await db.exec(`set role authenticated;select set_config('request.jwt.sub','${uid}',false)`)
  try { return (await db.query('select public.buscar_catalogo($1,$2) r', [termo, tipo])).rows[0].r } finally { await db.exec('reset role') }
}
const responder = async (pedidoUrl, corpo) => {
  const p = (await db.query('select id from net.http_request_queue where url like $1 order by id desc limit 1', ['%' + pedidoUrl + '%'])).rows[0]
  await db.query("insert into net._http_response(id,status_code,headers,content) values($1,200,'{}',$2)", [p.id, JSON.stringify(corpo)])
}

await db.query('select licitaflow_coleta.tick_catalogo()')
ok((await db.query('select count(*)::int n from net.http_request_queue')).rows[0].n === 2, 'carga pede a 1ª página de materiais e de serviços')
await responder('3_consultarPdmMaterial', { resultado: [
  { codigoPdm: 281, nomePdm: 'CARTUCHO CANETA TINTEIRO', nomeClasse: 'ACESSÓRIOS PARA ESCRITÓRIO', nomeGrupo: 'UTENSÍLIOS', statusPdm: true },
  { codigoPdm: 9001, nomePdm: '"PAPEL PARA IMPRESSÃO FORMATADO"', nomeClasse: 'PAPEL', nomeGrupo: 'UTENSÍLIOS', statusPdm: true },
  { codigoPdm: 9002, nomePdm: 'PAPEL INATIVO', nomeClasse: 'PAPEL', statusPdm: false },
], totalPaginas: 2 })
await responder('6_consultarItemServico', { resultado: [{ codigoServico: 7250, nomeServico: 'ENDOSCOPIA DIGESTIVA', nomeClasse: 'SERVIÇOS HOSPITALARES', statusServico: true }], totalPaginas: 1 })
await db.query('select licitaflow_coleta.tick_catalogo()')
ok((await db.query('select count(*)::int n from public.catalogo_compras')).rows[0].n === 3, 'grava itens ativos e ignora inativos')
const estado = (await db.query("select tipo,pagina,concluida_em is not null feito from licitaflow_coleta.catalogo_carga order by tipo")).rows
ok(estado[0].pagina === 2 && !estado[0].feito && estado[1].feito, 'materiais seguem para a página 2; serviços concluídos')
const papel = await buscar('papel impressao')
ok(papel.data.length === 1 && papel.data[0].codigo === 9001 && papel.data[0].nome === 'PAPEL PARA IMPRESSÃO FORMATADO', 'pesquisa por palavra acha o código (sem aspas no nome)')
ok((await buscar('endoscopia', 'M')).data.length === 0 && (await buscar('endoscopia', 'S')).data.length === 1, 'filtro por material ou serviço')
let negado = false
try { await db.exec('set role anon'); await db.query("select public.buscar_catalogo('papel')") } catch { negado = true } finally { await db.exec('reset role') }
ok(negado, 'visitante não pesquisa o catálogo')
await db.query("update licitaflow_coleta.catalogo_carga set concluida_em=now()-interval '8 days' where tipo='S'")
await db.query('select licitaflow_coleta.tick_catalogo()')
ok((await db.query("select pagina,concluida_em from licitaflow_coleta.catalogo_carga where tipo='S'")).rows[0].concluida_em === null, 'carga recomeça depois de 7 dias')
console.log('Verificações do catálogo aprovadas:', n)
await db.close()
