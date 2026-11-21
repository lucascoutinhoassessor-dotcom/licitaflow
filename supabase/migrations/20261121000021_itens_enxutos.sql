-- LicitaFlow · Itens guardados no banco só com o que a busca usa.
-- Medição em 21/11/2026: itens = 76 MB para 7.983 editais (~9,5 KB por edital); com os ~27 mil editais da janela de
-- 30 dias o banco chegaria a ~490 MB (limite do plano: 500 MB). A página do edital já busca os itens completos direto
-- do PNCP; a base fica só com descrição curta (160 caracteres, para a busca), valor unitário, quantidade, unidade,
-- benefício ME/EPP e sigilo. Saem: valor total (calculado), nome do benefício, critério, situação, grupo e lote.
-- O índice (controle, beneficio, valor_unitario) sai: a chave primária (controle, numero) já atende as consultas.

drop index if exists public.oportunidades_itens_valor;
-- Remove a restrição antiga que dependia de valor_total antes de apagar a coluna.
alter table public.oportunidades_itens_indice drop constraint if exists preco_sigiloso_oculto;
alter table public.oportunidades_itens_indice
  drop column if exists valor_total,
  drop column if exists beneficio_nome,
  drop column if exists criterio,
  drop column if exists situacao,
  drop column if exists grupo,
  drop column if exists lote;
alter table public.oportunidades_itens_indice add constraint preco_sigiloso_oculto check (not sigiloso or valor_unitario is null);
update public.oportunidades_itens_indice set descricao=left(descricao,160) where length(descricao)>160;

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
  insert into public.oportunidades_itens_indice(controle,numero,descricao,valor_unitario,beneficio,sigiloso,quantidade,unidade)
  values(p_controle,(i->>'numeroItem')::integer,left(coalesce(i->>'descricao',''),160),
   case when sigilo then null else (i->>'valorUnitarioEstimado')::numeric end,(i->>'tipoBeneficio')::smallint,sigilo,
   (i->>'quantidade')::numeric,left(i->>'unidadeMedida',20));
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
     'valorUnitarioEstimado',i.valor_unitario,'valorTotal',case when i.valor_unitario is not null and i.quantidade is not null then round(i.valor_unitario*i.quantidade,2) end,
     'orcamentoSigiloso',i.sigiloso,'tipoBeneficio',i.beneficio) order by i.numero)
   from public.oportunidades_itens_indice i where i.controle=o.controle),'[]'::jsonb) else null end
 from public.oportunidades_indice o where o.controle=p_controle;
$$;
revoke all on function public.itens_oportunidade_indexados(text) from public,anon;
grant execute on function public.itens_oportunidade_indexados(text) to authenticated;
