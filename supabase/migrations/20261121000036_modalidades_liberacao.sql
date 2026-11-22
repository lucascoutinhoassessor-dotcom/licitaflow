-- LicitaFlow · Liberação de cada modalidade de licitação pelo master (pacotes por cliente).
-- Cada modalidade vira um item em plataforma_modulos (id "modalidade-<código PNCP>"), com os mesmos estados
-- (liberado, teste, em_breve, oculto). Todas continuam liberadas; modalidade oculta some da escolha e da busca do cliente.
BEGIN;

insert into public.plataforma_modulos(id, estado) values
  ('modalidade-6','liberado'), ('modalidade-8','liberado'), ('modalidade-4','liberado'), ('modalidade-5','liberado'),
  ('modalidade-7','liberado'), ('modalidade-9','liberado'), ('modalidade-12','liberado'), ('modalidade-1','liberado'),
  ('modalidade-13','liberado'), ('modalidade-2','liberado'), ('modalidade-3','liberado'), ('modalidade-10','liberado'),
  ('modalidade-11','liberado')
on conflict (id) do nothing;

COMMIT;
