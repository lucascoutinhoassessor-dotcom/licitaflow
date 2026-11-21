// Testes do índice de peças jurídicas (migration 20261121000032) num Postgres em memória.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
const db = new PGlite()
await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.sub',true),'')::uuid$$;
 grant usage on schema auth,public to authenticated,anon,service_role;`)
for (const f of ['20261117035403_indice_oportunidades', '20261121000032_pecas_juridicas']) await db.exec(readFileSync(`supabase/migrations/${f}.sql`, 'utf8'))
await db.exec(`create schema net;create table net.pedidos(id bigint generated always as identity,url text,headers jsonb);
 create function net.http_get(url text,params jsonb default '{}',headers jsonb default '{}',timeout_milliseconds integer default 2000) returns bigint language plpgsql as $$declare v bigint;begin insert into net.pedidos(url,headers) values(url,headers) returning id into v;return v;end$$;`)

let asserts = 0
function ok(v, m) { if (!v) throw Error(m); asserts++; console.log('PASS', m) }
async function falha(p, m) { try { await p } catch { return ok(true, m) } throw Error(m) }
const uid = '11111111-1111-1111-1111-111111111111'
async function como(role, sql, params = []) {
  await db.exec(`set role ${role};select set_config('request.jwt.sub','${role === 'authenticated' ? uid : ''}',false)`)
  try { return await db.query(sql, params) } finally { await db.exec('reset role') }
}
const token = (await db.query('select token from licitaflow_juridico.config')).rows[0].token
const buscar = async (f = {}, pagina = 1) => (await como('authenticated', 'select public.buscar_pecas($1::jsonb,$2) r', [JSON.stringify(f), pagina])).rows[0].r
const dia = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10)

// Fila de dias.
ok(token.length >= 32, 'token da coleta nasce aleatório')
await falha(como('service_role', 'select public.pecas_coleta_proximo($1)', ['errado']), 'token errado não pega trabalho')
await falha(como('authenticated', 'select public.pecas_coleta_proximo($1)', [token]), 'cliente não chama a coleta')
await falha(como('anon', 'select public.buscar_pecas()'), 'anônimo não pesquisa')
let prox = (await como('service_role', 'select public.pecas_coleta_proximo($1) r', [token])).rows[0].r
ok(prox.dia === dia(21) && prox.passada === 1 && prox.pagina === 1, 'primeiro o dia mais recente da passada 1 (sessão há 21 dias)')
const dias = (await db.query('select passada,count(*)::int n from licitaflow_juridico.dias group by passada order by passada')).rows
ok(dias[0].n === 70 && dias[1].n === 31, 'janela de 90 dias: passada 1 de 21 a 90 dias, passada 2 de 60 a 90')
const prox2 = (await como('service_role', 'select public.pecas_coleta_proximo($1) r', [token])).rows[0].r
ok(prox2.dia === dia(22), 'dia em andamento não é entregue de novo por 10 minutos')

// Disparo pelo pg_cron.
ok((await db.query('select licitaflow_juridico.disparar() r')).rows[0].r === true, 'agendador dispara quando há dia pendente')
const ped = (await db.query('select url,headers from net.pedidos')).rows[0]
ok(ped.url.endsWith('/api/juridico?acao=coletar') && ped.headers['x-coleta'] === token, 'disparo chama a Vercel com o token no cabeçalho')
await db.exec('update licitaflow_juridico.config set ativo=false')
ok((await db.query('select licitaflow_juridico.disparar() r')).rows[0].r === false, 'coleta pausada não dispara')
await db.exec('update licitaflow_juridico.config set ativo=true')

// Gravação.
const proc = (codigo, extra = {}) => ({ codigo, orgao: 'Prefeitura Municipal de Gramado', municipio: 'Gramado', uf: 'RS', modalidade: 'Pregão Eletrônico', numero: `${codigo}/2026`,
  objeto: 'Aquisição de pneus para a frota municipal', lei14133: true, sessao: prox.dia, url: `https://www.portaldecompraspublicas.com.br/processos/rs/x/${codigo}`, ...extra })
const peca = (tipo, extra = {}) => ({ tipo, papel: 'pedido', titulo: tipo, empresa: null, item: null, arquivo_url: 'https://arquivos.portaldecompraspublicas.com.br/v1/download/abc', trecho: null, data: '2026-08-01T10:00:00-03:00', ...extra })
const gravar = (pagina, paginas, processos, d = prox) => como('service_role', 'select public.pecas_coleta_gravar($1,$2,$3,$4,$5,$6,$7::jsonb) r', [token, d.dia, d.passada, pagina, paginas, 50, JSON.stringify(processos)])
await gravar(1, 2, [
  { ...proc(1), pecas: [peca('recurso', { empresa: 'AUTOMAX PECAS LTDA', item: 'Item 1', data: '2026-08-03T10:00:00-03:00' }), peca('contrarrazoes', { empresa: 'VICENZO PNEUS LTDA', item: 'Item 1' }), peca('invalido')] },
  { ...proc(2, { orgao: 'Câmara de Varginha', municipio: 'Varginha', uf: 'MG', objeto: 'Serviços de limpeza', lei14133: false }), pecas: [peca('impugnacao'), peca('intencao-recurso', { arquivo_url: null, trecho: 'O fornecedor LIMPA BEM LTDA declarou intenção de recurso para o item 2.', empresa: 'LIMPA BEM LTDA' })] },
  { codigo: 3, pecas: [] },
])
ok((await db.query('select count(*)::int n from public.pecas_juridicas')).rows[0].n === 4, 'grava as peças válidas e ignora tipo desconhecido')
ok((await db.query('select count(*)::int n from public.pecas_processos')).rows[0].n === 2, 'processo sem peças não entra no índice')
let estado = (await db.query('select proxima_pagina,paginas,concluido_em,tentado_em,com_pecas from licitaflow_juridico.dias where dia=$1 and passada=1', [prox.dia])).rows[0]
ok(estado.proxima_pagina === 2 && estado.paginas === 2 && !estado.concluido_em && !estado.tentado_em && estado.com_pecas === 3, 'fila avança para a página seguinte do dia')
await gravar(2, 2, [{ ...proc(1), pecas: [peca('recurso', { empresa: 'AUTOMAX PECAS LTDA', item: 'Item 1', data: '2026-08-03T10:00:00-03:00' })] }])
ok((await db.query('select count(*)::int n from public.pecas_juridicas where codigo=1')).rows[0].n === 1, 'regravar um processo substitui as peças dele')
ok((await db.query('select concluido_em from licitaflow_juridico.dias where dia=$1 and passada=1', [prox.dia])).rows[0].concluido_em, 'última página conclui o dia')
await falha(como('service_role', "select public.pecas_coleta_gravar('x',current_date,1::smallint,1,1,0,'[]')"), 'gravar exige o token')

// Pesquisa.
let r = await buscar()
ok(r.total === 3 && r.data[0].tipo === 'recurso' && r.data[0].processo.orgao === 'Prefeitura Municipal de Gramado', 'pesquisa sem filtro traz todas, mais recentes primeiro, com o processo')
ok(r.porTipo.recurso === 1 && r.porTipo.impugnacao === 1 && r.porTipo['intencao-recurso'] === 1, 'conta por tipo de peça')
ok((await buscar({ busca: 'pneu' })).total === 1, 'palavra-chave acha pelo objeto do processo')
ok((await buscar({ busca: 'automax' })).total === 1, 'palavra-chave acha pela empresa')
ok((await buscar({ busca: 'intencao' })).total === 1, 'palavra-chave acha no texto da intenção, sem acento')
ok((await buscar({ busca: 'pneu;limpeza' })).total === 3, 'termos com ";" valem como qualquer um deles')
ok((await buscar({ tipos: ['impugnacao', 'intencao-recurso'] })).total === 2, 'filtra por tipo de peça')
ok((await buscar({ uf: 'MG' })).total === 2, 'filtra por UF')
ok((await buscar({ orgao: 'camara' })).total === 2 && (await buscar({ orgao: 'gramado' })).total === 1, 'filtra por órgão ou município, sem acento')
ok((await buscar({ novaLei: true })).total === 1, 'somente nova lei deixa de fora o processo da 8.666')
await falha(buscar({ tipos: [] }), 'exige ao menos um tipo')
await falha(buscar({ uf: 'XYZ' }), 'UF inválida é recusada')
await falha(buscar({ busca: '   ;  ' }), 'termo só com separador pede uma palavra-chave')
const st = (await como('authenticated', 'select public.pecas_status() r')).rows[0].r
ok(st.pecas === 3 && st.processos === 2 && st.diasConcluidos === 1 && st.ultimaColeta, 'status mostra a cobertura e a última coleta')
await falha(como('authenticated', 'insert into public.pecas_juridicas(codigo,tipo,titulo) values(1,\'recurso\',\'x\')'), 'cliente não escreve no índice')
await falha(como('authenticated', 'select * from licitaflow_juridico.config'), 'cliente não lê o token')

// Retenção.
await db.query("update public.pecas_processos set sessao=current_date-200 where codigo=2")
await gravar(1, 1, [], (await como('service_role', 'select public.pecas_coleta_proximo($1) r', [token])).rows[0].r)
ok((await db.query('select count(*)::int n from public.pecas_juridicas where codigo=2')).rows[0].n === 0, 'processo fora da janela sai com as peças')
console.log(`\n${asserts} verificações OK`)
