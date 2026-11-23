-- Som do aviso: conserto do envio + histórico de áudios.
--
-- 1) O envio do áudio usa "upsert" (substituir sons/aviso). O Storage do Supabase exige permissão de
--    LEITURA na tabela storage.objects para isso, e o bucket "site" só tinha inserir/atualizar/apagar.
--    Resultado: "Você não tem permissão para esta ação". A leitura pública continua pelo endereço público.
drop policy if exists site_sel on storage.objects;
create policy site_sel on storage.objects for select to authenticated
  using (bucket_id = 'site' and public.is_platform_admin());

-- 2) Histórico: cada áudio enviado fica guardado em sons/historico/<arquivo> e registrado aqui.
--    O som em uso continua sendo o arquivo sons/aviso (cópia do escolhido).
create table if not exists public.plataforma_sons_aviso (
  id           uuid primary key default gen_random_uuid(),
  caminho      text not null unique,          -- caminho no bucket "site"
  nome         text not null,                 -- nome original do arquivo
  tipo         text not null,                 -- content-type
  bytes        integer not null check (bytes > 0),
  segundos     numeric(5,2) not null check (segundos > 0),
  enviado_por  uuid references auth.users(id) on delete set null default auth.uid(),
  enviado_em   timestamptz not null default now(),
  usado_em     timestamptz                    -- última vez que virou o som em uso
);
create index if not exists plataforma_sons_aviso_enviado_idx on public.plataforma_sons_aviso (enviado_em desc);

alter table public.plataforma_sons_aviso enable row level security;
drop policy if exists sons_aviso_master on public.plataforma_sons_aviso;
create policy sons_aviso_master on public.plataforma_sons_aviso for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
grant select, insert, update, delete on public.plataforma_sons_aviso to authenticated;
