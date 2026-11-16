# Isolamento de consultas entre contas

O cache de detalhes de processos e contratos inclui usuário, organização e identificador. As consultas, atualizações e exclusões também filtram a organização explicitamente, mantendo as regras RLS no banco.

O AuthProvider limpa o cache quando o identificador da conta muda e remove a seleção anterior de organização/empresa ao sair ou trocar de usuário. Eventos recebidos da autenticação prevalecem sobre uma leitura inicial de sessão que termine depois, evitando restaurar uma sessão desatualizada.

Validação em Chromium com respostas simuladas: trocar de organização na mesma sessão não apresenta detalhes do contexto anterior; sair e entrar com outra conta na mesma SPA não reaproveita o registro que estava em cache. Não exige migração.
