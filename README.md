# LicitaForce

Plataforma SaaS de gestão de licitações (pregões e dispensas eletrônicas) para fornecedores e assessorias.

## Stack

- React 18 + Vite + TypeScript + Tailwind
- Supabase: Postgres com RLS por organização, Auth, Storage
- Vercel: deploy automático a cada push na `main`

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # preencha com os dados do projeto Supabase
npm run dev                   # http://localhost:3100
```

## Variáveis de ambiente (frontend)

| Nome | O que é |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Chave **publicável** do Supabase (os dados são protegidos pelas políticas RLS) |

Na Vercel: *Settings → Environment Variables* (Production e Preview). Depois de alterar, é preciso uma nova publicação.

Chaves secretas (Claude, Resend, WhatsApp, Stripe, service role) **nunca** vão no frontend: ficam em *Supabase → Edge Functions → Secrets*.

## Banco de dados

As migrations ficam em `supabase/migrations/` e devem ser aplicadas em ordem.

## Prévia de compartilhamento

O `index.html` contém os metadados Open Graph e Twitter de forma estática, para que os leitores de links consigam obter título, descrição e capa sem executar JavaScript. A imagem pública fica em `public/social/licitaforce-v1.png` (1200 × 630), e `/social/` está excluído do redirecionamento para o HTML na Vercel.

Para recriar a capa no Windows: `pwsh -File scripts/gerar-capa-social.ps1`. Ao trocar a arte, atualize a versão no nome do arquivo, no gerador e nas URLs dos metadados para renovar o cache da imagem. Se o domínio público mudar, atualize também as URLs absolutas no HTML e o endereço exibido na capa.

As alterações precisam ser publicadas para aparecerem nos links compartilhados. Aplicativos de mensagens podem manter uma prévia antiga em cache; a exibição final depende do aplicativo que recebe o link.

## Testes

```bash
npm test        # regras de domínio (Vitest) + RLS do banco (PGlite)
npm run lint
npm run build
```

## Áreas

- `/`: landing page
- `/app`: app do cliente (processos, prazos, documentos, contratos, financeiro, empresas, equipe)
- `/master/entrar`: console de administração da plataforma (somente contas master)
