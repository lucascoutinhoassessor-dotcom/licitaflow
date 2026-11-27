# Radar (agente)

Todo dia às 7h (horário de Brasília), o Radar cruza os editais abertos com o perfil de cada empresa e sugere os que combinam, com o motivo. O cliente decide:
- **"Adicionar ao funil"** cria o processo na coluna Captação, com o mesmo formato da tela de Oportunidades;
- **"Descartar"** esconde a sugestão.

O Radar não usa IA, então não tem custo por uso.

## Perfil da empresa

- **Palavras-chave:** ficam em `empresas.palavras_chave`, o mesmo campo usado na tela de Empresas.
- **Filtros** (em `radar_perfis`):
  - estados;
  - modalidades;
  - valor mínimo e máximo;
  - palavras para ignorar;
  - antecedência mínima até o prazo final (padrão: 24 h);
  - Radar ligado ou desligado.

## Como funciona

- `licitaflow_radar.buscar(empresa)` procura em `oportunidades_indice` (palavra-chave no objeto, nos itens e no complemento, pelos índices GIN) e filtra por `oportunidades_busca`:
  - só editais abertos, com situação 1;
  - prazo final depois da antecedência;
  - estados, modalidades, valor e exclusões do perfil.

  As regras de palavra-chave são as mesmas da tela de Oportunidades (`oportunidades_termos`). Grava até 30 sugestões novas por vez e nunca repete um edital para a mesma empresa.
- **Pontuação:**
  - 60 pontos quando o objeto cita uma palavra-chave, mais 10 por palavra extra (até +20);
  - 15 pontos quando os itens citam;
  - 5 pontos no mesmo estado da empresa;
  - 25 pontos quando só o complemento cita.

  Na tela, isso aparece como aderência alta (≥ 70), média (≥ 40) ou baixa. Os motivos ficam escritos em cada sugestão.
- **Rodada diária:** o pg_cron roda `licitaflow_radar.rodada()` às 10h UTC (`licitaflow-radar`) e chama `GET /api/agentes?agente=radar&acao=avisar`, com o header `x-coleta`. O servidor (`server/radar.js`) manda um push por empresa e um resumo por e-mail para cada membro da organização.
- **E-mail:** usa o SMTP ativo em Master → Integrações, com remetente, logo e cores da LicitaForce. Cada membro recebe individualmente, no e-mail cadastrado na conta, as oportunidades da empresa: objeto, órgão/UF, valor estimado, prazo em Brasília, motivos e botões para avaliar. O link exige login, seleciona a organização e a empresa e abre a sugestão para adicionar ao funil ou descartar. Não usa o e-mail de contato da empresa cadastrada como destinatário.
- **Fila e tentativas:** `radar_emails_reservar` agrupa sugestões ainda não enfileiradas por empresa/destinatário, reservando até 50 e-mails por chamada por 10 minutos. `radar_email_concluir` confirma o resultado por reserva. Falhas ficam para a próxima rodada, mesmo sem oportunidades novas; reservas abandonadas expiram. Antes de cada tentativa são conferidos vínculo, monitoramento, situação e prazo. O push usa seu próprio controle. Sem SMTP ativo, nada é reservado. Como em qualquer envio SMTP, uma interrupção entre a aceitação do provedor e a confirmação no banco pode causar reenvio.
- **"Buscar agora"** (`radar_buscar_agora`): roda a busca de uma empresa na hora, no máximo uma vez a cada 10 minutos, sem push; se encontrar novidades, também chama o envio por e-mail.
- **Kanban:** um processo criado a partir do Radar ganha o selo "Encontrado pelo Radar" (`agentes_estado_processos`).

## Limite por plano

A chave `radar` em `limites_ia` limita as **empresas monitoradas ao mesmo tempo**. As empresas mais antigas têm preferência.

| Plano | Empresas monitoradas |
|---|---|
| Teste grátis | 1 |
| Essencial | 1 |
| Profissional | 3 |
| Assessoria | sem limite |
| Cancelado | 0 |

Na ficha do cliente dá para abrir exceção. Também é preciso ter o módulo **agentes** liberado (ou em teste para a organização).

## Atenção

Para ativar o envio, publicar o servidor e aplicar a migration `20261125000004_radar_emails.sql`. O SMTP da plataforma precisa estar configurado e ativo. A fila guarda o resultado por destinatário; a API informa `emails_enviados`, `emails_falhas` e `email_configurado`.

O Radar lê as tabelas de oportunidades do Postgres. Se a busca de oportunidades passar para o Turso e essas tabelas forem enxugadas, o Radar precisa passar a ler da nova fonte.
