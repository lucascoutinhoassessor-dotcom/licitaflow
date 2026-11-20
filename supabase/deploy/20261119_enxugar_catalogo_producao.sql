-- Aplicação em PRODUÇÃO da migration 20261119000010_enxugar_catalogo.sql — CAMINHO REALMENTE USADO em 19/11/2026.
--
-- Histórico: a primeira tentativa (copiar a tabela de itens para uma versão compacta dentro de uma
-- função disparada pelo pg_cron) falhou com "No space left on device": o disco do plano gratuito
-- não comportava as duas cópias da tabela (943 MB + cópia). O que funcionou foi APAGAR a tabela de
-- itens, recriá-la compacta e vazia, e recoletar do PNCP os itens dos editais ainda abertos.
-- Resultado: banco de 1,09 GB para 204 MB; 24.917 editais abertos enfileirados (~17 h de recoleta).
--
-- Rodar no SQL Editor, UM BLOCO POR VEZ (o editor encerra comandos com mais de ~3 minutos).
-- Cada bloco é curto: nenhum copia dados grandes.

-- ============ BLOCO 1: pausar o coletor ============
select cron.alter_job(jobid, active := false) from cron.job where jobname = 'licitaflow-coleta-oportunidades';

-- ============ BLOCO 2: apagar os itens antigos e recriar a tabela compacta vazia ============
set statement_timeout = '3min';
drop table public.oportunidades_itens_indice;
create table public.oportunidades_itens_indice (
  controle text not null references public.oportunidades_indice(controle) on delete cascade,
  numero integer not null,
  descricao text not null default '',
  valor_unitario numeric,
  beneficio integer,
  sigiloso boolean not null default false,
  quantidade numeric,
  unidade text,
  valor_total numeric,
  beneficio_nome text,
  criterio text,
  situacao text,
  grupo text,
  lote text,
  primary key (controle, numero),
  constraint preco_sigiloso_oculto check (not sigiloso or (valor_unitario is null and valor_total is null))
);
create index oportunidades_itens_valor on public.oportunidades_itens_indice(controle, beneficio, valor_unitario) where not sigiloso;
alter table public.oportunidades_itens_indice enable row level security;
create policy oportunidades_itens_ler on public.oportunidades_itens_indice for select to authenticated using(
 (select auth.uid()) is not null and exists(select 1 from public.oportunidades_indice o where o.controle=oportunidades_itens_indice.controle and o.itens_completos));
revoke all on public.oportunidades_itens_indice from public, anon, authenticated;
grant select on public.oportunidades_itens_indice to authenticated;

-- ============ BLOCO 3: vetor de busca dos itens no edital (vazio até a recoleta) ============
alter table public.oportunidades_indice add column if not exists busca_itens tsvector;
update public.oportunidades_indice set itens_completos = false, quantidade_itens = null, busca_itens = null
 where itens_completos or quantidade_itens is not null or busca_itens is not null;
create index if not exists oportunidades_busca_itens_gin on public.oportunidades_indice using gin(busca_itens);

-- ============ BLOCO 4: leitura dos itens no formato da tela (colunas novas) ============
create or replace function public.itens_oportunidade_indexados(p_controle text) returns jsonb
language sql stable security invoker set search_path='' as $$
 select case when o.itens_completos then coalesce((
   select jsonb_agg(jsonb_build_object(
     'numeroItem',i.numero,'descricao',i.descricao,'quantidade',i.quantidade,'unidadeMedida',i.unidade,
     'valorUnitarioEstimado',i.valor_unitario,'valorTotal',i.valor_total,'orcamentoSigiloso',i.sigiloso,
     'tipoBeneficio',i.beneficio,'tipoBeneficioNome',i.beneficio_nome,'criterioJulgamentoNome',i.criterio,
     'situacaoCompraItemNome',i.situacao,'numeroGrupo',i.grupo,'numeroLote',i.lote) order by i.numero)
   from public.oportunidades_itens_indice i where i.controle=o.controle),'[]'::jsonb) else null end
 from public.oportunidades_indice o where o.controle=p_controle;
$$;
revoke all on function public.itens_oportunidade_indexados(text) from public,anon;
grant execute on function public.itens_oportunidade_indexados(text) to authenticated;

-- ============ BLOCO 5: funções do coletor, busca e limpeza ============
-- Executar as seções 3 e 4 da migration 20261119000010_enxugar_catalogo.sql (de
-- "create or replace function licitaflow_coleta.registrar_itens" até o fim do arquivo),
-- mais a função licitaflow_coleta.vetor_itens da seção 1. São só definições de função: rápido.

-- ============ BLOCO 6: enfileirar a recoleta dos itens dos editais abertos ============
insert into licitaflow_coleta.jobs(tipo, ciclo, controle)
select 'itens', controle || '/recoleta-20261119', controle
  from public.oportunidades_indice
 where encerramento >= now()
on conflict do nothing;

-- ============ BLOCO 7: religar o coletor ============
select cron.alter_job(jobid, active := true) from cron.job where jobname = 'licitaflow-coleta-oportunidades';

-- ============ BLOCO 8 (sozinho, fora de transação): compactar ============
-- vacuum full public.oportunidades_indice;

-- ============ Acompanhamento ============
-- select pg_size_pretty(pg_database_size(current_database()));
-- select count(*) filter (where concluido) feitos, count(*) filter (where not concluido) faltam
--   from licitaflow_coleta.jobs where tipo = 'itens' and ciclo like '%/recoleta-20261119';
--
-- Atenção: o coletor só aceita a resposta de itens quando o ciclo do job é igual à "versão" atual do
-- edital (controle||'/'||md5(...)). Jobs com ciclo '/recoleta-20261119' NÃO batem com essa versão e
-- seriam concluídos sem gravar nada — ver a correção na migration 20261119000011.
