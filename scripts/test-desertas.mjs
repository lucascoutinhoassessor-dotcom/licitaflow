// Testes das oportunidades desertas e fracassadas (migration 20261121000029) num Postgres em memória.
import {PGlite} from '@electric-sql/pglite'
import {readFileSync} from 'node:fs'
const db=new PGlite()
await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;`)
for(const f of ['20261117035403_indice_oportunidades','20261117035735_coleta_oportunidades','20261119000010_enxugar_catalogo','20261119000011_ampliar_modalidades','20261120000012_itens_removidos',
 '20261120000014_pesquisa_avancada','20261120000015_periodo_abertura','20261120000017_coletas_mais_leves','20261120000018_coletor_mais_barato','20261120000019_tipo_pelo_objeto',
 '20261120000020_dias_uteis','20261121000021_itens_enxutos','20261121000022_itens_campos_de_volta','20261121000023_inverter_ordem','20261121000024_busca_mais_leve',
 '20261121000026_fila_sem_indice_janela','20261121000029_oportunidades_desertas'])await db.exec(readFileSync(`supabase/migrations/${f}.sql`,'utf8'))
await db.exec(`create schema if not exists net;create table net.http_request_queue(id bigint generated always as identity primary key,url text,params jsonb);create table net._http_response(id bigint,status_code integer,headers jsonb,content text,timed_out boolean default false,error_msg text,created timestamptz default now());create function net.http_get(url text,params jsonb default '{}',timeout_milliseconds integer default 2000) returns bigint language plpgsql as $$declare v bigint;begin insert into net.http_request_queue(url,params) values(url,params) returning id into v;return v;end$$;
 update licitaflow_coleta.estado set ativo=true where id;update public.oportunidades_catalogo_status set carga_inicial_concluida=true where id;
 update licitaflow_coleta.estado set ultimo_delta_em=now(),ultima_varredura_em=now() where id;`)
let asserts=0
function ok(v,m){if(!v)throw Error(m);asserts++;console.log('PASS',m)}
const uid='11111111-1111-1111-1111-111111111111'
async function como(role,sql,params=[]){await db.exec(`set role ${role};select set_config('request.jwt.sub','${role==='authenticated'?uid:''}',false)`);try{return await db.query(sql,params)}finally{await db.exec('reset role')}}
const buscar=async(f={},pagina=1)=>(await como('authenticated','select public.buscar_desertas($1::jsonb,$2,20) r',[JSON.stringify(f),pagina])).rows[0].r
const dias=n=>new Date(Date.now()-n*864e5).toISOString().slice(0,19)
const edital=(seq,extra={})=>({numeroControlePNCP:`12345678000190-1-${String(seq).padStart(6,'0')}/2026`,numeroCompra:String(seq),anoCompra:2026,sequencialCompra:seq,objetoCompra:'Aquisição de material de expediente',informacaoComplementar:'',
 orgaoEntidade:{cnpj:'12345678000190',razaoSocial:'Prefeitura de Campinas'},unidadeOrgao:{ufSigla:'SP',municipioNome:'Campinas'},modalidadeId:6,modalidadeNome:'Pregão eletrônico',
 dataPublicacaoPncp:dias(20),dataEncerramentoProposta:dias(3),srp:false,valorTotalEstimado:10000,usuarioNome:'Compras.gov.br',dataAtualizacaoGlobal:dias(20),...extra})
const recente=edital(1),antigo=edital(2,{dataEncerramentoProposta:dias(10),objetoCompra:'Aquisição de notebooks'}),cred=edital(3,{modalidadeId:12,modalidadeNome:'Credenciamento'}),aberto=edital(4,{dataEncerramentoProposta:'2099-12-31T10:00:00'}),ontem=edital(5,{dataEncerramentoProposta:dias(1)})
for(const c of [recente,antigo,cred,aberto,ontem])await db.query('select licitaflow_coleta.registrar_compra($1::jsonb)',[JSON.stringify(c)])
await db.query("delete from licitaflow_coleta.jobs")

// Agendamento das verificações depois da sessão.
const r1=(await db.query('select licitaflow_coleta.tick() r')).rows[0].r
const jobs=(await db.query("select controle,ciclo,request_id from licitaflow_coleta.jobs where tipo='desertos' order by controle")).rows
ok(jobs.length===2,'manutenção do coletor agenda a verificação só de pregões com sessão há mais de 2 dias')
ok(jobs.some(j=>j.ciclo===recente.numeroControlePNCP+'/deserto-1')&&jobs.some(j=>j.ciclo===antigo.numeroControlePNCP+'/deserto-2'),'edital que entra tarde pula para a verificação da sua idade')
ok(!jobs.some(j=>j.controle===cred.numeroControlePNCP),'credenciamento não é verificado')
ok(r1.enviados===0&&(await db.query('select licitaflow_coleta.tick() r')).rows[0].r.enviados===2,'verificações agendadas saem na rodada seguinte do coletor')
const fila=(await db.query("select q.url from net.http_request_queue q join licitaflow_coleta.jobs j on j.request_id=q.id where j.controle=$1",[recente.numeroControlePNCP])).rows[0]
ok(fila.url==='https://pncp.gov.br/api/pncp/v1/orgaos/12345678000190/compras/2026/1/itens','verificação lê os itens do edital no PNCP')
ok((await db.query('select licitaflow_coleta.agendar_desertos(200) n')).rows[0].n===0,'não repete a verificação antes do prazo seguinte')
await db.query("update public.oportunidades_indice set encerramento=now()-interval '8 days' where controle=$1",[recente.numeroControlePNCP])
ok((await db.query('select licitaflow_coleta.agendar_desertos(200) n')).rows[0].n===1,'segunda verificação 7 dias depois da sessão')
await db.query("update public.oportunidades_indice set encerramento=now()-interval '3 days' where controle=$1",[recente.numeroControlePNCP])
await db.query("delete from licitaflow_coleta.jobs where ciclo like '%/deserto-2' and controle=$1",[recente.numeroControlePNCP])

// Resposta do PNCP: só desertos e fracassados ficam guardados; sigilo preservado.
const responder=async(c,status,corpo)=>{const j=(await db.query("select request_id from licitaflow_coleta.jobs where tipo='desertos' and controle=$1 and request_id is not null",[c.numeroControlePNCP])).rows[0];await db.query("insert into net._http_response(id,status_code,headers,content) values($1,$2,'{}',$3)",[j.request_id,status,corpo])}
await responder(recente,200,JSON.stringify([
 {numeroItem:1,descricao:'Papel A4 75g resma 500 folhas',quantidade:100,unidadeMedida:'RESMA',valorUnitarioEstimado:25,situacaoCompraItem:4,situacaoCompraItemNome:'Deserto',tipoBeneficio:1},
 {numeroItem:2,descricao:'Caneta esferográfica azul',quantidade:500,unidadeMedida:'UN',valorUnitarioEstimado:1.5,situacaoCompraItem:2,situacaoCompraItemNome:'Homologado'},
 {numeroItem:3,descricao:'Grampeador de mesa',quantidade:10,unidadeMedida:'UN',valorUnitarioEstimado:40,orcamentoSigiloso:true,situacaoCompraItem:5,situacaoCompraItemNome:'Fracassado'}]))
await responder(antigo,404,'{"message":"Contratação não cadastrada."}')
await db.query('select licitaflow_coleta.tick()')
const guardados=(await db.query('select numero,situacao,valor_unitario from public.oportunidades_desertos order by numero')).rows
ok(guardados.length===2&&guardados[0].situacao===4&&guardados[1].situacao===5,'guarda só os itens desertos e fracassados')
ok(guardados[1].valor_unitario===null,'preço de item sigiloso não é guardado')
ok((await db.query("select concluido from licitaflow_coleta.jobs where tipo='desertos' and controle=$1",[antigo.numeroControlePNCP])).rows[0].concluido,'404 encerra a verificação')

// Pesquisa.
let r=await buscar()
ok(r.totalRegistros===1&&r.data[0].desertos===1&&r.data[0].fracassados===1,'pesquisa traz o edital com contagem de desertos e fracassados')
ok(Number(r.data[0].valorDesertos)===2500&&r.data[0].itensDesertos.length===2&&r.data[0].objetoCompra===recente.objetoCompra,'pesquisa traz os itens e o valor estimado sem o sigiloso')
ok((await buscar({busca:'papel'})).totalRegistros===1,'palavra-chave encontra a descrição do item deserto')
ok((await buscar({busca:'expediente'})).totalRegistros===1,'palavra-chave encontra o objeto do edital')
ok((await buscar({busca:'caneta'})).totalRegistros===0,'item homologado não entra na pesquisa')
ok((await buscar({tipo:'4'})).data[0].itensDesertos.length===1,'filtro só desertos')
ok((await buscar({uf:'RJ'})).totalRegistros===0&&(await buscar({dias:2})).totalRegistros===0&&(await buscar({modalidades:['8']})).totalRegistros===0,'filtros de UF, período e modalidade')
let erro=false;try{await buscar({dias:400})}catch{erro=true}ok(erro,'período acima de 30 dias é recusado')
erro=false;try{await como('anon','select public.buscar_desertas()')}catch{erro=true}ok(erro,'visitante sem login não pesquisa')
erro=false;try{await como('authenticated',"insert into public.oportunidades_desertos(controle,numero,situacao) values('x',1,4)")}catch{erro=true}ok(erro,'cliente não grava desertos')
erro=false;try{await como('authenticated','select licitaflow_coleta.agendar_desertos(1)')}catch{erro=true}ok(erro,'cliente não agenda verificações')

// Nova verificação substitui a anterior; edital removido do catálogo leva os desertos junto.
await db.query("insert into licitaflow_coleta.jobs(tipo,ciclo,controle) values('desertos',$1||'/deserto-2',$1)",[recente.numeroControlePNCP])
await db.query('select licitaflow_coleta.tick()')
await responder(recente,200,JSON.stringify([{numeroItem:1,descricao:'Papel A4',quantidade:100,valorUnitarioEstimado:25,situacaoCompraItem:2}]))
await db.query('select licitaflow_coleta.tick()')
ok((await buscar()).totalRegistros===0,'item que deixou de ser deserto sai da pesquisa')
await db.query("insert into public.oportunidades_desertos(controle,numero,situacao) values($1,9,4)",[recente.numeroControlePNCP])
await db.query('delete from public.oportunidades_indice where controle=$1',[recente.numeroControlePNCP])
ok((await db.query('select count(*)::int n from public.oportunidades_desertos')).rows[0].n===0,'desertos saem junto com o edital')
// Prioridade: verificações não passam à frente das atualizações do catálogo.
await db.exec("delete from licitaflow_coleta.jobs;delete from licitaflow_coleta.envios;insert into licitaflow_coleta.jobs(tipo,ciclo,controle) select 'desertos','t'||n,'c'||n from generate_series(1,6) n;insert into licitaflow_coleta.jobs(tipo,ciclo,modalidade,inicio,fim) values('atualizacao','delta/t',6,current_date,current_date)")
await db.query('select licitaflow_coleta.tick()')
ok((await db.query("select request_id is not null v from licitaflow_coleta.jobs where tipo='atualizacao'")).rows[0].v,'atualização do catálogo sai antes das verificações')
console.log('Verificações de desertas aprovadas:',asserts)
await db.close()
