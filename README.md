# AnimeFire Mangayomi 0.8.3 – VIDEO MULTI SOURCE 0.3.6

Baseado no SEARCH-FIX estável. A pesquisa e a exposição `extention` foram preservadas.

A versão 0.3.6 altera apenas a extração de vídeo: aceita múltiplas estruturas JSON, fontes MP4/M3U8 e Google Video/videoplayback, além de varrer a página do episódio e iframes. O resultado de `getVideoList()` contém somente `url`, `originalUrl` e `quality`, conforme a documentação JS do Mangayomi.
