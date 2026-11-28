-- LicitaForce · Limite do plano nunca barra o dono da organização nova.
--
-- Com o teste grátis desligado, criar_organizacao cria a conta no plano "cancelado" (limite de 0 usuários),
-- suspensa até a contratação. O gatilho de limite barrava a inserção do próprio dono ("Limite de memberships
-- do plano atingido") e todo cadastro novo ficava sem organização. O primeiro membro sempre entra; os
-- demais continuam limitados pelo plano.
BEGIN;

create or replace function public.validar_limite_plano() returns trigger
language plpgsql security definer set search_path='' as $$
declare plano text; limite integer; quantidade bigint;
begin
  if not exists(select 1 from public.plataforma_politicas where id and aplicar_limites) then return new; end if;
  -- Serializa inserções da mesma organização para evitar ultrapassar o limite em concorrência.
  select o.plano into plano from public.organizations o where o.id=new.org_id for update;
  if tg_table_name='empresas' then
    select p.limite_empresas into limite from public.plataforma_planos p where p.id=plano;
    select count(*) into quantidade from public.empresas where org_id=new.org_id;
  elsif tg_table_name='memberships' then
    select count(*) into quantidade from public.memberships where org_id=new.org_id;
    -- Organização sem ninguém: é o dono entrando (criação da conta), nunca barra.
    if quantidade=0 then return new; end if;
    select p.limite_usuarios into limite from public.plataforma_planos p where p.id=plano;
  elsif tg_table_name='processos' then
    select p.limite_processos into limite from public.plataforma_planos p where p.id=plano;
    select count(*) into quantidade from public.processos where org_id=new.org_id;
  end if;
  if limite is not null and quantidade>=limite then raise exception 'Limite de % do plano atingido. Solicite uma revisão do plano.',tg_table_name; end if;
  return new;
end; $$;

COMMIT;
