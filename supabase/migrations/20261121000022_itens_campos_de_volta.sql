-- LicitaFlow · Volta critério de julgamento, situação, grupo, lote e valor total dos itens guardados.
-- A migration 21 tirou esses campos para economizar espaço, mas eles são importantes para o usuário. Voltam em
-- formato compacto: critério e situação como código (2 bytes; o nome é montado na leitura), grupo e lote com até
-- 12 caracteres e o valor total do jeito que o órgão publicou. Custo estimado: ~20 bytes por item (~12 MB com a
-- janela de 30 dias completa). A descrição continua com 160 caracteres, que é onde estava a economia maior.

alter table public.oportunidades_itens_indice
  add column if not exists valor_total numeric,
  add column if not exists criterio smallint,
  add column if not exists situacao smallint,
  add column if not exists grupo text,
  add column if not exists lote text;
alter table public.oportunidades_itens_indice drop constraint if exists preco_sigiloso_oculto;
alter table public.oportunidades_itens_indice add constraint preco_sigiloso_oculto
  check (not sigiloso or (valor_unitario is null and valor_total is null));

-- Código PNCP do critério ou da situação do item; se vier só o nome, converte pelo nome.
create or replace function licitaflow_coleta.codigo_item(p_id text,p_nome text,p_tipo text) returns smallint
language sql immutable set search_path='' as $$
 select coalesce(case when p_id ~ '^[0-9]{1,4}$' then p_id::smallint end,
  case p_tipo
   when 'criterio' then case lower(coalesce(p_nome,''))
    when 'menor preço' then 1 when 'maior desconto' then 2 when 'técnica e preço' then 4 when 'maior lance' then 5
    when 'maior retorno econômico' then 6 when 'não se aplica' then 7 when 'melhor técnica' then 8 when 'conteúdo artístico' then 9 end
   when 'situacao' then case lower(coalesce(p_nome,''))
    when 'em andamento' then 1 when 'homologado' then 2 when 'anulado/revogado/cancelado' then 3 when 'deserto' then 4 when 'fracassado' then 5 end
  end);
$$;

-- Nomes oficiais do PNCP (manual de integração) para mostrar na tela.
create or replace function public.oportunidades_nome_item(p_tipo text,p_codigo integer) returns text
language sql immutable set search_path='' as $$
 select case p_tipo
  when 'criterio' then case p_codigo when 1 then 'Menor preço' when 2 then 'Maior desconto' when 4 then 'Técnica e preço'
   when 5 then 'Maior lance' when 6 then 'Maior retorno econômico' when 7 then 'Não se aplica' when 8 then 'Melhor técnica'
   when 9 then 'Conteúdo artístico' end
  when 'situacao' then case p_codigo when 1 then 'Em andamento' when 2 then 'Homologado' when 3 then 'Anulado/Revogado/Cancelado'
   when 4 then 'Deserto' when 5 then 'Fracassado' end
  when 'beneficio' then case p_codigo when 1 then 'Participação exclusiva para ME/EPP' when 2 then 'Subcontratação para ME/EPP'
   when 3 then 'Cota reservada para ME/EPP' when 4 then 'Sem benefício' when 5 then 'Não se aplica' end
 end;
$$;

create or replace function licitaflow_coleta.registrar_itens(p_controle text,p_itens jsonb,p_pagina integer,p_final boolean) returns void
language plpgsql set search_path='' as $$
declare i jsonb;sigilo boolean;tem_m boolean;tem_s boolean;
begin
 if jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens)>500 then raise exception 'Página de itens inválida';end if;
 if p_pagina=1 then
  update public.oportunidades_indice set itens_completos=false,quantidade_itens=null,busca_itens=null,tipo_itens=null where controle=p_controle;
  delete from public.oportunidades_itens_indice where controle=p_controle;
 end if;
 for i in select value from jsonb_array_elements(p_itens) loop
  sigilo:=coalesce((i->>'orcamentoSigiloso')::boolean,false);
  if (i->>'numeroItem')::integer is null then raise exception 'Item sem identificação';end if;
  if p_pagina>1 and exists(select 1 from public.oportunidades_itens_indice where controle=p_controle and numero=(i->>'numeroItem')::integer) then raise exception 'A fonte repetiu a página de itens';end if;
  insert into public.oportunidades_itens_indice(controle,numero,descricao,valor_unitario,beneficio,sigiloso,quantidade,unidade,valor_total,criterio,situacao,grupo,lote)
  values(p_controle,(i->>'numeroItem')::integer,left(coalesce(i->>'descricao',''),160),
   case when sigilo then null else (i->>'valorUnitarioEstimado')::numeric end,(i->>'tipoBeneficio')::smallint,sigilo,
   (i->>'quantidade')::numeric,left(i->>'unidadeMedida',20),case when sigilo then null else (i->>'valorTotal')::numeric end,
   licitaflow_coleta.codigo_item(i->>'criterioJulgamentoId',i->>'criterioJulgamentoNome','criterio'),
   licitaflow_coleta.codigo_item(i->>'situacaoCompraItem',i->>'situacaoCompraItemNome','situacao'),
   left(nullif(coalesce(i->>'numeroGrupo',i->>'grupo'),''),12),left(nullif(coalesce(i->>'numeroLote',i->>'lote'),''),12));
 end loop;
 -- Material (M) e/ou serviço (S), somando as páginas já recebidas.
 select coalesce(bool_or(x->>'materialOuServico'='M'),false),coalesce(bool_or(x->>'materialOuServico'='S'),false) into tem_m,tem_s from jsonb_array_elements(p_itens) x;
 update public.oportunidades_indice set busca_itens=licitaflow_coleta.vetor_itens(p_controle),
  tipo_itens=nullif(concat(case when tem_m or position('M' in coalesce(tipo_itens,''))>0 then 'M' end,case when tem_s or position('S' in coalesce(tipo_itens,''))>0 then 'S' end),'')
  where controle=p_controle;
 if p_final then update public.oportunidades_indice set itens_completos=true,quantidade_itens=(select count(*) from public.oportunidades_itens_indice where controle=p_controle) where controle=p_controle;end if;
end;$$;

create or replace function public.itens_oportunidade_indexados(p_controle text) returns jsonb
language sql stable security invoker set search_path='' as $$
 select case when o.itens_completos then coalesce((
   select jsonb_agg(jsonb_build_object(
     'numeroItem',i.numero,'descricao',i.descricao,'quantidade',i.quantidade,'unidadeMedida',i.unidade,
     'valorUnitarioEstimado',i.valor_unitario,
     'valorTotal',coalesce(i.valor_total,case when i.valor_unitario is not null and i.quantidade is not null then round(i.valor_unitario*i.quantidade,2) end),
     'orcamentoSigiloso',i.sigiloso,'tipoBeneficio',i.beneficio,'tipoBeneficioNome',public.oportunidades_nome_item('beneficio',i.beneficio),
     'criterioJulgamentoId',i.criterio,'criterioJulgamentoNome',public.oportunidades_nome_item('criterio',i.criterio),
     'situacaoCompraItem',i.situacao,'situacaoCompraItemNome',public.oportunidades_nome_item('situacao',i.situacao),
     'numeroGrupo',i.grupo,'numeroLote',i.lote) order by i.numero)
   from public.oportunidades_itens_indice i where i.controle=o.controle),'[]'::jsonb) else null end
 from public.oportunidades_indice o where o.controle=p_controle;
$$;
revoke all on function public.itens_oportunidade_indexados(text) from public,anon;
grant execute on function public.itens_oportunidade_indexados(text) to authenticated;

-- Os itens guardados antes desta correção perderam esses campos: recoleta os editais ainda abertos.
insert into licitaflow_coleta.jobs(tipo,ciclo,controle,proxima_em)
select 'itens',o.controle||'/recoleta-20261121',o.controle,now()
 from public.oportunidades_indice o
 where o.itens_completos and o.encerramento>=now() and o.encerramento<now()+interval '30 days'
   and not exists(select 1 from licitaflow_coleta.jobs v where v.tipo='itens' and v.controle=o.controle and not v.concluido)
on conflict do nothing;
