# Painel master: assinaturas pelo Asaas e controle financeiro

## O que esta entrega faz

- **Asaas configurado pelo painel** (Master → Asaas e integrações): ambiente (sandbox/produção), chave de API, token do webhook, tolerância de atraso e suspensão automática. A chave e o token são cifrados no servidor (AES-256-GCM) e nunca voltam para a tela; o master vê só se existem. Botão "Testar conexão" mostra a conta e o saldo do Asaas.
- **Assinatura recorrente**: o cliente (dono/administrador) contrata em *Meu plano*, escolhe plano, mensal ou anual, forma de pagamento (Pix, boleto, cartão ou o cliente escolhe) e CPF/CNPJ. O valor sai sempre do catálogo no banco. O master também pode criar a assinatura pela ficha do cliente, inclusive com planos ocultos (personalizados).
- **Webhook** (`/api/asaas-webhook`): grava cada fatura, libera o acesso e aplica o plano quando o pagamento é confirmado, marca atraso e encerra a assinatura excluída no Asaas. Eventos repetidos são ignorados. Links avulsos do Asaas também passam a ser confirmados sozinhos.
- **Inadimplência**: rotina diária (8h, pg_cron) suspende a conta que passou da tolerância com fatura vencida. O pagamento desfaz só essa suspensão automática; **suspensões manuais do master nunca são desfeitas por pagamento**.
- **Telas do master**: visão geral com receita e lista "Precisa de atenção"; painel financeiro (MRR, ARR, recebido no mês, líquido, a receber, inadimplência, MRR em risco, churn, receita de 12 meses, MRR por plano, funil de testes); assinaturas com filtros e últimos eventos do webhook; melhores clientes com saúde da conta; ficha do cliente com assinatura, faturas, trocar plano, cancelar, sincronizar com o Asaas e controle de plano/teste/suspensão. Menu reorganizado por áreas.
- **Correção de acesso ao master**: uma falha momentânea na checagem (sessão renovando, rede) aparecia como "Acesso restrito" e, no login, como "esta conta não tem acesso". Agora o site tenta de novo e, se não conseguir, mostra "Não foi possível verificar o acesso" com botão de nova tentativa.

## Implantação (uma vez)

1. **Banco**: aplicar `supabase/migrations/20261120000020_assinaturas_asaas.sql` no projeto `licitaflow-app` (`tbsjasyvnuylnjrqrtba`) pelo SQL Editor. O arquivo já tem BEGIN/COMMIT e agenda a rotina diária no pg_cron. Não é para rodar duas vezes.
2. **Vercel** (variáveis de servidor, sem prefixo VITE): já existem `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Recomendado criar `CREDENCIAIS_CHAVE` com um texto aleatório longo **antes** de cadastrar a chave do Asaas: é a chave que cifra as credenciais. Sem ela, usa-se a service role (se ela for trocada, basta recadastrar a chave do Asaas).
3. Publicar (push na `main`). As funções da Vercel passam a 8 (`api/asaas-webhook.js` é nova); o limite do plano Hobby é 12.
4. **No painel master → Asaas e integrações**: escolher *Sandbox*, colar a chave de API do Asaas sandbox, clicar *Gerar token*, *Salvar configuração* e *Testar conexão*.
5. **No Asaas → Integrações → Webhooks**: adicionar a URL mostrada no painel (`https://<seu domínio>/api/asaas-webhook`), o mesmo token, API v3, envio sequencial e os eventos listados na tela.
6. Clicar *Ativar cobranças*. Fazer uma assinatura de teste com uma conta de cliente, pagar no sandbox e conferir: fatura paga, conta com o plano novo, evento em *Assinaturas → Últimos avisos do Asaas*.
7. Repetir com a chave de **produção**, trocando o ambiente. O painel pede confirmação antes de ativar cobranças reais.

## Regras e limites

- Cancelar não estorna nem tira o plano na hora: não há novas cobranças e o acesso pago vale até a data "pago até". Estornos são feitos no painel do Asaas (o webhook registra a fatura como estornada).
- Trocar de plano atualiza o valor da assinatura e das faturas em aberto no Asaas e aplica o plano na hora se a assinatura estiver ativa. Não há cálculo proporcional (pró-rata).
- O teste grátis vencido não bloqueia o acesso automaticamente (comportamento anterior mantido); o painel mostra quantos estão vencidos para abordagem.
- "Sincronizar com Asaas" reprocessa as últimas 100 cobranças da assinatura, útil se algum webhook se perdeu.
- Pendentes para próximas etapas: cupons e promoções, afiliados, colaboradores do master com permissão por área, e-mail/WhatsApp automáticos de cobrança, pró-rata.
