-- LicitaFlow · E-mails de conta enviados pelo próprio servidor (padrão CallBot AI):
-- confirmação de cadastro e "esqueci minha senha" saem pelo SMTP da plataforma, com a marca LicitaFlow,
-- em vez do e-mail padrão do Supabase. Esta tabela limita os pedidos para o formulário público não virar spam.
BEGIN;

create table public.email_pedidos (
  id bigint generated always as identity primary key,
  chave text not null check (length(chave) between 3 and 300),
  criado_em timestamptz not null default now()
);
create index email_pedidos_chave on public.email_pedidos(chave, criado_em desc);
alter table public.email_pedidos enable row level security;
-- Sem políticas: só o servidor (service_role) usa.
grant select, insert, delete on public.email_pedidos to service_role;

-- Registra um pedido se ainda couber no limite da janela. true = pode enviar.
create function public.registrar_pedido_email(p_chave text, p_limite integer, p_minutos integer) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_chave is null or length(p_chave) not between 3 and 300 or p_limite not between 1 and 100 or p_minutos not between 1 and 1440 then
    raise exception 'Parâmetros inválidos';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_chave));
  delete from public.email_pedidos where criado_em < now() - interval '2 days';
  if (select count(*) from public.email_pedidos where chave = p_chave and criado_em > now() - make_interval(mins => p_minutos)) >= p_limite then
    return false;
  end if;
  insert into public.email_pedidos(chave) values (p_chave);
  return true;
end; $$;

-- O e-mail fica "configurado" assim que tem conta e senha (sem botão separado de ativar).
update public.plataforma_email set remetente_email = coalesce(remetente_email, usuario),
  ativo = (host is not null and usuario is not null and senha_cifrada is not null)
  where id = 'smtp';

revoke execute on function public.registrar_pedido_email(text, integer, integer) from public, anon, authenticated;
grant execute on function public.registrar_pedido_email(text, integer, integer) to service_role;

COMMIT;
