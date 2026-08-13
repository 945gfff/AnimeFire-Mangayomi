# AnimeFire — repositório de extensão para Mangayomi

Este repositório foi preparado no formato de repositório remoto do Mangayomi.

## Estrutura

```text
anime_index.json
javascript/
└── anime/
    └── src/
        └── pt-br/
            └── animefire.js
```

## Antes de publicar

1. Crie um repositório público no GitHub chamado `AnimeFire-Mangayomi`.
2. Envie estes arquivos mantendo a estrutura das pastas.
3. Abra `anime_index.json`.
4. Substitua `SEU_USUARIO` pelo seu nome de utilizador do GitHub.
5. Salve.

Depois, no Mangayomi, o endereço do repositório será:

`https://raw.githubusercontent.com/SEU_USUARIO/AnimeFire-Mangayomi/main/anime_index.json`

O Mangayomi utiliza um índice JSON para descobrir fontes e carrega o código indicado por `sourceCodeUrl`. A documentação atual descreve esse modelo e classifica anime com `itemType = 1`; fontes JavaScript podem ser carregadas remotamente pelo índice. 

## O que esta fonte implementa

- Pesquisa
- Popular/início
- Em lançamento
- Detalhes
- Sinopse
- Géneros
- Capas
- Episódios
- Reprodução através de URLs diretas expostas pelo episódio/player
- Consulta o endpoint `/video/{slug}/{episódio}` para obter as fontes reais
- Suporte a MP4, HLS e URLs GoogleVideo assinadas
- Fallback para HTML e iframes públicos
- Procura em iframes públicos

## Importante sobre download

O botão de download do Mangayomi só poderá funcionar quando a fonte disponibilizar um URL de mídia que o Mangayomi consiga consumir. Esta extensão não contorna DRM, login, paywall ou outras proteções.

## Instalação no Mangayomi

Depois de publicar no GitHub:

**Mangayomi → Mais → Definições → Browse → adicionar repositório**

Cole:

`https://raw.githubusercontent.com/SEU_USUARIO/AnimeFire-Mangayomi/main/anime_index.json`

Depois procure por **AnimeFire** e instale/ative a fonte.

