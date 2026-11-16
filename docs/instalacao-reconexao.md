# Convite de instalação e reconexão

O convite aparece em visitas de dispositivos com toque ao site, inclusive landing page, login e painéis. Há um único controlador para todos os botões de instalação. Ele não grava no armazenamento local uma marca permanente de aplicativo instalado. Fecha nesta visita se a pessoa dispensar; novas visitas podem apresentar o convite novamente. O evento `beforeinstallprompt` permite reoferecer quando o navegador informar elegibilidade, inclusive após uma eventual desinstalação. Não há afirmação de que a desinstalação foi detectada.

A instalação nativa depende de clique e consentimento, respeita as restrições/cooldowns do navegador e não é forçada. No modo standalone, o convite fica oculto. Fora dele, caso não exista prompt nativo, mostra instruções para Android/iPhone e navegadores internos. Espaço no fim do conteúdo acompanha a altura do convite para não esconder controles da página.

O cache offline foi atualizado para v2, armazenando somente a tela pública de reconexão. Esta verifica o manifesto diretamente pela rede (requisição não navegacional, sem cache) e recarrega o mesmo endereço quando a resposta válida retorna. Há limite de seis segundos por tentativa, intervalos progressivos até trinta segundos e retomada ao receber evento online ou voltar à página. Nenhum conteúdo de cliente ou sessão é armazenado.

Validação em Chromium: oferta móvel, abertura do prompt apenas por clique, aceitação, dispensa, elegibilidade recebida novamente, retorno ao site, instruções alternativas e ocultação em standalone. Teste de falta de conexão seguido de retorno à rede confirmou recuperação automática e preservação do destino protegido solicitado. O teste de elegibilidade é simulado; não representa detecção de desinstalação no sistema operacional.
