AXXIS CONTABILIDADE DIGITAL — SITE MULTIPÁGINAS
=================================================

COMO ABRIR
1. Extraia todo o ZIP.
2. Abra o arquivo index.html no navegador.
3. Para desenvolvimento, prefira executar a pasta com Live Server ou outro servidor local.

COMO ABRIR EM LOCALHOST (recomendado)
- Requer Node.js instalado (https://nodejs.org).
- No terminal, dentro desta pasta, rode: npm start
- Acesse http://localhost:5500 no navegador.
- O server.js é só um servidor estático simples (sem dependências, sem build);
  não altera nada do HTML/CSS/JS do site, apenas serve os arquivos como estão.

ESTRUTURA
- index.html ............. Home
- servicos.html .......... Serviços e abas interativas
- segmentos.html ......... Segmentos atendidos
- como-funciona.html ..... Processo de entrada e troca
- planos.html ............ Planos e níveis de atendimento
- sobre.html ............. Sobre a Axxis
- contato.html ........... Contato e formulário
- privacidade.html ....... Política de Privacidade
- termos.html ............ Termos de Uso
- assets/css/styles.css .. Estilos responsivos
- assets/js/main.js ...... Menu, modal, abas, FAQ, formulários e animações
- assets/img ............. Logo e ilustrações

MODAL DE ENTRADA
- Abre automaticamente no primeiro acesso da sessão.
- Não volta a aparecer ao navegar entre as páginas na mesma sessão.
- Para testar novamente, abra uma janela anônima ou apague no sessionStorage a chave:
  axxis-entry-modal-seen-v1
- Para desativar o modal em uma URL de teste, acrescente: ?modal=off

ANTES DE PUBLICAR
- Conectar os formulários ao CRM, WhatsApp, e-mail ou endpoint oficial.
- Inserir endereço, telefone, e-mail e demais redes sociais oficiais (CNPJ e Instagram já estão inseridos).
- Revisar privacidade.html e termos.html com o time jurídico antes de publicar (texto-base já implementado).
- Configurar domínio, hospedagem, analytics e ferramenta de consentimento, quando aplicável.

OBSERVAÇÃO
O projeto não depende de framework e pode ser hospedado como site estático.


ATUALIZAÇÃO VISUAL V2
---------------------
- Cabeçalho voltou ao visual limpo da primeira versão, sem faixa superior e sem linha laranja.
- Logo do cabeçalho foi reduzida.
- Menus Serviços e Segmentos foram mantidos com seus mega menus.
- Hero da home foi restaurada para a versão original: “Menos burocracia. Mais visão para decidir.”
- Seções e páginas novas de Serviços e Segmentos continuam no projeto.
- O modal automático de entrada continua ativo.
