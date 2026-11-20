// Ensaia o roteiro de produção supabase/deploy/20261119_enxugar_catalogo_producao.sql (caminho realmente usado:
// apagar os itens, recriar a tabela compacta vazia e recoletar) sobre o esquema anterior, com pg_cron simulado.
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
create function cron.alter_job(job_id bigint, active boolean) returns void language sql as $$update cron.job set active=alter_job.active where jobid=job_id$$;
select cron.schedule('licitaflow-coleta-oportunidades','10 seconds','select licitaflow_coleta.tick()');`)
for (const f of ['20261117035403_indice_oportunidades.sql', '20261117035735_coleta_oportunidades.sql']) await db.exec(readFileSync('supabase/migrations/' + f, 'utf8'))

// Dados no formato antigo: um edital aberto com 2 itens e um encerrado com 1 item.
const compra = (id, enc) => ({ numeroControlePNCP: id, numeroCompra: '1', anoCompra: 2026, sequencialCompra: 1, objetoCompra: 'Aquisição de equipamentos', orgaoEntidade: { cnpj: '12345678000190', razaoSocial: 'Prefeitura' }, unidadeOrgao: { ufSigla: 'SP', municipioNome: 'São Paulo' }, modalidadeId: 6, modalidadeNome: 'Pregão eletrônico', dataPublicacaoPncp: '2026-11-16T12:00:00', dataEncerramentoProposta: enc, srp: false, valorTotalEstimado: 1000, dataAtualizacaoGlobal: '2026-11-17T10:00:00' })
const aberto = compra('12345678000190-1-000001/2026', '2099-12-31T10:00:00')
const fechado = compra('12345678000190-1-000002/2026', '2020-01-01T10:00:00')
for (const c of [aberto, fechado]) await db.query('select licitaflow_coleta.registrar_compra($1::jsonb)', [JSON.stringify(c)])
await db.query('select licitaflow_coleta.registrar_itens($1,$2::jsonb,1,true)', [aberto.numeroControlePNCP, JSON.stringify([
  { numeroItem: 1, descricao: 'Notebook i5 16GB', quantidade: 20, unidadeMedida: 'UN', valorUnitarioEstimado: 4000, valorTotal: 80000, tipoBeneficio: 4, tipoBeneficioNome: 'Sem benefício', numeroLote: '1' },
  { numeroItem: 2, descricao: 'Mouse óptico', quantidade: 20, orcamentoSigiloso: true, valorUnitarioEstimado: 30, valorTotal: 600 },
])])
await db.query('select licitaflow_coleta.registrar_itens($1,$2::jsonb,1,true)', [fechado.numeroControlePNCP, JSON.stringify([{ numeroItem: 1, descricao: 'Cadeira', quantidade: 2 }])])
ok((await db.query('select count(*)::int n from public.oportunidades_itens_indice')).rows[0].n === 3, 'base antiga preparada com 3 itens')

// ETAPA 1: roteiro de produção.

// Roteiro de produção: blocos 1-4, 6 e 7 vêm do arquivo; o bloco 5 são as funções da migration canônica.
const migracao = readFileSync('supabase/migrations/20261119000010_enxugar_catalogo.sql', 'utf8')
const deploy = readFileSync('supabase/deploy/20261119_enxugar_catalogo_producao.sql', 'utf8')
const [antes5, depois5] = deploy.split('-- ============ BLOCO 5')
await db.exec(antes5)
ok((await db.query("select active from cron.job where jobname='licitaflow-coleta-oportunidades'")).rows[0].active === false, 'coletor pausado durante a troca da tabela')
const vetor = migracao.slice(migracao.indexOf('create function licitaflow_coleta.vetor_itens'), migracao.indexOf('-- ============ 2.'))
await db.exec(vetor + migracao.slice(migracao.indexOf('create or replace function licitaflow_coleta.registrar_itens')))
await db.exec('-- ' + depois5)
ok((await db.query("select active from cron.job where jobname='licitaflow-coleta-oportunidades'")).rows[0].active === true, 'coletor religado no fim')
ok((await db.query("select count(*)::int n from cron.job where jobname='licitaflow-limpeza-catalogo'")).rows[0].n === 1, 'limpeza horária agendada')
ok(!(await db.query("select 1 from information_schema.columns where table_name='oportunidades_itens_indice' and column_name='item'")).rows.length, 'coluna JSON duplicada removida')
ok((await db.query('select count(*)::int n from public.oportunidades_itens_indice')).rows[0].n === 0, 'tabela de itens recriada vazia')
ok((await db.query('select count(*)::int n from public.oportunidades_indice where itens_completos or busca_itens is not null')).rows[0].n === 0, 'editais deixam de anunciar itens até a recoleta')
const fila = (await db.query("select controle from licitaflow_coleta.jobs where tipo='itens' and ciclo like '%/recoleta-20261119'")).rows.map(r => r.controle)
ok(fila.length === 1 && fila[0] === aberto.numeroControlePNCP, 'recoleta enfileirada só para o edital aberto')

const uid = '11111111-1111-1111-1111-111111111111'
const como = async (sql, p = []) => { await db.exec(`set role authenticated;select set_config('request.jwt.sub','${uid}',false)`); try { return await db.query(sql, p) } finally { await db.exec('reset role') } }
ok((await como('select public.itens_oportunidade_indexados($1) r', [aberto.numeroControlePNCP])).rows[0].r === null, 'tela mostra itens como pendentes até a recoleta')
const busca = async (termo) => (await como('select public.buscar_oportunidades($1::jsonb,1,20) r', [JSON.stringify({ situacao: 'abertas', busca: termo })])).rows[0].r
ok((await busca('equipamentos')).totalRegistros === 1, 'busca pelo objeto continua funcionando')

// Coletor depois da troca grava no formato novo.
await db.query('select licitaflow_coleta.registrar_itens($1,$2::jsonb,1,true)', [aberto.numeroControlePNCP, JSON.stringify([
  { numeroItem: 1, descricao: 'Impressora laser', quantidade: 3, unidadeMedida: 'UN', numeroLote: '1' },
  { numeroItem: 2, descricao: 'Mouse óptico', quantidade: 20, orcamentoSigiloso: true, valorUnitarioEstimado: 30, valorTotal: 600 },
])])
const itens = (await como('select public.itens_oportunidade_indexados($1) r', [aberto.numeroControlePNCP])).rows[0].r
ok(itens.length === 2 && itens[0].descricao === 'Impressora laser' && Number(itens[0].quantidade) === 3 && itens[0].unidadeMedida === 'UN' && itens[0].numeroLote === '1', 'itens voltam no mesmo formato da tela')
ok(itens[1].valorUnitarioEstimado === null && itens[1].valorTotal === null && itens[1].orcamentoSigiloso === true, 'sigilo preservado')
ok((await busca('impressora')).totalRegistros === 1 && (await busca('mouse')).totalRegistros === 1, 'nova coleta alimenta o vetor de busca do edital')
console.log('Ensaio do roteiro de produção aprovado:', n)
await db.close()
