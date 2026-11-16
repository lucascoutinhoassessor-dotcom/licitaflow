BEGIN;
create table public.plataforma_planos (
  id text primary key check(id ~ '^[a-z0-9_]{3,40}$'),
  nome text not null check(length(trim(nome)) between 3 and 80),
  mensal_centavos integer not null check(mensal_centavos between 0 and 100000000),
  anual_centavos integer not null check(anual_centavos between 0 and 1000000000),
  limite_empresas integer check(limite_empresas>=0),
  limite_usuarios integer check(limite_usuarios>=0),
  limite_processos integer check(limite_processos>=0),
  ativo boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.plataforma_planos(id,nome,mensal_centavos,anual_centavos,limite_empresas,limite_usuarios,limite_processos,ativo) values
('trial','Teste grátis',0,0,1,3,100,false),
('cancelado','Cancelado',0,0,0,0,0,false),
('essencial','Essencial',19700,196800,1,3,100,true),
('profissional','Profissional',39700,397200,1,10,500,true),
('assessoria','Assessoria',79700,796800,15,null,null,true);
alter table public.plataforma_planos enable row level security;
create policy planos_select on public.plataforma_planos for select to anon,authenticated using(ativo or public.is_platform_admin());
grant select on public.plataforma_planos to anon,authenticated;
alter table public.organizations drop constraint if exists organizations_plano_check;
alter table public.organizations add constraint organizations_plano_fk foreign key(plano) references public.plataforma_planos(id);
create trigger planos_audit after insert or update on public.plataforma_planos for each row execute function public.auditar_administracao();

create table public.plataforma_politicas (
  id boolean primary key default true check(id),
  aplicar_limites boolean not null default false
);
insert into public.plataforma_politicas(id) values(true);
alter table public.plataforma_politicas enable row level security;
create policy politicas_select on public.plataforma_politicas for select to authenticated using(public.is_platform_admin());
grant select on public.plataforma_politicas to authenticated;
create trigger politicas_audit after update on public.plataforma_politicas for each row execute function public.auditar_administracao();

create function public.admin_salvar_plano(p_id text,p_nome text,p_mensal integer,p_anual integer,p_empresas integer,p_usuarios integer,p_processos integer,p_ativo boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.exigir_admin();
  insert into public.plataforma_planos(id,nome,mensal_centavos,anual_centavos,limite_empresas,limite_usuarios,limite_processos,ativo)
    values(p_id,trim(p_nome),p_mensal,p_anual,p_empresas,p_usuarios,p_processos,case when p_id in ('trial','cancelado') then false else p_ativo end)
  on conflict(id) do update set nome=excluded.nome,mensal_centavos=excluded.mensal_centavos,anual_centavos=excluded.anual_centavos,
    limite_empresas=excluded.limite_empresas,limite_usuarios=excluded.limite_usuarios,limite_processos=excluded.limite_processos,ativo=excluded.ativo,updated_at=now();
end; $$;
create function public.admin_aplicar_limites(p_aplicar boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform public.exigir_admin();
  update public.plataforma_politicas set aplicar_limites=p_aplicar where id;
end; $$;

create function public.validar_limite_plano() returns trigger
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
    select p.limite_usuarios into limite from public.plataforma_planos p where p.id=plano;
    select count(*) into quantidade from public.memberships where org_id=new.org_id;
  elsif tg_table_name='processos' then
    select p.limite_processos into limite from public.plataforma_planos p where p.id=plano;
    select count(*) into quantidade from public.processos where org_id=new.org_id;
  end if;
  if limite is not null and quantidade>=limite then raise exception 'Limite de % do plano atingido. Solicite uma revisão do plano.',tg_table_name; end if;
  return new;
end; $$;
create trigger empresas_limite before insert on public.empresas for each row execute function public.validar_limite_plano();
create trigger membros_limite before insert on public.memberships for each row execute function public.validar_limite_plano();
create trigger processos_limite before insert on public.processos for each row execute function public.validar_limite_plano();

create function public.plano_cliente(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare resultado jsonb;
begin
  if not public.is_member(p_org) then raise exception 'Acesso negado'; end if;
  select jsonb_build_object('plano',to_jsonb(p),'aplicar_limites',(select aplicar_limites from public.plataforma_politicas where id),
    'empresas',(select count(*) from public.empresas where org_id=p_org),
    'usuarios',(select count(*) from public.memberships where org_id=p_org),
    'processos',(select count(*) from public.processos where org_id=p_org)) into resultado
  from public.organizations o join public.plataforma_planos p on p.id=o.plano where o.id=p_org;
  return resultado;
end; $$;
revoke execute on function public.admin_salvar_plano(text,text,integer,integer,integer,integer,integer,boolean) from public,anon;
revoke execute on function public.admin_aplicar_limites(boolean) from public,anon;
revoke execute on function public.plano_cliente(uuid) from public,anon;
grant execute on function public.admin_salvar_plano(text,text,integer,integer,integer,integer,integer,boolean) to authenticated;
grant execute on function public.admin_aplicar_limites(boolean) to authenticated;
grant execute on function public.plano_cliente(uuid) to authenticated;

create or replace function public.admin_resumo()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_admin();
  return jsonb_build_object(
    'organizacoes', (select count(*) from public.organizations),
    'usuarios', (select count(*) from auth.users),
    'usuarios_confirmados', (select count(*) from auth.users where email_confirmed_at is not null),
    'empresas', (select count(*) from public.empresas),
    'processos', (select count(*) from public.processos),
    'documentos', (select count(*) from public.documentos),
    'contratos', (select count(*) from public.contratos),
    'suspensas', (select count(*) from public.organizations where suspensa),
    'trials_ativos', (select count(*) from public.organizations where plano = 'trial' and trial_ate >= current_date and not suspensa),
    'trials_vencendo', (select count(*) from public.organizations where plano = 'trial' and trial_ate between current_date and current_date + 3),
    'trials_vencidos', (select count(*) from public.organizations where plano = 'trial' and trial_ate < current_date),
    'pagantes', (select count(*) from public.organizations where plano in (select id from public.plataforma_planos where mensal_centavos>0) and not suspensa),
    'ativos_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'por_plano', (select coalesce(jsonb_object_agg(plano, n), '{}'::jsonb) from (select plano, count(*) n from public.organizations group by plano) x),
    'cadastros_30d', (
      select coalesce(jsonb_agg(jsonb_build_object('dia', d::date, 'n', coalesce(c.n, 0)) order by d), '[]'::jsonb)
      from generate_series(current_date - 29, current_date, interval '1 day') d
      left join (select created_at::date dia, count(*) n from auth.users group by 1) c on c.dia = d::date
    )
  );
end;
$$;


COMMIT;
