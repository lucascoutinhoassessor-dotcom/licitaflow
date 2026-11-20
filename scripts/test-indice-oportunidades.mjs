import {PGlite} from '@electric-sql/pglite'
import {readFileSync} from 'node:fs'
import {performance} from 'node:perf_hooks'
const db=new PGlite()
await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;`)
for(const f of ['20261117035403_indice_oportunidades.sql','20261117035735_coleta_oportunidades.sql','20261119000010_enxugar_catalogo.sql'])await db.exec(readFileSync('supabase/migrations/'+f,'utf8'))
let asserts=0
function ok(v,m){if(!v)throw Error(m);asserts++;console.log('PASS',m)}
const uid='11111111-1111-1111-1111-111111111111'
async function como(role,sql,params=[]){await db.exec(`set role ${role};select set_config('request.jwt.sub','${role==='authenticated'?uid:''}',false)`);try{return await db.query(sql,params)}finally{await db.exec('reset role')}}
const c={numeroControlePNCP:'12345678000190-1-000001/2026',numeroCompra:'1',anoCompra:2026,sequencialCompra:1,objetoCompra:'Aquisição de microcomputadores',informacaoComplementar:'Equipamentos para educação',orgaoEntidade:{cnpj:'12345678000190',razaoSocial:'Prefeitura de São Paulo'},unidadeOrgao:{ufSigla:'SP',municipioNome:'São Paulo'},modalidadeId:6,modalidadeNome:'Pregão eletrônico',dataPublicacaoPncp:'2026-11-16T12:00:00',dataEncerramentoProposta:'2099-12-31T10:00:00',srp:false,valorTotalEstimado:10000,usuarioNome:'Compras.gov.br',dataAtualizacaoGlobal:'2026-11-17T10:00:00'}
// Estado de produção em 19/11: recoleta de itens enfileirada com ciclo controle/recoleta-20261119, concluída sem gravar.
const cred={...c,numeroControlePNCP:'12345678000190-1-000077/2026',objetoCompra:'Credenciamento de clínicas de fisioterapia',informacaoComplementar:'',modalidadeId:12,modalidadeNome:'Credenciamento'}
await db.query('select licitaflow_coleta.registrar_compra($1::jsonb)',[JSON.stringify(cred)])
await db.query("delete from licitaflow_coleta.jobs where tipo='itens' and controle=$1",[cred.numeroControlePNCP])
await db.query("insert into licitaflow_coleta.jobs(tipo,ciclo,controle,concluido,concluida_em) values('itens',$1||'/recoleta-20261119',$1,true,now())",[cred.numeroControlePNCP])
await db.exec(readFileSync('supabase/migrations/20261119000011_ampliar_modalidades.sql','utf8'))
await db.exec(readFileSync('supabase/migrations/20261120000012_itens_removidos.sql','utf8'))
await db.exec(readFileSync('supabase/migrations/20261120000014_pesquisa_avancada.sql','utf8'))
await db.exec(readFileSync('supabase/migrations/20261120000015_periodo_abertura.sql','utf8'))
await db.exec(readFileSync('supabase/migrations/20261120000018_coletor_mais_barato.sql','utf8'))
await db.query('select licitaflow_coleta.registrar_compra($1::jsonb)',[JSON.stringify(c)])
const buscar=async f=>(await como('authenticated','select public.buscar_oportunidades($1::jsonb,1,20) r',[JSON.stringify({situacao:'abertas',...f})])).rows[0].r
ok((await buscar({busca:'microcomputador'})).totalRegistros===1,'stemming e prefixo encontram microcomputadores')
ok((await buscar({busca:'educacao'})).totalRegistros===1,'pesquisa normaliza acentos e complemento')
ok((await buscar({busca:'microcomputador',uf:'RJ'})).totalRegistros===0,'UF é filtrada no banco')
ok((await buscar({busca:'microcomputador',minimo:'20000'})).totalRegistros===0,'valor é filtrado antes da paginação')
let bloqueou=false;try{await como('anon','select public.buscar_oportunidades()')}catch{bloqueou=true}ok(bloqueou,'visitante não executa a pesquisa autenticada')
for(const sql of ["delete from public.oportunidades_indice","select licitaflow_coleta.tick()","update public.oportunidades_catalogo_status set carga_inicial_concluida=true"]){bloqueou=false;try{await como('authenticated',sql)}catch{bloqueou=true}ok(bloqueou,'cliente não controla índice/coletor: '+sql.split(' ')[0])}
const itens=[{numeroItem:1,descricao:'Computador de bordo',quantidade:1,orcamentoSigiloso:true,valorUnitarioEstimado:99999,valorTotal:99999,tipoBeneficio:1},{numeroItem:2,descricao:'Monitor para sala',quantidade:1,orcamentoSigiloso:false,valorUnitarioEstimado:500,valorTotal:500,tipoBeneficio:4}]
await db.query('select licitaflow_coleta.registrar_itens($1,$2::jsonb,1,false)',[c.numeroControlePNCP,JSON.stringify(itens)])
ok((await como('authenticated','select * from public.oportunidades_itens_indice')).rows.length===0,'página incompleta de itens permanece oculta')
await db.query('select licitaflow_coleta.registrar_itens($1,\'[]\'::jsonb,2,true)',[c.numeroControlePNCP])
const registrados=(await como('authenticated','select valor_unitario,valor_total from public.oportunidades_itens_indice where numero=1')).rows[0]
const jsonItens=(await como('authenticated','select public.itens_oportunidade_indexados($1) r',[c.numeroControlePNCP])).rows[0].r
ok(registrados.valor_unitario===null&&registrados.valor_total===null&&jsonItens[0].valorUnitarioEstimado===null&&jsonItens[0].valorTotal===null,'preços sigilosos são removidos na gravação')
ok(jsonItens.length===2&&jsonItens[1].descricao==='Monitor para sala'&&Number(jsonItens[1].valorUnitarioEstimado)===500,'itens são devolvidos no mesmo formato para a tela')
ok((await db.query('select busca_itens is not null v from public.oportunidades_indice where controle=$1',[c.numeroControlePNCP])).rows[0].v,'edital guarda um vetor único de busca dos itens')
ok((await buscar({busca:'monitor'})).totalRegistros===1,'busca também encontra palavras em itens indexados')
ok((await buscar({busca:'microcomputador',exclusivo:true,itemMinimo:'400'})).totalRegistros===0,'benefício e valor precisam corresponder ao mesmo item')
ok((await buscar({busca:'microcomputador',itemMinimo:'400',itemMaximo:'600'})).totalRegistros===1,'filtro unitário indexado retorna o edital')
await db.query('select licitaflow_coleta.registrar_compra($1::jsonb)',[JSON.stringify({...c,dataAtualizacaoGlobal:'2026-11-17T12:00:00'})])
const antesFila=(await db.query("select count(*) n from licitaflow_coleta.jobs where tipo='itens'")).rows[0].n
await db.exec("set timezone='America/Sao_Paulo'")
await como('authenticated','select public.solicitar_itens_oportunidade($1)',[c.numeroControlePNCP])
await db.exec("set timezone='UTC'")
ok((await db.query("select count(*) n from licitaflow_coleta.jobs where tipo='itens'")).rows[0].n===antesFila,'fila usa versão canônica independente do fuso do cliente')
await db.query('select licitaflow_coleta.registrar_compra($1::jsonb)',[JSON.stringify({...c,objetoCompra:'Resposta antiga não pode apagar a busca',dataAtualizacaoGlobal:'2026-11-17T09:00:00'})])
ok((await buscar({busca:'microcomputador'})).totalRegistros===1,'respostas antigas não sobrescrevem versão mais recente')
ok((await buscar({busca:'microcomputador',exclusivo:true})).detalhesPendentes===1,'mudança na fonte invalida detalhes e informa cobertura parcial')
ok((await como('authenticated','select * from public.oportunidades_itens_indice')).rows.length===0,'detalhes antigos não ficam expostos após invalidação')
// Transportes simulados: nenhuma chamada externa durante os testes.
await db.exec(`create schema net;create table net.http_request_queue(id bigint generated always as identity primary key,url text,params jsonb);create table net._http_response(id bigint,status_code integer,headers jsonb,content text,timed_out boolean default false,error_msg text,created timestamptz default now());create function net.http_get(url text,params jsonb default '{}',timeout_milliseconds integer default 2000) returns bigint language plpgsql as $$declare v bigint;begin insert into net.http_request_queue(url,params) values(url,params) returning id into v;return v;end$$;update licitaflow_coleta.estado set ativo=true where id;`)
const tick1=(await db.query('select licitaflow_coleta.tick() r')).rows[0].r
ok(tick1.enviados===4,'coletor respeita quatro pedidos em voo')
ok((await db.query('select licitaflow_coleta.tick() r')).rows[0].r.enviados===0,'tick repetido não duplica pedidos em voo')
const requests=(await db.query('select * from net.http_request_queue')).rows
for(const r of requests)await db.query('insert into net._http_response(id,status_code,headers,content) values($1,200,\'{}\',$2)',[r.id,JSON.stringify({data:[c],totalPaginas:2,totalRegistros:51})])
await db.query('select licitaflow_coleta.tick()')
ok((await db.query("select count(*) n from licitaflow_coleta.jobs where tipo='abertas' and pagina=2")).rows[0].n===4,'metadados agendam páginas adicionais independentemente de buscas')
for(let rodada=0;rodada<10;rodada++){
 const pendentes=(await db.query("select request_id from licitaflow_coleta.jobs where tipo='abertas' and ciclo='base-inicial' and request_id is not null")).rows
 if(!pendentes.length)break
 for(const r of pendentes)await db.query("insert into net._http_response(id,status_code,headers,content) values($1,200,'{}',$2)",[r.request_id,JSON.stringify({data:[c],totalPaginas:2,totalRegistros:51})])
 await db.query('select licitaflow_coleta.tick()')
}
const status=(await db.query('select * from public.oportunidades_catalogo_status')).rows[0]
ok(status.carga_inicial_concluida&&status.paginas_coletadas===12&&status.paginas_planejadas===12,'carga inicial termina somente após persistir todas as páginas')
const request=(await db.query('select request_id from licitaflow_coleta.jobs where request_id is not null limit 1')).rows[0].request_id
await db.query("insert into net._http_response(id,status_code,headers,content) values($1,429,'{\"retry-after\":\"3600\"}','')",[request])
await db.query('select licitaflow_coleta.tick()')
ok((await db.query("select pausa_ate>now()+interval '59 minutes' p from licitaflow_coleta.estado")).rows[0].p,'coletor respeita Retry-After de uma hora sem truncar')
ok((await buscar({busca:'microcomputador'})).totalRegistros===1,'pesquisa continua disponível durante pausa da fonte')
// Limpeza: itens de editais encerrados há mais de 2 dias saem do catálogo; o edital fica.
const velho={...c,numeroControlePNCP:'12345678000190-1-000099/2026',objetoCompra:'Aquisição de cadeiras',dataEncerramentoProposta:'2020-01-01T10:00:00'}
await db.query('select licitaflow_coleta.registrar_compra($1::jsonb)',[JSON.stringify(velho)])
ok((await db.query("select count(*)::int n from licitaflow_coleta.jobs where tipo='itens' and controle=$1",[velho.numeroControlePNCP])).rows[0].n===0,'editais encerrados não entram na fila de itens')
await db.query('select licitaflow_coleta.registrar_itens($1,$2::jsonb,1,true)',[velho.numeroControlePNCP,JSON.stringify([{numeroItem:1,descricao:'Cadeira giratória',quantidade:2}])])
const limpeza=(await db.query('select licitaflow_coleta.limpar_catalogo() r')).rows[0].r
ok(Number(limpeza.itens_removidos)===1,'limpeza remove itens de editais encerrados')
ok((await db.query('select itens_completos from public.oportunidades_indice where controle=$1',[velho.numeroControlePNCP])).rows[0].itens_completos===false,'edital encerrado continua no catálogo sem itens')
ok((await buscar({busca:'microcomputador'})).totalRegistros===1,'limpeza não afeta editais abertos')
// Ampliação de modalidades e correção da recoleta (migration 20261119000011).
ok((await db.query("select not concluido v from licitaflow_coleta.jobs where tipo='itens' and controle=$1",[cred.numeroControlePNCP])).rows[0].v,'recoleta concluída sem itens volta para a fila')
ok((await db.query("select array_agg(modalidade order by modalidade)::text v from licitaflow_coleta.jobs where tipo='abertas' and ciclo='abertas/ampliacao-20261119' and pagina=1")).rows[0].v==='{1,2,3,10,11,12,13}','carga das modalidades novas enfileirada')
ok((await db.query('select licitaflow_coleta.modalidades()::text v')).rows[0].v==='{1,2,3,4,5,6,7,8,9,10,11,12,13}','próximos ciclos diários cobrem as 13 modalidades')
ok((await buscar({busca:'fisioterapia'})).totalRegistros===1,'pesquisa sem filtro de modalidade inclui credenciamento')
ok((await buscar({busca:'fisioterapia',modalidades:['6','8']})).totalRegistros===0,'filtro de modalidade continua valendo')
await db.query("update licitaflow_coleta.estado set pausa_ate=now()-interval '1 second' where id")
const rid=(await db.query("select net.http_get('https://pncp.gov.br/itens') id")).rows[0].id
await db.query("update licitaflow_coleta.jobs set request_id=$1,agendada_em=now() where tipo='itens' and controle=$2",[rid,cred.numeroControlePNCP])
await db.query("insert into net._http_response(id,status_code,headers,content) values($1,200,'{}',$2)",[rid,JSON.stringify([{numeroItem:1,descricao:'Sessão de hidroterapia',quantidade:100}])])
await db.query('select licitaflow_coleta.tick()')
ok((await db.query('select itens_completos from public.oportunidades_indice where controle=$1',[cred.numeroControlePNCP])).rows[0].itens_completos,'coletor grava itens de job de recoleta')
ok((await buscar({busca:'hidroterapia'})).totalRegistros===1,'itens recoletados entram na busca')
// Editais retirados do PNCP (404) e falhas repetidas não travam a fila de itens.
const sumido={...c,numeroControlePNCP:'12345678000190-1-000088/2026',objetoCompra:'Edital retirado da fonte'}
await db.query('select licitaflow_coleta.registrar_compra($1::jsonb)',[JSON.stringify(sumido)])
const r404=(await db.query("select net.http_get('https://pncp.gov.br/itens') id")).rows[0].id
await db.query("update licitaflow_coleta.jobs set request_id=$1,agendada_em=now() where tipo='itens' and controle=$2",[r404,sumido.numeroControlePNCP])
await db.query("insert into net._http_response(id,status_code,headers,content) values($1,404,'{}','{\"message\":\"Contratação não cadastrada.\"}')",[r404])
await db.query('select licitaflow_coleta.tick()')
ok((await db.query("select concluido from licitaflow_coleta.jobs where tipo='itens' and controle=$1",[sumido.numeroControlePNCP])).rows[0].concluido,'404 em itens encerra o job sem novas tentativas')
const r500=(await db.query("select net.http_get('https://pncp.gov.br/itens') id")).rows[0].id
await db.query("update licitaflow_coleta.jobs set request_id=$1,agendada_em=now(),tentativas=12,concluido=false where tipo='itens' and controle=$2",[r500,sumido.numeroControlePNCP])
await db.query("insert into net._http_response(id,status_code,headers,content) values($1,500,'{}','')",[r500])
await db.query('select licitaflow_coleta.tick()')
ok((await db.query("select concluido from licitaflow_coleta.jobs where tipo='itens' and controle=$1",[sumido.numeroControlePNCP])).rows[0].concluido,'job de itens para de tentar após 12 falhas')
// Pesquisa avançada (migration 20261120000014).
ok((await buscar({busca:'termoquenaoexiste; microcomputador'})).totalRegistros===1,'termos separados por ";" valem como qualquer um deles')
ok((await buscar({busca:'aquisicao',excluir:'microcomputador'})).data.every(x=>x.numeroControlePNCP!==c.numeroControlePNCP),'termos a excluir tiram o edital do resultado')
ok((await buscar({busca:'microcomputador',excluir:'cadeira; mesa'})).totalRegistros===1,'excluir termos ausentes não afeta o resultado')
const itensAntes=(await db.query('select count(*)::int n from public.oportunidades_itens_indice where controle=$1',[cred.numeroControlePNCP])).rows[0].n
await db.query('select licitaflow_coleta.registrar_compra($1::jsonb)',[JSON.stringify({...c,dataAtualizacaoGlobal:'2026-11-17T12:00:00',modoDisputaId:3,modoDisputaNome:'Aberto-Fechado'})])
ok((await buscar({busca:'microcomputador',modosDisputa:['3']})).totalRegistros===1,'filtro de modo de disputa encontra o edital')
ok((await buscar({busca:'microcomputador',modosDisputa:['1','2']})).totalRegistros===0,'filtro de modo de disputa exclui outros modos')
ok((await buscar({busca:'microcomputador'})).data[0].modoDisputaId===3,'resultado informa o modo de disputa')
await db.query('select licitaflow_coleta.registrar_compra($1::jsonb)',[JSON.stringify({...cred,modoDisputaId:5})])
ok((await db.query('select count(*)::int n from public.oportunidades_itens_indice where controle=$1',[cred.numeroControlePNCP])).rows[0].n===itensAntes,'gravar o modo de disputa não apaga itens já coletados')
ok((await buscar({busca:'fisioterapia',tipoItem:'S'})).totalRegistros===0,'edital sem tipo conhecido fica fora do filtro de serviço')
await db.query('select licitaflow_coleta.registrar_itens($1,$2::jsonb,1,true)',[cred.numeroControlePNCP,JSON.stringify([{numeroItem:1,descricao:'Sessão de hidroterapia',quantidade:100,materialOuServico:'S'}])])
const rServ=await buscar({busca:'fisioterapia',tipoItem:'S'})
ok(rServ.totalRegistros===1&&rServ.data[0].materialOuServico==='S','filtro "somente serviços" usa o tipo dos itens')
ok((await buscar({busca:'fisioterapia',tipoItem:'M'})).totalRegistros===0,'filtro "somente materiais" exclui edital só de serviços')
await db.query('select licitaflow_coleta.registrar_itens($1,$2::jsonb,1,false)',[cred.numeroControlePNCP,JSON.stringify([{numeroItem:1,descricao:'Sessão',materialOuServico:'S'}])])
await db.query('select licitaflow_coleta.registrar_itens($1,$2::jsonb,2,true)',[cred.numeroControlePNCP,JSON.stringify([{numeroItem:2,descricao:'Bola terapêutica',materialOuServico:'M'}])])
ok((await db.query('select tipo_itens from public.oportunidades_indice where controle=$1',[cred.numeroControlePNCP])).rows[0].tipo_itens==='MS','tipo soma material e serviço entre páginas')
let invalido=false;try{await buscar({tipoItem:'X'})}catch{invalido=true}ok(invalido,'tipo de item inválido é recusado')
// Período de abertura (migration 20261120000015). O edital de teste abre em 31/12/2099.
ok((await buscar({busca:'microcomputador',aberturaDe:'2099-12-01',aberturaAte:'2099-12-31'})).totalRegistros===1,'período de abertura inclui o dia final inteiro')
ok((await buscar({busca:'microcomputador',aberturaDe:'2026-11-20',aberturaAte:'2026-12-04'})).totalRegistros===0,'período de abertura exclui sessões fora do intervalo')
ok((await buscar({busca:'microcomputador',aberturaDe:'',aberturaAte:''})).totalRegistros===1,'datas vazias não limitam a abertura')
let periodoInvalido=false;try{await buscar({aberturaDe:'2026-12-10',aberturaAte:'2026-12-01'})}catch{periodoInvalido=true}ok(periodoInvalido,'período de abertura invertido é recusado')
// Coletas mais leves (migration 20261120000017): itens só dos próximos 30 dias e descrição curta.
await db.exec(readFileSync('supabase/migrations/20261120000017_coletas_mais_leves.sql','utf8'))
const emDias=d=>new Date(Date.now()+d*86_400_000).toISOString().slice(0,19)
const perto={...c,numeroControlePNCP:'12345678000190-1-000501/2026',objetoCompra:'Aquisição de toner',dataEncerramentoProposta:emDias(10)}
const longe={...c,numeroControlePNCP:'12345678000190-1-000502/2026',objetoCompra:'Aquisição de grampeador',dataEncerramentoProposta:emDias(90)}
for(const x of [perto,longe])await db.query('select licitaflow_coleta.registrar_compra($1::jsonb)',[JSON.stringify(x)])
const filaDe=async id=>(await db.query("select count(*)::int n from licitaflow_coleta.jobs where tipo='itens' and not concluido and controle=$1",[id])).rows[0].n
ok(await filaDe(perto.numeroControlePNCP)===1,'edital que abre em 10 dias entra na fila de itens')
ok(await filaDe(longe.numeroControlePNCP)===0,'edital que abre em 90 dias espera a data se aproximar')
await db.query("insert into licitaflow_coleta.jobs(tipo,ciclo,controle) values('itens',$1||'/recoleta-x',$1)",[longe.numeroControlePNCP])
await db.query('select licitaflow_coleta.limpar_catalogo()')
ok(await filaDe(longe.numeroControlePNCP)===0,'limpeza tira da fila os itens de editais distantes')
await db.query('select licitaflow_coleta.registrar_itens($1,$2::jsonb,1,true)',[perto.numeroControlePNCP,JSON.stringify([{numeroItem:1,descricao:'Toner '+'x'.repeat(600)}])])
ok((await db.query('select length(descricao) n from public.oportunidades_itens_indice where controle=$1',[perto.numeroControlePNCP])).rows[0].n===240,'descrição do item guardada com até 240 caracteres')
console.log('Preparando 50 mil editais de teste...')
await db.exec(`insert into public.oportunidades_indice(controle,objeto,complemento,orgao_cnpj,orgao_nome,uf,modalidade,portal_id,publicacao,encerramento,situacao,valor,srp,compra)
select 'benchmark-'||n,case when n%100=0 then 'Aquisição de microcomputadores para educação' else 'Aquisição de material de escritório e papelaria '||n end,'','12345678000190','Órgão público',case when n%3=0 then 'SP' else 'RJ' end,6,'comprasnet',now()-(n||' seconds')::interval,'2099-12-31',1,10000,false,jsonb_build_object('numeroControlePNCP','benchmark-'||n,'objetoCompra','Aquisição de bens públicos') from generate_series(1,50000) n;analyze public.oportunidades_indice;analyze public.oportunidades_itens_indice;`)
const latencias=[]
for(let i=0;i<31;i++){const t=performance.now();const r=(await como('authenticated','select public.buscar_oportunidades($1::jsonb,$2,20) r',[JSON.stringify({busca:'microcomputador',situacao:'abertas'}),i%2+1])).rows[0].r;latencias.push(performance.now()-t);ok(r.totalRegistros===501,'contagem inclui a base inteira '+(i+1));}
latencias.sort((a,b)=>a-b)
console.log(JSON.stringify({registros:50001,mediana_ms:Math.round(latencias[15]*100)/100,p95_ms:Math.round(latencias[29]*100)/100,teste:'Postgres local em WebAssembly; não mede rede de produção'}))
const plano=await db.query("explain (format json) select controle from public.oportunidades_indice where busca @@ public.oportunidades_termos('microcomputador')")
ok(JSON.stringify(plano.rows).includes('oportunidades_busca_gin'),'plano usa índice GIN')
console.log('Verificações do índice aprovadas:',asserts)
await db.close()
