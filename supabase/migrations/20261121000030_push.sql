-- Notificações push (Web Push) no celular/navegador dos clientes.
-- Cada aparelho que tocar em "Ativar notificações" grava aqui sua inscrição. O envio é feito por
-- api/push.js com a chave de serviço, logo depois que o master publica um aviso.

create table public.push_inscricoes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint   text not null unique check (endpoint like 'https://%' and length(endpoint) <= 1000),
  p256dh     text not null check (length(p256dh) <= 200),
  auth       text not null check (length(auth) <= 100),
  aparelho   text check (length(aparelho) <= 300),
  created_at timestamptz not null default now()
);
create index push_inscricoes_user_idx on public.push_inscricoes(user_id);
alter table public.push_inscricoes enable row level security;
create policy push_sel on public.push_inscricoes for select to authenticated using (user_id = auth.uid());
create policy push_ins on public.push_inscricoes for insert to authenticated with check (user_id = auth.uid());
create policy push_del on public.push_inscricoes for delete to authenticated using (user_id = auth.uid());
grant select, insert, delete on public.push_inscricoes to authenticated;

-- Par de chaves VAPID, criado uma única vez pelo servidor. Só a chave de serviço lê (sem grant para clientes).
create table public.push_vapid (
  id          boolean primary key default true check (id),
  publica     text not null,
  privada     text not null,
  created_at  timestamptz not null default now()
);
alter table public.push_vapid enable row level security;
revoke all on public.push_vapid from anon, authenticated;

-- Momento do envio do push de cada aviso, para não mandar duas vezes.
alter table public.plataforma_avisos add column if not exists push_enviado_em timestamptz;

-- O master pode excluir um aviso de vez (some do painel dos clientes e do histórico).
create function public.admin_excluir_aviso(p_aviso uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform public.exigir_admin();
  delete from public.plataforma_avisos where id=p_aviso;
  if not found then raise exception 'Aviso não encontrado'; end if;
end; $$;
revoke execute on function public.admin_excluir_aviso(uuid) from public,anon;
grant execute on function public.admin_excluir_aviso(uuid) to authenticated;
