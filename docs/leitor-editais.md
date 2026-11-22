# Leitor de editais (agente de IA)

Em **Agentes de IA → Leitor de editais** (`/app/agentes`), o cliente cola o link do edital no PNCP ou o número de controle. Também pode abrir o Leitor pelo botão "Ler edital com IA" na página do edital ou pelo "Ler com IA" na página do processo. O agente devolve um checklist em cinco partes: datas e prazos, documentos de habilitação, exigências da proposta, condições de participação e riscos. Cada item traz o trecho do edital de onde saiu, com o documento e a página.

## Como funciona

- `server/agentes.js` atende `/api/agentes?agente=leitor`. A rota é única para todos os agentes, por causa do limite de 12 funções do plano Hobby da Vercel. Com ela, o projeto chega a 12.
- O servidor baixa até 6 arquivos da compra no PNCP, começando pelo edital, depois o termo de referência e então os anexos. Atas, resultados e homologações ficam de fora.
- Do PDF com texto, o servidor extrai as páginas com a marca `[Página N]`. O total fica em até 600 mil caracteres, cerca de 150 mil tokens.
- O PDF escaneado vai inteiro para o Claude, que lê as imagens. O limite é 100 páginas e 15 MB somados.
- Arquivos ZIP e Word não são abertos. Tudo o que fica de fora aparece na tela com o motivo.
- O modelo é `claude-opus-5-5`, com esforço `medium`, resposta em JSON validado pelo esquema `ESQUEMA` e fallback do servidor ligado (`fallbacks: "default"`).
- Cada trecho citado é conferido no texto do documento. A tela marca o resultado com um selo: "Conferido no edital", "Confira no edital" ou "Lido da imagem", este último para PDF escaneado.
- A leitura de cada edital fica guardada em `ia_leituras_edital`, uma por número de controle. Qualquer cliente que abrir o mesmo edital depois a reaproveita sem novo custo.
- O consumo fica em `ia_uso`, por organização, com tokens e custo estimado em US$ (US$ 4 por milhão de tokens de entrada e US$ 20 por milhão de saída).

## Liberação e limites

- O Leitor só funciona com o módulo **agentes** em "liberado" para a organização. Para testar sem abrir para todos, use o estado "teste" no painel master, em Liberação de módulos.
- O limite padrão é de **20 leituras novas por organização por mês**. Ele muda pela variável `IA_LEITOR_LIMITE_MENSAL`. Leituras reaproveitadas não contam.
- Cada usuário pode fazer no máximo 3 leituras novas a cada 5 minutos.

## Implantação

1. Aplicar a migração `supabase/migrations/20261121000037_leitor_editais.sql`.
2. Na Vercel, cadastrar `ANTHROPIC_API_KEY` e, se quiser, `IA_LEITOR_LIMITE_MENSAL`. Também é preciso que `SUPABASE_SERVICE_ROLE_KEY` já exista. Nunca use variáveis `VITE_` para essas chaves.
3. Publicar e liberar o módulo **agentes** primeiro como "teste" para a organização master.
4. Ler 3 ou 4 editais reais de tamanhos diferentes, incluindo um escaneado, e conferir os itens com o edital antes de liberar para os clientes.

Uma leitura costuma levar de 1 a 3 minutos. A função tem `maxDuration` de 300 s.
