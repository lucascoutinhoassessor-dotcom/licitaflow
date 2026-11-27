# Termômetro de Pagamento (agente)

O Termômetro mostra a saúde financeira do órgão comprador pela **nota CAPAG** (Capacidade de Pagamento) que o Tesouro Nacional dá a estados e municípios. Para **órgãos federais**, que não têm CAPAG, mede o prazo real de pagamento de cada unidade gestora (veja "Órgãos federais"). Ele não usa IA.

A CAPAG mede três indicadores:
- **endividamento;**
- **poupança corrente;**
- **liquidez:** se o caixa cobre as obrigações de curto prazo. É o indicador mais ligado a pagar o fornecedor em dia.

Ela mede a saúde financeira do ente, **não** a pontualidade de cada pagamento. A tela diz isso.

## Selos

| Nota CAPAG | Selo |
|---|---|
| A+, A | 🟢 Boa saúde financeira |
| B+, B | 🟡 Saúde financeira regular |
| C, D | 🔴 Risco de atraso |
| n.d., n.e. (o Tesouro não calculou) | Sem nota do Tesouro |
| Órgão federal com UG (PNCP) | Selo pelos prazos de pagamento (veja "Órgãos federais") |
| Órgão federal sem UG (Radar, processo) | Governo Federal |

## Onde aparece e como liga ao órgão

- **Página do edital e ficha do Leitor:** usa os dados oficiais do PNCP. Com `orgaoEntidade.esferaId` = M, pega a nota do município pelo `unidadeOrgao.codigoIbge`. Com E, a do estado pela UF. Com F, mostra o selo federal.
- **Sugestões do Radar e cabeçalho do processo:** os dados guardados não têm esfera nem IBGE, então a ligação é pelo nome do órgão (`alvoPeloNome`):
  - "Município…", "Prefeitura…", "Câmara Municipal…" e "SAAE" → nota da cidade;
  - "Estado de…", "Secretaria de Estado…", "Distrito Federal" → nota do estado;
  - "Ministério", "Universidade Federal" etc. → federal.

  O selo avisa quando a ligação foi feita pelo nome.
- **Tela de consulta** (`/app/agentes/termometro`): busca qualquer município ou estado pelo nome.

## Dados e atualização

- **Fonte:** Tesouro Transparente (CKAN).
  - Municípios: conjunto `9ff93162…`, em XLSX. A aba "Prévia da CAPAG" tem 5.568 municípios.
  - Estados: conjunto `f04a675e…`, em CSV, com 27 UFs.
- **Banco:** a tabela `public.capag` guarda uma linha por ente (`M:<IBGE>` ou `E:<UF>`). Usuários logados leem; só o servidor grava, pela função `termometro_gravar`.
- **Atualização:** o pg_cron (`licitaflow-termometro`) roda toda segunda às 6h, horário de Brasília, e chama `GET /api/agentes?agente=termometro&acao=atualizar`, com o header `x-coleta`. O servidor (`server/termometro.js`):
  - confere o arquivo mais recente de cada conjunto e só baixa se o id mudou;
  - lê o XLSX com o zlib do Node, sem biblioteca;
  - grava em lotes de 800;
  - não grava arquivo com poucas linhas (sinal de arquivo quebrado). Um arquivo ruim não impede o outro.
- **Carga inicial ou forçada:** `select licitaflow_termometro.disparar()` no SQL Editor. Para forçar mesmo sem novidade, use `?forcar=1`.

## Plano

A chave `termometro` em `limites_ia` vale **sem limite** em todos os planos, menos no Cancelado (0). Ele não conta uso. Também é preciso ter o módulo **agentes** liberado.

## Órgãos federais

**O que mede:** dias entre a **liquidação** (o órgão atesta a nota e reconhece a dívida) e o **pagamento** (ordem bancária ao fornecedor), por unidade gestora (UG). No PNCP, o `unidadeOrgao.codigoUnidade` (UASG) dos órgãos federais é a própria UG do SIAFI.

**Fonte:** arquivo diário "Despesas" do Portal da Transparência (`portaldatransparencia.gov.br/download-de-dados/despesas/AAAAMMDD`), sem chave. São cerca de 12 MB por dia útil, publicados com 3 a 5 dias de atraso. Antes de existir, o Portal responde 403.

**Como casa** (`server/termometroFederal.js` lê e `termometro_federal_dia` casa no banco):
- Só entra despesa direta (modalidade 90) a favorecido com CNPJ, e só ordem bancária (OB) de valor positivo.
- As notas de liquidação do mesmo empenho no mesmo dia (valor principal e retenções) contam como **uma**.
- Cada pagamento quita a liquidação aberta mais antiga do mesmo empenho (FIFO). Em out–nov/2026, cerca de metade dos pagamentos casou.
- Liquidação sem pagamento por 150 dias sai da fila `licitaflow_termometro.fed_pendente`.
- Liquidação feita pelo Contratos.gov.br traz na observação o mês do serviço ("MES(ES): 06/2026", ~10% dos casos). Daí também se mede a distância entre o fim desse mês e o pagamento: é onde aparece a demora no ateste.

**Resumo:** `public.termometro_federal` (UG × mês) e `public.termometro_federal_ug` (nome e órgão). A tela soma os últimos 3 meses fechados mais o corrente. Abaixo de 10 pagamentos na UG, usa o órgão inteiro. Leitura por `termometro_federal_consulta(ugs)`.

**Selos** (`classificarFederal` em `src/lib/termometro.ts`; calibrados com 2.215 UGs, em que a média ficou em 6 dias na mediana e 13 no percentil 95):
- 🟢 **Paga em dia:** média de até 7 dias e menos de 5% acima de 30 dias. Quando há o mês do serviço: média de até 30 dias desde o fim do mês e menos de 10% acima de 60.
- 🔴 **Pagamento lento:** média acima de 15 dias, ou 10% ou mais acima de 30 dias. Quando há o mês do serviço: média acima de 45 dias, ou 25% ou mais acima de 60.
- 🟡 **Pagamento regular:** o resto.

**Atualização:** o pg_cron `licitaflow-termometro-federal` roda de hora em hora, da 0h às 6h de Brasília (3h–9h UTC). Ele chama `GET /api/agentes?agente=termometro&acao=federal` (header `x-coleta`). A rodada:
- lê, em ordem, os dias seguintes ao último gravado (`config.recursos.federal`), **no máximo 3 dias** e até ~200 s;
- manda cada dia em **lotes de até 2.500 linhas**, com tudo de um empenho no mesmo lote;
- guarda o lote em que parou (`config.recursos.federal_parte = 'AAAAMMDD:k'`), e a próxima rodada continua dele;
- o dia só conta como lido no último lote;
- recusa lote repetido, fora de ordem ou de outro dia enquanto um dia está pela metade;
- pula o dia que falta há mais de 10 dias, desde que o seguinte já tenha saído.

Atrasada, a carga anda ~21 dias por noite. Em dia, cada rodada só confere se saiu um dia novo. Na primeira vez começa 120 dias atrás.

**Cuidado (queda de 27/11/2026):** a primeira versão mandava o dia inteiro (~1,3 MB) numa chamada só, e um agendamento temporário rodava a cada 5 minutos. Na máquina Nano a gravação estourava o tempo. A chamada desistia, mas a consulta continuava no banco; elas se acumularam e ajudaram a derrubá-lo, até ser preciso reiniciar o projeto. **Não** volte a mandar o dia inteiro nem a agendar de 5 em 5 minutos.

**Limite:** mede o prazo **depois** do ateste. A demora entre a entrega da nota e a liquidação só aparece pelo mês do serviço, quando o Contratos.gov.br informa. A tela diz isso.
