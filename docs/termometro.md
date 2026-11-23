# Termômetro de Pagamento (agente)

O Termômetro mostra a saúde financeira do órgão comprador pela **nota CAPAG** (Capacidade de Pagamento) que o Tesouro Nacional dá a estados e municípios. Ele não usa IA.

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
| Órgão federal | Governo Federal (não existe CAPAG da União) |

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

## Futuro

Dados reais de pagamento do governo federal (data de liquidação e de pagamento) pelo Portal da Transparência. Para isso, o usuário precisa cadastrar uma chave gratuita em portaldatransparencia.gov.br.
