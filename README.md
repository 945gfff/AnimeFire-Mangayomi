# AnimeFire Mangayomi 0.8.3 — Stable 0.3.9

Base: STABLE-COMBINED 0.3.7 (the version reported working by the user).

Changes:
- Added functional Letra, Ano, Score mínimo and Classificação filters.
- Filters are applied through the current AnimeFire Top Animes catalog; a text query can also narrow the filtered results by title.
- Video extraction now reads AnimeFire `data-video-src`, HTML5 video/source tags, and Blogger player iframes before the older fallbacks.
- Blogger player URLs are accepted as a fallback because current AnimeFire scraping implementations use Blogger video URLs for some episodes.
- The global `var extention` structure is preserved.
