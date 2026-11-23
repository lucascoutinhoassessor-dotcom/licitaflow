# Base rápida de dados brutos (Turso)

## Como funciona

1. **O Supabase dispara.** O pg_cron roda `licitaflow_turso.disparar()` a cada minuto. Ela faz um POST em
   `/api/oportunidades?acao=turso-coletar`, com o cabeçalho `x-coleta`.
2. **A Vercel coleta.** `server/turso.js` lê no PNCP os editais atualizados no dia, por modalidade, a partir da
   última página vista. Depois grava no Turso, nas tabelas `editais` e `itens`, com a busca por palavra em
   `editais_fts` e `itens_fts` (FTS5).
3. **Os painéis leem.** `/api/oportunidades?acao=turso-buscar` confere a sessão no Supabase e consulta o Turso.
   O master acompanha tudo em **Integrações → Base rápida de dados brutos**.

Assim, o dado bruto não passa pelo Postgres do Supabase, que está no plano Nano com pouca RAM.

## Conectar (passo a passo)

1. Banco criado em 22/11/2026: `licitaforce`, em São Paulo (aws-sa-east-1).
   URL: `libsql://licitaforce-lucas-cout.aws-sa-east-1.turso.io`.
2. No Turso, abra o banco, clique em **Create Token** (leitura e escrita, sem expiração) e copie o token.
3. Na Vercel (projeto `licitaflow-prod` → Settings → Environment Variables, ambiente Production), cadastre:
   - `TURSO_DATABASE_URL` = a URL do passo 1
   - `TURSO_AUTH_TOKEN` = o token do passo 2
   e faça um **Redeploy**.
4. Ligue a coleta no Supabase. O token do agendador já é gerado e guardado no banco pela migração 055:
   ```sql
   update licitaflow_turso.config set ativo = true where id;
   ```
5. Em alguns minutos, o cartão em Integrações mostra os editais guardados e a hora da última coleta.

Para desligar: `update licitaflow_turso.config set ativo = false where id;`

## Limites e próximos passos

### Cada rodada (até ~40 s)

1. **Atualizações do dia:** lê uma página por modalidade e deixa a última aberta, para pegar o que entrar depois.
2. **Carga completa:** uma vez por dia, lê todos os editais com proposta aberta (cerca de 32 mil, ou 650 páginas)
   e continua de onde parou. Só grava o edital que é novo ou que mudou na fonte.
3. **Histórico:** depois da carga do dia, lê até 3 páginas por rodada de `/contratacoes/publicacao`, do dia de
   ontem para trás, até 12 meses. O cursor fica em `coleta_estado.historico` (`AAAAMMDD:modalidade:página`), e
   o fim fica em `historico_completo_em`. Dispensa (8) e inexigibilidade (9) ficam de fora, porque são ~65% do volume.
   Cada página do PNCP leva de 7 a 15 s, então a carga de 12 meses (~20 mil páginas) leva cerca de uma semana.
   É a etapa que mais escreve: para já no nível de economia de escrita.
4. **Itens:** coleta os itens dos editais que abrem em até 30 dias, os mais próximos primeiro, 3 por vez.
5. **Limpeza:** encerrados há mais de 2 dias perdem os itens, mas o edital fica no histórico. Saem de vez as dispensas
   e inexigibilidades encerradas e tudo o que passou dos 12 meses. Também apaga as contagens vencidas do cache da busca.
6. **Contagens guardadas:** a cobertura dos itens é contada a cada hora e o tamanho da base a cada 6 h (o total vem
   de `max(rowid)`, aproximado). Os números ficam em `coleta_estado`, e a busca e o cartão do master só leem o resultado.

Se o PNCP responder 429 (pedido para esperar), a coleta pausa por 5 minutos.

### Busca

`POST /api/oportunidades?acao=turso-buscar` usa os mesmos filtros e devolve o mesmo formato do
`buscar_oportunidades` do Postgres, só no modo "por data de abertura". Os resultados ficam guardados em cache por
60 s para cada combinação de filtros.

O app tenta o Turso primeiro e volta para o Postgres quando:
- a primeira carga completa ainda não terminou (resposta 409 `turso_carregando`);
- os filtros por item esbarram em mais de 10% de editais sem itens (resposta 409 `turso_itens`);
- o Turso falha.

**Histórico (encerrados):** quando a abertura começa num dia passado, ou a busca é "por data de publicação", a
resposta traz `historico: true` e inclui os encerrados. O Postgres não tem esses editais, então não há volta para
ele: se o Turso falhar, o app mostra um erro. Nesses casos as contagens param em 1.000 (`totalLimitado`), para não
ler o período inteiro a cada busca. Os índices `editais_modalidade_encerramento`, `editais_orgao_encerramento` e
`editais_publicacao` são criados uma vez (marca `indices_historico`). Na busca, a modalidade vai como
`+e.modalidade` para o SQLite não usar o índice da limpeza e ordenar em memória.

### Próximo passo

Depois que a busca no Turso estiver conferida, enxugar no Supabase `oportunidades_indice`,
`oportunidades_itens_indice` e a fila de itens, medindo `pg_database_size` antes e depois.

## Cota do mês (para o Turso não bloquear o banco)

O plano grátis bloqueia o banco quando o mês passa de 500 milhões de linhas lidas ou 10 milhões de linhas escritas.
O app mede o próprio consumo e freia sozinho antes disso.

### Como o app mede

Cada resposta do Turso informa as linhas lidas e escritas (`rows_read` e `rows_written`). O cliente soma esses
números e grava o total do ciclo em `coleta_estado`, nas chaves `lidas:<início do ciclo>` e
`escritas:<início do ciclo>`. A soma vai junto do pedido seguinte, sem ida extra ao banco. A medição é do app: o
painel do Turso (**Usage**) continua sendo a referência oficial.

### Como o app freia

| Nível | Quando | O que muda |
|---|---|---|
| normal | menos de 70% | nada |
| economia | de 70% a 90%, ou ritmo que passaria de 100% no fim do ciclo | contagens da busca valem 30 min; se for escrita, a coleta roda em minutos alternados e os logs de uso param |
| crítico | de 90% a 97% | a busca do app volta para o Supabase; a coleta só acompanha as atualizações do dia |
| parado | 97% ou mais | coleta e busca no Turso param até virar o ciclo |

O cartão **Integrações → Base rápida de dados brutos** mostra o plano, as duas barras de consumo, a projeção do
ciclo e o nível atual.

### O que foi feito para gastar menos

- **Leituras da busca:**
  - O índice `editais_abertos` cobre todas as colunas dos filtros, a UF e o nome do órgão. Contar, paginar e
    listar órgãos lê só o índice, sem abrir cada linha da tabela. É um índice largo só: com o histórico, criar cada
    um custa uma escrita por edital.
  - A ordem do índice é a mesma da busca, então não há ordenação extra.
- **Cache das contagens:**
  - O total e a lista de órgãos de cada combinação de filtros ficam guardados no próprio Turso (`cache_busca`).
    Valem para todas as instâncias da Vercel.
  - Antes, a chave do cache levava a hora atual, e o cache nunca acertava.
- **Contagens globais:** o tamanho da base e a cobertura dos itens eram contados a cada busca e a cada 5 min no
  cartão do master. Agora quem conta é a coleta, de hora em hora ou a cada 6 h.
- **Escritas da coleta:**
  - Se só a data do edital mudou no PNCP, sem mudar o conteúdo, a coleta faz uma escrita em vez de regravar a linha
    e o FTS.
  - Os itens não são mais apagados quando o edital muda. Eles são conferidos de novo e só regravados se a lista
    mudou de fato. Enquanto isso, `itens_completos = 2` e a busca segue usando os itens guardados.
- **Fila de itens e limpeza:** índices parciais fazem a fila (`editais_fila_itens`) ler só os editais que faltam e a
  limpeza do histórico (`editais_com_itens`) ler só os que ainda têm itens.

As mudanças entram sozinhas na primeira rodada da coleta depois do deploy (chave `otimizacao` em
`coleta_estado`). A migração cria o índice largo uma vez: lê e escreve cada edital uma vez (com o histórico completo, ~600 mil escritas, cerca de 6% da cota grátis do mês).

### Se o Turso já bloqueou o banco

Quando a cota estoura, o Turso recusa tudo com o código `BLOCKED`. O app reconhece esse código e:

- a busca responde 409 `turso_cota`, e o app usa o Supabase;
- a coleta, os itens e os logs param de chamar o Turso por 15 min a cada vez, em vez de tentar a cada minuto;
- o cartão do master mostra **Bloqueada pelo Turso**.

Para liberar, contrate um plano pago (veja abaixo) ou espere o ciclo virar. O medidor do app só começa a contar a
partir do deploy. No primeiro ciclo, ele não sabe o que foi gasto antes: confira em Turso → **Usage**.

### Trocar de plano

Ao comprar um plano pago no Turso:

1. Na Vercel (projeto `licitaflow-prod` → Settings → Environment Variables, ambiente Production), cadastre
   `TURSO_PLANO` com um destes valores: `gratis`, `developer`, `scaler` ou `pro`.
2. Se o ciclo de cobrança não começa no dia 1, cadastre `TURSO_CICLO_DIA` com o dia em que ele começa, de 1 a 28.
3. Faça um **Redeploy**.

Os limites de cada plano estão em `server/turso-cota.js` (`PLANOS`):

| Plano | Linhas lidas por mês | Linhas escritas por mês |
|---|---|---|
| gratis | 500 milhões | 10 milhões |
| developer | 2,5 bilhões | 25 milhões |
| scaler | 100 bilhões | 100 milhões |
| pro | 250 bilhões | 250 milhões |

Confira os limites em turso.tech/pricing antes de cadastrar. Se o Turso mudar os números, cadastre
`TURSO_LIMITE_LEITURAS` e `TURSO_LIMITE_ESCRITAS` com os valores novos, sem mudar o código.

Nos planos pagos, passar da cota não bloqueia o banco: o excedente é cobrado à parte. O freio continua usando a cota
incluída no plano, para não gerar cobrança extra sem aviso. Para usar o excedente, aumente os dois limites.

### Histórico e cota

Com o histórico, a base vai de ~36 mil para ~600 mil editais (estimativa de 1,5 a 2 GB). Nada pode contar a base
inteira: as contagens do histórico param em 1.000 e o total do cartão em Integrações vem de `max(rowid)`.
