-- LicitaForce · Agente Jurídico com IA: redige impugnação, esclarecimento, intenção de recurso, recurso e
-- contrarrazões com o Claude Opus, a partir do formulário do Jurídico, da leitura do edital feita pelo Leitor
-- (quando existe) e de peças parecidas da base de peças publicadas.
-- Limite do plano (chave "juridico" em limites_ia): peças redigidas por mês (cada redação conta uma; o custo
-- de IA fica em ia_uso). Valores decididos pelo usuário em 26/11/2026: 1 / 5 / 20 / 60; Cancelado 0.
BEGIN;

update public.plataforma_planos set limites_ia = limites_ia || jsonb_build_object('juridico',
  case id when 'trial' then 1 when 'essencial' then 5 when 'profissional' then 20 when 'assessoria' then 60 else 0 end);

COMMIT;
