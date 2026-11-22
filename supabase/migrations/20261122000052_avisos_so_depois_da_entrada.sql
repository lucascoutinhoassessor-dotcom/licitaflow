-- Quem entra numa organização depois de um aviso não vê esse aviso antigo (nem no painel, nem no histórico).
-- Vale a data em que a pessoa entrou naquela organização (memberships.created_at).
-- O push já seguia essa regra: sai na hora da publicação, só para quem já era membro e tinha notificações ativas.

drop policy if exists avisos_select on public.plataforma_avisos;
create policy avisos_select on public.plataforma_avisos for select to authenticated using(
  public.is_platform_admin() or (ativo and publicar_em <= now() and (expira_em is null or expira_em > now()) and exists(
    select 1 from public.memberships m where m.user_id = auth.uid()
      and m.created_at <= plataforma_avisos.publicar_em
      and (
        (plataforma_avisos.org_id is null and plataforma_avisos.org_ids is null)
        or plataforma_avisos.org_id = m.org_id
        or m.org_id = any(plataforma_avisos.org_ids)
      )
  ))
);
