# Gestão master: implantação e validação

Esta entrega amplia o console master com ficha do cliente (empresas, equipe, uso e valores dos contratos), alteração auditada de papéis de membros, editor de textos da landing page com rascunho/publicação/restauração e auditoria administrativa paginada. As notas internas passam a uma tabela privada. O proprietário da organização não pode ser rebaixado pela nova ação de membros.

## Aplicação no projeto existente

1. Confirmar o projeto Supabase `tbsjasyvnuylnjrqrtba` (`licitaflow-app`). Não criar outro banco.
2. Aplicar `supabase/migrations/20261116000004_master_gestao.sql` pelo fluxo de migrações autorizado ou SQL Editor do projeto. Depende das migrações 0001 a 0003 existentes. Recomenda-se executar o arquivo inteiro em uma transação (`BEGIN` / `COMMIT`). O arquivo cria tabelas e funções; não é destinado a execução repetida.
3. Publicar o código desta alteração na Vercel após a migração. As variáveis Supabase existentes permanecem as mesmas. Não incluir service role no frontend.
4. Testar com contas separadas: master acessa `/master/organizacoes`, abre uma ficha, muda papel de membro com motivo, confere `/master/auditoria`. Conta comum continua sem acesso às rotas e funções master.
5. Em `/master/conteudo`, salvar um rascunho e confirmar que a página pública não mudou. Publicar e recarregar a landing page. Restaurar uma versão no editor, revisar e publicar novamente se necessário.
6. Conferir no cliente que as notas internas não são retornadas em `organizations.notas_admin`. O campo antigo passa a conter somente NULL; `admin_organizacoes` mantém o contrato e retorna as notas exclusivamente para master.

## Limites desta etapa

O editor controla textos principais, chamadas de cadastro e contato. Não altera layout arbitrário, preços, FAQ ou imagens. Não há acesso disfarçado como cliente, alteração de senha, gestão de cobrança Stripe, backups externos, monitoramento de infraestrutura ou aplicação de migração automática por este console. Valores financeiros da ficha são faturas dos contratos do cliente, não receita de assinatura. Segurança depende também das configurações de autenticação, recuperação de conta, infraestrutura e procedimentos de acesso; os testes cobrem autorização e isolamento no banco local, não uma auditoria independente de produção.

O PR de Oportunidades é uma entrega separada e permanece preservado.

## Navegação responsiva

Os painéis do usuário e master usam menu lateral fixo a partir de 1280 px. Abaixo disso, inclusive tablets de 1024 px, o botão de menu abre uma gaveta modal. A gaveta fecha ao navegar, tocar no fundo ou pressionar Esc; mantém o foco dentro do menu e devolve-o ao botão ao fechar. A lista de módulos rola independentemente do rodapé de conta. O seletor de empresa ocupa uma segunda linha no cabeçalho de celulares. Modais usam altura dinâmica de viewport e tabelas mantêm rolagem local quando necessária.

A validação de interface usa Chromium headless com sessões e respostas Supabase simuladas, sem credenciais ou dados reais. Foram incluídas larguras de 320, 390, 768, 1024 e 1440 px, nas rotas de visão geral, organizações, usuários, conteúdo, auditoria, atividade e ficha de cliente do master; painel, empresas, equipe, processos, documentos, prazos, contratos, financeiro e configurações do usuário. O teste verifica limites horizontais e os comportamentos de foco, Esc, navegação e toque no fundo. Isso não substitui validar os fluxos autenticados no ambiente publicado, nem testes em aparelhos físicos e outros navegadores.
