-- LicitaFlow · Atalho "Próximas disputas" em Oportunidades (editais que ainda vão abrir), controlado pelo master.
-- Nasce liberado; a busca usa a pesquisa de editais abertos já existente (período de abertura e portal).
insert into public.plataforma_modulos(id, estado) values ('recurso-proximas-disputas','liberado')
on conflict (id) do nothing;
