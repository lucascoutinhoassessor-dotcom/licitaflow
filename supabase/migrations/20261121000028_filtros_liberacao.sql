-- LicitaFlow · Liberação de filtros pelo master.
-- Cada filtro da tela Oportunidades vira um item em plataforma_modulos (id "filtro-..."), com os mesmos estados
-- dos módulos (liberado, teste, em_breve, oculto) e as mesmas funções (modulos_da_org, admin_salvar_modulo).
-- Os filtros que já existiam continuam liberados. Filtro novo, sem linha, nasce oculto no app.
BEGIN;

insert into public.plataforma_modulos(id, estado) values
  ('filtro-uf','liberado'), ('filtro-publicacao','liberado'), ('filtro-dias-uteis','liberado'),
  ('filtro-excluir-palavras','liberado'), ('filtro-tipo-item','liberado'), ('filtro-modo-disputa','liberado'),
  ('filtro-portais','liberado'), ('filtro-modalidades','liberado'), ('filtro-orgao','liberado'),
  ('filtro-max-itens','liberado'), ('filtro-valor-total','liberado'), ('filtro-valor-item','liberado'),
  ('filtro-nao-divulgado','liberado'), ('filtro-me-epp','liberado'), ('filtro-excluir-srp','liberado')
on conflict (id) do nothing;

COMMIT;
