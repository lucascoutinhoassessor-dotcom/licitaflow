# Publicação na Vercel

O fluxo antigo usava `vercel/action-deploy@v1`. O GitHub recusou a publicação antes de executar qualquer etapa: `Unable to resolve action vercel/action-deploy, repository not found`.

O workflow passa a usar a CLI oficial Vercel, fixada na versão 65.16.0, com Node 22. Para cada projeto, executa `pull --environment=production`, `build --prod` e `deploy --prebuilt --prod`. As variáveis de compilação vêm do respectivo projeto na Vercel, evitando compilar o site com configurações diferentes das cadastradas lá. Prévias e produção automática ficam sob a integração Git da Vercel. O workflow é uma alternativa acionada manualmente, evitando uma segunda publicação concorrente em cada push.

Os segredos necessários são `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_PROD` e `VERCEL_PROJECT_ID_DEMO`, cadastrados no GitHub Actions (repositório ou ambiente correspondente). A validação informa apenas os nomes ausentes. Não colocar os valores em código, variáveis VITE ou mensagens da conversa. Produção e demo executam independentemente, sem cancelar uma à outra. A concorrência é serializada por ambiente para evitar uma publicação anterior terminar sobre uma mais recente.

Uma conexão com Supabase permite atualizar o banco, mas não concede acesso à conta Vercel. Sem os segredos válidos, a alternativa manual por Actions não pode publicar. A integração Git da Vercel não depende desses segredos do GitHub. Se a integração Git da Vercel estiver ativa, também pode ser usado Redeploy sobre a versão principal mais recente dentro do projeto correto `licitaflow-prod`.

Referências verificadas: https://vercel.com/docs/cli/pull, https://vercel.com/docs/cli/build, https://vercel.com/docs/cli/deploy. A versão e requisito de Node foram conferidos no registro npm oficial do pacote `vercel`.
