# AnimeFire — Mangayomi 0.8.3

Versão 0.3.5.

Esta versão preserva a estrutura global da versão 0.3.3 que eliminou o erro `extention is not defined` e altera somente a extração de vídeo.

O extractor consulta primeiro o endpoint público `/video/{slug}/{episódio}`, que retorna fontes com `src` e `label`, e usa a página do episódio/player como fallback.


## Correção de pesquisa 0.3.5
A busca tenta a rota slugificada do AnimeFire, a rota codificada e uma variante compacta, além de aceitar cards cujo nome vem de `title`, `aria-label` ou `img alt`.
