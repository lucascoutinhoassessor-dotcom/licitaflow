-- LicitaFlow · Empresas que nunca aparecem na análise de empresas.
-- A lista também existe no servidor (server/bloqueio.js), que esconde as mesmas empresas em preços,
-- mercado, compras e atas. Para bloquear outra: inserir o CNPJ (só dígitos) aqui e lá.

create table licitaflow_coleta.empresas_bloqueadas (
  cnpj text primary key check (cnpj ~ '^[0-9]{14}$'),
  criado_em timestamptz not null default now()
);
alter table licitaflow_coleta.empresas_bloqueadas enable row level security;
revoke all on licitaflow_coleta.empresas_bloqueadas from public, anon, authenticated;

insert into licitaflow_coleta.empresas_bloqueadas(cnpj) values ('34477874000156') on conflict do nothing;

-- O coletor de contratos nunca grava a empresa bloqueada no resumo (o insert da linha é descartado,
-- inclusive o "on conflict do update" do registrar_contratos).
create function licitaflow_coleta.descartar_bloqueada() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists (select 1 from licitaflow_coleta.empresas_bloqueadas b where b.cnpj = new.cnpj) then return null; end if;
 return new;
end;$$;
revoke all on function licitaflow_coleta.descartar_bloqueada() from public, anon, authenticated;

create trigger fornecedores_sem_bloqueadas before insert or update on public.fornecedores_resumo
  for each row execute function licitaflow_coleta.descartar_bloqueada();

delete from public.fornecedores_resumo f using licitaflow_coleta.empresas_bloqueadas b where f.cnpj = b.cnpj;
