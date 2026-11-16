# Aplicativo e oportunidades

O manifesto usa `display: standalone`: a barra de endereço deixa de aparecer quando o usuário instala e abre o LicitaFlow pelo ícone. Abrir o mesmo endereço em uma aba comum ou navegador interno continua mostrando os controles do navegador. A barra de status do sistema operacional não é removida pelo site.

No Android, abrir no Chrome e escolher Instalar aplicativo / Adicionar à tela inicial. No iPhone, abrir no Safari e usar Compartilhar → Adicionar à Tela de Início. Há um botão com instruções no rodapé da landing page e nas configurações do cliente. HTTPS e todos os recursos do manifesto precisam estar disponíveis em produção. O service worker armazena somente a página pública offline; não há acesso offline aos dados dos clientes.

A aba Oportunidades consulta a API pública do PNCP e importa para Processos. É uma consulta manual, com filtros por datas de publicação, modalidade e UF, paginação e busca textual na página atual. Não representa monitoramento contínuo ou alerta de IA. A deduplicação respeita o identificador PNCP e a empresa; o banco já possui índice único para essa combinação.

Validação local: build, testes de mapeamento da API e consulta real ao PNCP. Chromium com perfil persistente não retornou erros de instalabilidade. O fallback offline foi verificado; somente `/offline.html` apareceu no cache. Nenhuma migração é exigida por esta entrega.
