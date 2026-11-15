# LicitaFlow

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
