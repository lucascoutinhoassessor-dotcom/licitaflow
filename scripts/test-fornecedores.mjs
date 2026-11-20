// Testes do resumo por fornecedor (migration 20261120000013) com Postgres em memória (PGlite),
// pg_net e pg_cron simulados: nenhuma chamada externa.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const db = new PGlite()
let n = 0
const ok = (v, m) => { if (!v) throw new Error(m); n++; console.log('PASS', m) }

await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.sub',true),'')::uuid$$;
grant usage on schema auth,public to authenticated,anon;
create schema cron;
create table cron.job(jobid bigserial primary key, jobname text unique, schedule text, command text, active boolean default true);
create function cron.schedule(n text, s text, c text) returns bigint language sql as $$insert into cron.job(jobname,schedule,command) values(n,s,c) on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command returning jobid$$;
create function cron.unschedule(id bigint) returns boolean language sql as $$delete from cron.job where jobid=id returning true$$;
create schema net;create table net.http_request_queue(id bigint generated always as identity primary key,url text,params jsonb);
create table net._http_response(id bigint,status_code integer,headers jsonb,content text,timed_out boolean default false,error_msg text,created timestamptz default now());
create function net.http_get(url text,params jsonb default '{}',timeout_milliseconds integer default 2000) returns bigint language plpgsql as $$declare v bigint;begin insert into net.http_request_queue(url,params) values(url,params) returning id into v;return v;end$$;`)
for (const f of ['20261117035403_indice_oportunidades.sql', '20261117035735_coleta_oportunidades.sql', '20261119000010_enxugar_catalogo.sql', '20261120000013_resumo_fornecedores.sql'])
  await db.exec(readFileSync('supabase/migrations/' + f, 'utf8'))

ok((await db.query("select schedule from cron.job where jobname='licitaflow-coleta-contratos'")).rows[0]?.schedule === '30 seconds', 'coletor de contratos agendado a cada 30 s')

const uid = '11111111-1111-1111-1111-111111111111'
const como = async (role, sql, p = []) => { await db.exec(`set role ${role};select set_config('request.jwt.sub','${role === 'authenticated' ? uid : ''}',false)`); try { return await db.query(sql, p) } finally { await db.exec('reset role') } }
const buscar = async (termo, uf = '', pagina = 1) => (await como('authenticated', 'select public.buscar_fornecedores($1,$2,$3) r', [termo, uf, pagina])).rows[0].r

const contrato = (o) => ({ tipoPessoa: 'PJ', niFornecedor: '11222333000144', nomeRazaoSocialFornecedor: 'Papelaria Central Ltda', valorGlobal: 1000, valorInicial: 900,
  dataAssinatura: '2026-11-10', dataPublicacaoPncp: '2026-11-11T08:00:00', receita: false, orgaoEntidade: { cnpj: '12345678000190', razaoSocial: 'Prefeitura de Campinas' },
  unidadeOrgao: { ufSigla: 'SP' }, numeroControlePNCP: 'x', ...o })
const pagina1 = [
  contrato({}),
  contrato({ valorGlobal: 5000, dataAssinatura: '2026-11-12', unidadeOrgao: { ufSigla: 'MG' }, orgaoEntidade: { razaoSocial: 'Prefeitura de Uberlândia' } }),
  contrato({ niFornecedor: '99888777000166', nomeRazaoSocialFornecedor: 'Construtora Horizonte SA', valorGlobal: 2e12 }), // valor absurdo: ignorado
  contrato({ tipoPessoa: 'PF', niFornecedor: '12345678901', nomeRazaoSocialFornecedor: 'Fulano de Tal' }),             // pessoa física: não guarda
  contrato({ niFornecedor: '55444333000122', receita: true }),                                                        // receita: não é venda ao governo
]

// Ciclo do coletor: planeja, envia um pedido por vez, consome a resposta.
const tick = async () => (await db.query('select licitaflow_coleta.tick_contratos() r')).rows[0].r
const responder = async (status, corpo, headers = '{}') => {
  const j = (await db.query('select dia,pagina,request_id from licitaflow_coleta.contratos_jobs where request_id is not null and not concluido')).rows[0]
  await db.query('insert into net._http_response(id,status_code,headers,content) values($1,$2,$3::jsonb,$4)', [j.request_id, status, headers, typeof corpo === 'string' ? corpo : JSON.stringify(corpo)])
  return j
}
const t1 = await tick()
ok(t1.enviados === 1, 'primeiro tick envia um pedido')
ok((await db.query('select count(*)::int n from licitaflow_coleta.contratos_jobs')).rows[0].n === 180, 'janela padrão de 180 dias planejada (página 1 de cada dia)')
ok((await tick()).enviados === 0, 'não envia segundo pedido enquanto há um em voo')
const pedido = (await db.query('select url,params from net.http_request_queue order by id desc limit 1')).rows[0]
const ontem = (await db.query("select to_char((now() at time zone 'America/Sao_Paulo')::date-1,'YYYYMMDD') d")).rows[0].d
ok(pedido.url.endsWith('/contratos') && pedido.params.dataInicial === ontem && pedido.params.tamanhoPagina === 500, 'começa pelo dia mais recente, 500 por página')
ok((await db.query('select count(*)::int n from licitaflow_coleta.envios')).rows[0].n === 1, 'pedido conta no limite por minuto compartilhado')

const j1 = await responder(200, { data: pagina1, totalPaginas: 2, totalRegistros: 6 })
await tick()
ok((await db.query('select count(*)::int n from licitaflow_coleta.contratos_jobs where dia=$1 and pagina=2', [j1.dia])).rows[0].n === 1, 'página 1 agenda as demais páginas do dia')
const pap = (await db.query("select * from public.fornecedores_resumo where cnpj='11222333000144'")).rows[0]
ok(pap.contratos === 2 && Number(pap.valor_total) === 6000 && Number(pap.maior_valor) === 5000, 'contratos e valores somados por empresa')
ok(pap.orgao_ultimo === 'Prefeitura de Uberlândia' && String(pap.ultimo.toISOString()).startsWith('2026-11-12'), 'guarda o órgão do contrato mais recente')
ok((await db.query("select contratos,valor_total from public.fornecedores_resumo where cnpj='99888777000166'")).rows[0].valor_total == 0, 'valor acima de 100 bilhões é tratado como erro de digitação')
ok((await db.query("select count(*)::int n from public.fornecedores_resumo where cnpj in ('12345678901','55444333000122')")).rows[0].n === 0, 'pessoa física e receitas não são guardadas')

// Resposta repetida para a mesma página não é somada de novo (o job já está concluído).
await db.query("insert into net._http_response(id,status_code,headers,content) values($1,200,'{}',$2)", [j1.request_id, JSON.stringify({ data: pagina1, totalPaginas: 2 })])
await tick()
ok((await db.query("select contratos from public.fornecedores_resumo where cnpj='11222333000144'")).rows[0].contratos === 2, 'página já processada nunca é somada em dobro')

// Página 2: a mesma empresa em outro estado.
await responder(200, { data: [contrato({ valorGlobal: 10, unidadeOrgao: { ufSigla: 'BA' }, dataAssinatura: '2026-11-01' })], totalPaginas: 2 })
await tick()
const pap2 = (await db.query("select contratos,orgao_ultimo,primeiro from public.fornecedores_resumo where cnpj='11222333000144'")).rows[0]
ok(pap2.contratos === 3 && pap2.orgao_ultimo === 'Prefeitura de Uberlândia' && String(pap2.primeiro.toISOString()).startsWith('2026-11-01'), 'contrato mais antigo não troca o último órgão e ajusta o período')

// Falhas da fonte.
await responder(404, '{"message":"não encontrado"}')
const j404 = (await db.query("select concluido,erro from licitaflow_coleta.contratos_jobs where erro like 'Página não encontrada%'")).rows
await tick()
ok((await db.query("select count(*)::int n from licitaflow_coleta.contratos_jobs where concluido and erro='Página não encontrada na fonte'")).rows[0].n === 1, '404 encerra o job')
void j404
const j429 = await responder(429, '', '{"retry-after":"600"}')
await tick()
ok((await db.query("select pausa_ate>now()+interval '9 minutes' p from licitaflow_coleta.estado")).rows[0].p, '429 pausa a fonte para os dois coletores')
ok((await tick()).pausado === true, 'nenhum pedido é enviado durante a pausa')
await db.query("update licitaflow_coleta.estado set pausa_ate=null")
await db.query('update licitaflow_coleta.contratos_jobs set proxima_em=now() where dia=$1 and pagina=$2', [j429.dia, j429.pagina])
await tick()
await db.query('update licitaflow_coleta.contratos_jobs set tentativas=12 where request_id is not null')
const jfalha = await responder(500, '')
await tick()
ok((await db.query('select concluido from licitaflow_coleta.contratos_jobs where dia=$1 and pagina=$2', [jfalha.dia, jfalha.pagina])).rows[0].concluido, 'desiste do job após 12 falhas')
const jlixo = await responder(200, 'isto não é json')
await tick()
ok((await db.query('select not concluido and erro is not null v from licitaflow_coleta.contratos_jobs where dia=$1 and pagina=$2', [jlixo.dia, jlixo.pagina])).rows[0].v, 'resposta inválida volta para a fila sem somar nada')

// Janela menor descarta dias antigos.
await db.query("update licitaflow_coleta.contratos_estado set desde_dias=30, planejado_em=null")
await db.query("update licitaflow_coleta.contratos_jobs set request_id=null")
await tick()
ok((await db.query("select min(dia) >= (now() at time zone 'America/Sao_Paulo')::date-30 v from licitaflow_coleta.contratos_jobs")).rows[0].v, 'reduzir a janela apaga jobs fora dela')

// Segurança.
let bloqueou = false; try { await como('anon', "select public.buscar_fornecedores('papelaria')") } catch { bloqueou = true }
ok(bloqueou, 'visitante não pesquisa empresas')
bloqueou = false; try { await como('anon', 'select * from public.fornecedores_resumo') } catch { bloqueou = true }
ok(bloqueou, 'visitante não lê a tabela de resumo')
for (const sql of ['select licitaflow_coleta.tick_contratos()', "select licitaflow_coleta.registrar_contratos('[]')", 'delete from public.fornecedores_resumo', 'select * from licitaflow_coleta.contratos_jobs']) {
  bloqueou = false; try { await como('authenticated', sql) } catch { bloqueou = true }
  ok(bloqueou, 'cliente não controla o coletor: ' + sql.slice(0, 40))
}

// Busca.
const porNome = await buscar('papelaria')
ok(porNome.totalRegistros === 1 && porNome.data[0].cnpj === '11222333000144', 'busca pelo nome sem acento e por prefixo')
ok(JSON.stringify(porNome.data[0].ufs) === '["BA","MG","SP"]', 'UFs dos órgãos contratantes decodificadas')
ok((await buscar('11.222.333/0001-44')).data[0]?.nome === 'Papelaria Central Ltda', 'busca pelo CNPJ com pontuação')
ok((await buscar('papelaria', 'RJ')).totalRegistros === 0 && (await buscar('papelaria', 'MG')).totalRegistros === 1, 'filtro por UF')
const todas = await buscar('')
ok(todas.totalRegistros === 2 && todas.data[0].cnpj === '11222333000144', 'sem termo lista por valor total')
ok(todas.status && todas.status.dias_planejados === 30, 'status da coleta vem junto')
bloqueou = false; try { await buscar('papelaria', 'XX') } catch { bloqueou = true }
ok(bloqueou, 'UF inválida é rejeitada')

console.log('Verificações do resumo de fornecedores aprovadas:', n)
await db.close()
