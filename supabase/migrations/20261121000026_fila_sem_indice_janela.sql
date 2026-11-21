-- A fila do coletor não consulta jobs por agendada_em (só a tabela envios faz isso).
-- O índice nunca foi usado desde 11/11/2026 e, como agendada_em muda a cada pedido,
-- impedia as atualizações "HOT" da fila: cada reagendamento deixava uma linha morta a mais.
drop index if exists licitaflow_coleta.coleta_janela;
