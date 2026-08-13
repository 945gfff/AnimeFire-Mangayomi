# AnimeFire — extensão para Mangayomi 0.8.3

Repositório remoto para a fonte AnimeFire.

## Estrutura

```text
anime_index.json
SHA256.txt
README.md
javascript/anime/src/pt-br/animefire.js
```

## URL do índice

`https://raw.githubusercontent.com/945gfff/AnimeFire-Mangayomi/refs/heads/principal/anime_index.json`

## Fonte

A extensão usa as páginas públicas do AnimeFire para pesquisa, detalhes e episódios. Para vídeo, procura URLs MP4/M3U8 e, quando a página expõe um player público (por exemplo, um iframe Blogger), pode devolver o URL do player ao Mangayomi. Não contorna DRM, login ou proteções de acesso.
