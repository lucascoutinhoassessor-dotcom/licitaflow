# Suspensão e contratação

Aplicar `supabase/migrations/20261125000001_checkout_acesso.sql`, `20261125000120_checkout_teste_opcional.sql` e `20261125000121_conciliar_controle_teste.sql` nessa ordem depois das migrações existentes e publicar o aplicativo e as APIs na mesma versão. O aplicativo passa a consultar `minhas_organizacoes`; a migração é obrigatória antes da publicação.

O banco verifica o vencimento do teste em cada leitura e escrita protegida por `is_member`/`has_role`, usando a data de Brasília. O bloqueio funciona antes da rotina diária. A sessão aberta atualiza a situação a cada 30 segundos e ao voltar à janela. A contratação e o suporte continuam disponíveis para regularizar a conta.

Em **Master → Planos → Teste grátis**, desmarque **Oferecer teste grátis para novos cadastros** e salve para desativar a oferta. A duração fica guardada para reativação. Chamadas antigas com 0 dias continuam compatíveis. Testes existentes mantêm seu prazo; marcar o recálculo aplica o novo prazo também a eles. A migração ativa o bloqueio de testes vencidos por padrão. Suspensões administrativas são preservadas após um pagamento.

O cliente vê os planos, informa CPF/CNPJ e escolhe o ciclo e a forma de pagamento. `/checkout` exibe QR Code e código Pix, linha digitável, boleto e formulário de cartão e titular, sem sair do LicitaForce. Os dados completos do cartão seguem apenas ao Asaas pela API do servidor e não são gravados no navegador nem no banco do aplicativo. A confirmação leva à página `/obrigado`. A página de obrigado consulta o provedor e nunca libera acesso com base em parâmetros do navegador. O webhook também confirma pagamentos, inclusive quando o cliente fecha a página.

Sem teste, `/cadastro` direciona à compra. Uma compra nova gera login e senha aleatória, cria a organização bloqueada e inicia a sessão para pagar. A senha fica cifrada em `checkout_acessos`, inacessível ao navegador, e é removida após o envio do e-mail. O primeiro pagamento confirmado envia login, senha e endereço de acesso. Clientes existentes conservam a senha cadastrada e os dados da organização. O e-mail é reservado atomicamente; falhas liberam uma nova tentativa pelo checkout ou por um reenvio do webhook.

Pré-requisitos de produção: chave de serviço Supabase, Asaas ativo no master, webhook configurado e SMTP ativo com boas-vindas habilitadas. `BILLING_PUBLIC_URL`, se definido, deve apontar para a origem pública do aplicativo autorizada no Asaas; o padrão é `https://licitaforce-app.vercel.app`.

Referências da integração: [Pix](https://docs.asaas.com/docs/cobrancas-via-pix), [boleto](https://docs.asaas.com/docs/cobrancas-via-boleto) e [retorno após pagamento](https://docs.asaas.com/docs/redirecionamento-apos-o-pagamento).

A tentativa de pagamento com cartão reserva a fatura atomicamente. Recusas explícitas permitem corrigir os dados; um timeout mantém a reserva. Após dois minutos, uma nova consulta ao Asaas que confirme a fatura ainda pendente permite tentar novamente. Pagamentos confirmados nunca são cobrados de novo por essa ação. A recorrência utiliza o cartão registrado no Asaas; falha nessa atualização fica visível para conferência.

Referência do cartão: [pagar cobrança existente](https://docs.asaas.com/reference/pagar-uma-cobranca-com-cartao-de-credito) e [cartão nas assinaturas](https://docs.asaas.com/docs/criando-assinatura-com-cartao-de-credito).
