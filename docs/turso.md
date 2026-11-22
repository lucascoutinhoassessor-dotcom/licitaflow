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

1. Entre em https://app.turso.tech e crie um banco. Exemplo: `licitaflow`, na região mais próxima (São Paulo, se houver).
2. Copie a **URL do banco** (`libsql://licitaflow-<org>.turso.io`) e gere um **token** em *Create Token*,
   com permissão de leitura e escrita.
3. Na Vercel, no projeto `licitaflow-prod`, abra *Settings → Environment Variables* e cadastre:
   - `TURSO_DATABASE_URL`: a URL do passo 2;
   - `TURSO_AUTH_TOKEN`: o token do passo 2;
   - `TURSO_COLETA_TOKEN`: um texto aleatório de 32 a 200 caracteres (é a senha do agendador).
4. Faça um novo deploy.
5. No SQL Editor do Supabase, aplique a migração `20261122000053_turso_agendador.sql` e ative o agendador:
   ```sql
   update licitaflow_turso.config set ativo = true, token = '<o mesmo TURSO_COLETA_TOKEN>' where id;
   ```
6. Em alguns minutos, o cartão em Integrações mostra os editais guardados e a hora da última coleta.

Para desligar: `update licitaflow_turso.config set ativo = false where id;`

## Limites e próximos passos

- Cada rodada dura até 40 s e lê até 50 editais por página do PNCP. A última página do dia é relida a cada
  rodada, para pegar o que entrou depois.
- Os itens dos editais ainda vêm do Supabase. O próximo passo é levar a fila de itens para o Turso, quando a
  coleta de editais estiver estável.
- A busca do app (`buscar_oportunidades`) continua no Supabase. Só depois de comparar a velocidade com dados
  reais vale trocar a fonte da tela de Oportunidades para `turso-buscar`.
