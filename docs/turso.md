# Base rápida de dados brutos (Turso)

## Como funciona

1. **O Supabase dispara.** O pg_cron roda `licitaflow_turso.disparar()` a cada minuto. Ela faz um POST em
   `/api/oportunidades?acao=turso-coletar`, com o cabeçalho `x-coleta`.
2. **A Vercel coleta.** `server/turso.js` lê no PNCP os editais atualizados no dia, por modalidade, a partir da
   última página vista. Depois grava o JSON bruto no Turso, nas tabelas `editais_brutos` e `editais_busca` (FTS5).
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
4. **Itens:** coleta os itens dos editais que abrem em até 30 dias, os mais próximos primeiro, 3 por vez.
5. **Limpeza:** encerrados há mais de 2 dias perdem os itens, mas o edital fica no histórico. Saem de vez as dispensas
   e inexigibilidades encerradas e tudo o que passou dos 12 meses.

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

### Limites do plano grátis do Turso

- 500 milhões de linhas lidas e 10 milhões de linhas escritas por mês, e 5 GB de espaço.
- Cada busca conta e agrupa os editais que passam pelo filtro, então lê milhares de linhas.
- Com o histórico, a base vai de ~36 mil para ~600 mil editais (estimativa de 1,5 a 2 GB). Nada pode contar a base
  inteira: o total do cartão em Integrações vem de `max(rowid)` (aproximado).
- O cache de 60 s e a gravação só do que mudou seguram o consumo. Acompanhe em Turso → Usage.
