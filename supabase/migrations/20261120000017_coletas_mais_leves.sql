-- LicitaFlow · Coletas mais leves para caber na CPU, memória e disco do plano Nano.
-- Em 20/11/2026 o banco ficou sufocado ("job startup timeout", conexões recusadas, login lento) com a coleta de
-- editais a cada 10 s e a de contratos (páginas de 500) a cada 30 s. Foi reiniciado com as duas pausadas.
-- Medição após o reinício: 283 MB; itens = 520 bytes cada, 21,6 por edital; 39.635 editais abertos → os itens
-- de todos chegariam a ~445 MB. Por isso:
--   1. descrição do item guardada com até 240 caracteres (serve à busca; a tela mostra a completa direto do PNCP);
--   2. itens coletados só para editais com abertura nos próximos 30 dias (26.971 hoje);
--   3. editais/itens a cada 20 s e contratos a cada 3 min.

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
  insert into public.oportunidades_itens_indice(controle,numero,descricao,valor_unitario,beneficio,sigiloso,quantidade,unidade,valor_total,beneficio_nome,criterio,situacao,grupo,lote)
  values(p_controle,(i->>'numeroItem')::integer,left(coalesce(i->>'descricao',''),240),
   case when sigilo then null else (i->>'valorUnitarioEstimado')::numeric end,(i->>'tipoBeneficio')::integer,sigilo,
   (i->>'quantidade')::numeric,i->>'unidadeMedida',case when sigilo then null else (i->>'valorTotal')::numeric end,
   i->>'tipoBeneficioNome',i->>'criterioJulgamentoNome',i->>'situacaoCompraItemNome',
   coalesce(i->>'numeroGrupo',i->>'grupo'),coalesce(i->>'numeroLote',i->>'lote'));
 end loop;
 -- Material (M) e/ou serviço (S), somando as páginas já recebidas.
 select coalesce(bool_or(x->>'materialOuServico'='M'),false),coalesce(bool_or(x->>'materialOuServico'='S'),false) into tem_m,tem_s from jsonb_array_elements(p_itens) x;
 update public.oportunidades_indice set busca_itens=licitaflow_coleta.vetor_itens(p_controle),
  tipo_itens=nullif(concat(case when tem_m or position('M' in coalesce(tipo_itens,''))>0 then 'M' end,case when tem_s or position('S' in coalesce(tipo_itens,''))>0 then 'S' end),'')
  where controle=p_controle;
 if p_final then update public.oportunidades_indice set itens_completos=true,quantidade_itens=(select count(*) from public.oportunidades_itens_indice where controle=p_controle) where controle=p_controle;end if;
end;$$;

create or replace function licitaflow_coleta.registrar_compra(c jsonb) returns void
language plpgsql set search_path='' as $$
declare v text:=c->>'numeroControlePNCP';payload jsonb;mudou boolean;versao_recebida timestamptz;versao_atual timestamptz;
begin
 if v is null or length(v)>100 or coalesce(c#>>'{orgaoEntidade,cnpj}','') !~ '^[0-9]{14}$' or c->>'objetoCompra' is null then raise exception 'Identificação inválida na fonte';end if;
 versao_recebida:=licitaflow_coleta.tempo(coalesce(c->>'dataAtualizacaoGlobal',c->>'dataAtualizacao'));
 select fonte_atualizada_em into versao_atual from public.oportunidades_indice where controle=v;
 if versao_atual is not null and (versao_recebida is null or versao_recebida<versao_atual) then return;end if;

 payload:=jsonb_build_object('numeroControlePNCP',v,'numeroCompra',c->'numeroCompra','anoCompra',c->'anoCompra','sequencialCompra',c->'sequencialCompra',
 'objetoCompra',c->'objetoCompra','informacaoComplementar',c->'informacaoComplementar','orgaoEntidade',jsonb_build_object('cnpj',c#>>'{orgaoEntidade,cnpj}','razaoSocial',c#>>'{orgaoEntidade,razaoSocial}'),
 'unidadeOrgao',jsonb_build_object('ufSigla',coalesce(c#>>'{unidadeOrgao,ufSigla}',''),'municipioNome',coalesce(c#>>'{unidadeOrgao,municipioNome}','')),
 'modalidadeId',c->'modalidadeId','modalidadeNome',c->'modalidadeNome','usuarioNome',c->'usuarioNome','linkSistemaOrigem',c->'linkSistemaOrigem','srp',c->'srp',
 'valorTotalEstimado',c->'valorTotalEstimado','dataPublicacaoPncp',c->'dataPublicacaoPncp','dataAberturaProposta',c->'dataAberturaProposta','dataEncerramentoProposta',c->'dataEncerramentoProposta');
 select compra is distinct from payload or fonte_atualizada_em is distinct from licitaflow_coleta.tempo(coalesce(c->>'dataAtualizacaoGlobal',c->>'dataAtualizacao')) into mudou from public.oportunidades_indice where controle=v;
 insert into public.oportunidades_indice(controle,objeto,complemento,orgao_cnpj,orgao_nome,uf,modalidade,portal_id,publicacao,encerramento,situacao,valor,srp,compra,fonte_atualizada_em,modo_disputa)
 values(v,c->>'objetoCompra',coalesce(c->>'informacaoComplementar',''),c#>>'{orgaoEntidade,cnpj}',coalesce(c#>>'{orgaoEntidade,razaoSocial}',''),coalesce(c#>>'{unidadeOrgao,ufSigla}',''),(c->>'modalidadeId')::integer,licitaflow_coleta.portal(c),
 licitaflow_coleta.tempo(c->>'dataPublicacaoPncp'),licitaflow_coleta.tempo(c->>'dataEncerramentoProposta'),(c->>'situacaoCompraId')::integer,(c->>'valorTotalEstimado')::numeric,(c->>'srp')::boolean,payload,licitaflow_coleta.tempo(coalesce(c->>'dataAtualizacaoGlobal',c->>'dataAtualizacao')),licitaflow_coleta.modo_disputa(c))
 on conflict(controle) do update set objeto=excluded.objeto,complemento=excluded.complemento,orgao_nome=excluded.orgao_nome,uf=excluded.uf,modalidade=excluded.modalidade,portal_id=excluded.portal_id,
 publicacao=excluded.publicacao,encerramento=excluded.encerramento,situacao=excluded.situacao,valor=excluded.valor,srp=excluded.srp,compra=excluded.compra,fonte_atualizada_em=excluded.fonte_atualizada_em,coletado_em=now(),modo_disputa=coalesce(excluded.modo_disputa,oportunidades_indice.modo_disputa),
 itens_completos=case when oportunidades_indice.compra is distinct from excluded.compra or oportunidades_indice.fonte_atualizada_em is distinct from excluded.fonte_atualizada_em then false else oportunidades_indice.itens_completos end,
 quantidade_itens=case when oportunidades_indice.compra is distinct from excluded.compra or oportunidades_indice.fonte_atualizada_em is distinct from excluded.fonte_atualizada_em then null else oportunidades_indice.quantidade_itens end;
 if mudou then
  delete from public.oportunidades_itens_indice where controle=v;
  update public.oportunidades_indice set busca_itens=null where controle=v;
 end if;
 -- Itens só são coletados em segundo plano para editais com abertura nos próximos 30 dias (espaço e CPU).
 -- Os mais distantes entram na fila na varredura diária, quando a data se aproximar.
 if not exists(select 1 from public.oportunidades_indice where controle=v and (itens_completos or encerramento < now() or encerramento >= now()+interval '30 days')) then
  insert into licitaflow_coleta.jobs(tipo,ciclo,controle) values('itens',v||'/'||md5(payload::text||coalesce(extract(epoch from licitaflow_coleta.tempo(coalesce(c->>'dataAtualizacaoGlobal',c->>'dataAtualizacao')))::text,'')),v) on conflict do nothing;
 end if;
end;$$;

create or replace function licitaflow_coleta.limpar_catalogo() returns jsonb
language plpgsql set search_path='' as $$
declare itens_removidos bigint;jobs_removidos bigint;jobs_adiados bigint;
begin
 with alvo as (
  select controle from public.oportunidades_indice
   where encerramento < now() - interval '2 days'
     and (itens_completos or busca_itens is not null or exists(select 1 from public.oportunidades_itens_indice i where i.controle=oportunidades_indice.controle))
   limit 5000
 ), apagados as (
  delete from public.oportunidades_itens_indice i using alvo where i.controle=alvo.controle returning 1
 ), marcados as (
  update public.oportunidades_indice o set itens_completos=false,quantidade_itens=null,busca_itens=null from alvo where o.controle=alvo.controle returning 1
 )
 select (select count(*) from apagados) into itens_removidos;
 delete from licitaflow_coleta.jobs where concluido and ciclo<>'base-inicial' and coalesce(concluida_em,criado_em)<now()-interval '1 day';
 get diagnostics jobs_removidos = row_count;
 -- Fila de itens só com editais que abrem nos próximos 30 dias (pedidos do usuário, "urgente", continuam).
 delete from licitaflow_coleta.jobs j using public.oportunidades_indice o
  where j.tipo='itens' and not j.concluido and not j.urgente and j.request_id is null and j.pagina=1
    and o.controle=j.controle and o.encerramento >= now()+interval '30 days';
 get diagnostics jobs_adiados = row_count;
 return jsonb_build_object('itens_removidos',itens_removidos,'jobs_removidos',jobs_removidos,'jobs_adiados',jobs_adiados);
end;$$;
revoke all on function licitaflow_coleta.limpar_catalogo() from public,anon,authenticated;

-- Ajustes imediatos.
delete from licitaflow_coleta.jobs j using public.oportunidades_indice o
 where j.tipo='itens' and not j.concluido and not j.urgente and j.request_id is null and j.pagina=1
   and o.controle=j.controle and o.encerramento >= now()+interval '30 days';
update public.oportunidades_itens_indice set descricao=left(descricao,240) where length(descricao)>240;

do $$
begin
 if to_regclass('cron.job') is not null then
  perform cron.alter_job(jobid, schedule := '20 seconds', active := true) from cron.job where jobname = 'licitaflow-coleta-oportunidades';
  perform cron.alter_job(jobid, schedule := '*/3 * * * *', active := true) from cron.job where jobname = 'licitaflow-coleta-contratos';
 end if;
end;$$;
