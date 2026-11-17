# Cobranças e integrações da plataforma

## O que funciona nesta entrega

- Master registra cobranças avulsas por organização, com valor em centavos, vencimento e gateway.
- `/master/financeiro` lista as últimas 200 cobranças e calcula recebido/em aberto sobre essa lista. Não representa saldo bancário, MRR ou faturamento total histórico.
- `/master/integracoes` consulta presença de configuração do servidor; não expõe credenciais nem afirma que a conta foi homologada.
- `/cobrancas` permite que proprietários e administradores da organização vejam seus links. Leitores/membros comuns não consultam cobranças. A leitura é permitida mesmo com organização suspensa para facilitar regularização, sem liberar dados operacionais.
- Checkout hospedado para Stripe, Asaas, Mercado Pago e InfinitePay, consultando o valor persistido no banco, nunca o valor enviado pelo navegador.
- Reserva atômica impede geração concorrente. Após falha de criação, a cobrança fica em revisão para conferência no provedor, sem reenvio automático que possa duplicar uma operação.
- Master pode conferir a situação diretamente na API do gateway. Valor e referência precisam corresponder antes de marcar paga. Para InfinitePay, informe `transaction_nsu` e `slug` do retorno ou comprovante. Não basta a tela de sucesso do navegador.

## Limites e próximos fluxos

Esta é uma integração de cobranças avulsas. Não implementa recorrência, webhooks, atualização automática de plano, repasse/split para clientes, estornos ou cancelamento pela API. Não deve ser divulgada como assinatura automática. A InfinitePay informa que seu Checkout Integrado não oferece recorrência; estornos e cancelamentos são feitos no painel do provedor. Contas dos clientes no LicitaFlow são diferentes de subcontas financeiras em gateways.

Não foram realizadas transações reais. Cada conta precisa ser validada no ambiente de teste e depois habilitada para produção. Mantenha os provedores desabilitados até a configuração estar revisada.

## Implantação

1. Aplicar uma única vez `supabase/migrations/20261116000005_cobrancas.sql` no projeto existente `licitaflow-app`. O arquivo já contém BEGIN/COMMIT. Preserva faturas e contratos existentes.
2. Configurar na Vercel, exclusivamente como variáveis de servidor (sem prefixo VITE):

| Variável | Uso |
| --- | --- |
| SUPABASE_URL | URL do projeto Supabase existente |
| SUPABASE_ANON_KEY | Chave pública desse projeto para validar a sessão |
| SUPABASE_SERVICE_ROLE_KEY | Credencial privilegiada para gravar resultados verificados; nunca no navegador |
| BILLING_PUBLIC_URL | URL canônica HTTPS do LicitaFlow |
| PAYMENTS_ENABLED_PROVIDERS | Lista separada por vírgulas; vazia desabilita todos |
| STRIPE_SECRET_KEY | Chave secreta Stripe, inicialmente de teste |
| ASAAS_API_KEY | Chave Asaas |
| ASAAS_ENV | `production` para produção; ausente usa sandbox |
| MERCADOPAGO_ACCESS_TOKEN | Access token Mercado Pago |
| MERCADOPAGO_ENV | `production` para produção; ausente usa URL sandbox |
| INFINITEPAY_API_KEY | Chave de Checkout da InfinitePay |
| INFINITEPAY_HANDLE | InfiniteTag da mesma conta, sem `$` |

3. Publicar backend e frontend. O caminho `/api/pagamentos` deve retornar JSON e não a página HTML do React. A regra de rewrite foi ajustada para preservar API e recursos do aplicativo instalável.
4. Validar acesso master e rejeição de conta comum na API. Criar cobrança de teste, gerar checkout, verificar confirmação/valor/referência e conferir auditoria. Fazer isso para cada provedor antes de habilitá-lo.
5. O cliente que já possui credenciais cadastra e mantém as chaves no painel da Vercel; não colar credenciais secretas em mensagens, conteúdo da landing ou variáveis VITE.

## Referências oficiais consultadas

- [Stripe Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create)
- [Asaas: links de pagamento](https://docs.asaas.com/reference/criar-um-link-de-pagamentos)
- [Asaas: listar cobranças](https://docs.asaas.com/reference/listar-cobrancas)
- [Mercado Pago: Preferences API](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro-preferences/overview)
- [InfinitePay: documentação de Checkout](https://www.infinitepay.io/checkout-documentacao)
