const mangayomiSources = [
  {
    name: 'AnimeFire',
    langs: ['pt-br'],
    baseUrl: 'https://animefire.io',
    apiUrl: '',
    iconUrl: 'https://animefire.io/favicon.ico',
    typeSource: 'single',
    itemType: 1,
    version: '0.3.4',
    dateFormat: '',
    dateFormatLocale: 'pt-br',
    pkgPath: 'anime/src/pt-br/animefire.js',
  },
];

class DefaultExtension extends MProvider {
  #client;

  get client() {
    return this.#client ??= new Client();
  }

  get base() {
    return (this.source?.baseUrl || 'https://animefire.io').replace(/\/$/, '');
  }

  clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  abs(value, base = this.base) {
    if (!value) return '';

    let url = String(value).trim();
    url = url.replace(/^\\\//, '/').replace(/\\u0026/g, '&');

    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) return base + url;
    return base + '/' + url;
  }

  async document(url, referer = this.base + '/') {
    const response = await this.client.get(url, {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
      'Referer': referer,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    });

    if (!response || response.body == null) {
      throw new Error('AnimeFire: resposta vazia para ' + url);
    }

    return {
      body: String(response.body),
      doc: new Document(String(response.body)),
    };
  }

  animeLink(href) {
    const url = this.abs(href);
    return /^https?:\/\/[^/]+\/animes\/[^/?#]+\/?(?:\?[^#]*)?$/i.test(url)
      ? url.split('?')[0]
      : '';
  }

  episodeLink(href) {
    const url = this.abs(href);
    return /^https?:\/\/[^/]+\/animes\/[^/?#]+\/\d+\/?(?:\?[^#]*)?$/i.test(url)
      ? url.split('?')[0]
      : '';
  }

  imageFromElement(element) {
    if (!element) return '';

    const attrs = [
      'src',
      'data-src',
      'data-lazy-src',
      'data-original',
      'data-image',
      'data-poster',
      'data-cover',
    ];

    for (const attr of attrs) {
      const value = this.abs(element.attr(attr));
      if (value) return value;
    }

    const style = element.attr('style') || '';
    const match = style.match(/url\((?:"|')?([^\)"']+)(?:"|')?\)/i);
    return match ? this.abs(match[1]) : '';
  }

  cardImage(anchor) {
    const image = anchor?.selectFirst('img');
    return this.imageFromElement(image);
  }

  parseCards(doc) {
    const list = [];
    const seen = new Set();

    for (const anchor of doc.select('a[href*="/animes/"]')) {
      const link = this.animeLink(anchor.attr('href'));
      if (!link || seen.has(link)) continue;

      const name = this.clean(anchor.text);
      if (!name || /episódio\s+\d+/i.test(name)) continue;

      seen.add(link);
      list.push({
        name,
        url: link,
        link,
        imageUrl: this.cardImage(anchor),
      });
    }

    return list;
  }

  hasNextPage(doc, page) {
    const wanted = String(Number(page || 1) + 1);

    for (const anchor of doc.select('a[href]')) {
      const href = anchor.attr('href') || '';
      const text = this.clean(anchor.text).toLowerCase();
      const disabled = (anchor.attr('class') || '').toLowerCase().includes('disabled');

      if (disabled) continue;
      if (new RegExp('[?&]page=' + wanted + '(?:&|$)', 'i').test(href)) return true;
      if (text === 'próxima' || text === 'proxima' || text === 'next') return true;
    }

    return false;
  }

  async listPage(url, page) {
    try {
      const { doc } = await this.document(url);
      const list = this.parseCards(doc);
      return { list, hasNextPage: list.length > 0 && this.hasNextPage(doc, page) };
    } catch (error) {
      console.log('AnimeFire list: ' + error);
      return { list: [], hasNextPage: false };
    }
  }

  async getPopular(page) {
    const currentPage = Math.max(1, Number(page || 1));
    const url = currentPage === 1
      ? this.base + '/'
      : this.base + '/?page=' + currentPage;

    return this.listPage(url, currentPage);
  }

  async getLatestUpdates(page) {
    const currentPage = Math.max(1, Number(page || 1));
    const url = currentPage === 1
      ? this.base + '/em-lancamento'
      : this.base + '/em-lancamento?page=' + currentPage;

    return this.listPage(url, currentPage);
  }

  async getLatest(page) {
    return this.getLatestUpdates(page);
  }

  async search(query, page) {
    const currentPage = Math.max(1, Number(page || 1));
    const keyword = String(query || '').trim();
    if (!keyword) return { list: [], hasNextPage: false };

    const url = this.base + '/pesquisar/' + encodeURIComponent(keyword) +
      (currentPage > 1 ? '?page=' + currentPage : '');

    return this.listPage(url, currentPage);
  }

  getFilterList() {
    return [];
  }

  parseGenres(doc) {
    const genres = [];
    const seen = new Set();

    for (const anchor of doc.select('a[href*="/genero/"], a[href*="/generos/"], a[href*="/generos-"]')) {
      const genre = this.clean(anchor.text);
      if (!genre || seen.has(genre.toLowerCase())) continue;
      seen.add(genre.toLowerCase());
      genres.push(genre);
    }

    return genres;
  }

  parseStatus(text) {
    const value = this.clean(text).toLowerCase();

    if (/status do anime:\s*(completo|finalizado)/i.test(value)) return 1;
    if (/status do anime:\s*(cancelado|cancelada)/i.test(value)) return 3;
    if (/status do anime:\s*(hiato|pausado|pausada)/i.test(value)) return 2;
    if (/status do anime:\s*(em lançamento|em andamento|andamento)/i.test(value)) return 0;

    return 5;
  }

  parsePublishedDate(text) {
    const match = String(text || '').match(/Publicado\s+Dia:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
    if (!match) return null;

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const date = new Date(year, month - 1, day);

    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return null;
    }

    return String(date.getTime());
  }

  findDetailImage(doc) {
    const preferred = doc.selectFirst(
      '[class*="anime"] img, [class*="capa"] img, [class*="poster"] img, [class*="thumb"] img'
    );
    const preferredUrl = this.imageFromElement(preferred);
    if (preferredUrl) return preferredUrl;

    for (const image of doc.select('img')) {
      const url = this.imageFromElement(image);
      if (url && !/logo|avatar|icon|banner|favicon/i.test(url)) return url;
    }

    return '';
  }

  parseEpisodes(doc) {
    const episodes = [];
    const seen = new Set();

    for (const anchor of doc.select('a[href*="/animes/"]')) {
      const link = this.episodeLink(anchor.attr('href'));
      if (!link || seen.has(link)) continue;

      const match = link.match(/\/(\d+)\/?$/);
      if (!match) continue;

      const number = match[1];
      const name = this.clean(anchor.text) || 'Episódio ' + number;
      const dateText = this.clean(anchor.text);

      seen.add(link);
      episodes.push({
        name,
        url: link,
        dateUpload: this.parsePublishedDate(dateText),
      });
    }

    episodes.sort((a, b) => {
      const aNumber = Number((a.url.match(/\/(\d+)\/?$/) || ['', 0])[1]);
      const bNumber = Number((b.url.match(/\/(\d+)\/?$/) || ['', 0])[1]);
      return bNumber - aNumber;
    });

    return episodes;
  }

  async getDetail(url) {
    const { doc } = await this.document(url);
    const body = doc.selectFirst('body');
    const bodyText = this.clean(body?.text || '');

    let title = this.clean(
      doc.selectFirst('h1')?.text ||
      doc.selectFirst('meta[property="og:title"]')?.attr('content') ||
      doc.selectFirst('title')?.text ||
      ''
    );

    title = title
      .replace(/\s*-\s*Todos os Episódios.*$/i, '')
      .replace(/\s*-\s*Episódio\s+\d+.*$/i, '')
      .trim();

    let description = '';
    const synopsis = doc.selectFirst(
      '[class*="sinopse"], [class*="synopsis"], [itemprop="description"], meta[property="og:description"]'
    );

    if (synopsis) {
      description = this.clean(synopsis.attr('content') || synopsis.text);
    }

    if (!description) {
      const marker = bodyText.search(/Sinopse:/i);
      if (marker >= 0) {
        description = bodyText
          .substring(marker + 'Sinopse:'.length)
          .split(/Episódios/i)[0]
          .trim();
      }
    }

    return {
      name: title || 'AnimeFire',
      title: title || 'AnimeFire',
      link: url,
      description,
      author: '',
      artist: '',
      genre: this.parseGenres(doc),
      status: this.parseStatus(bodyText),
      imageUrl: this.findDetailImage(doc),
      episodes: this.parseEpisodes(doc),
    };
  }

  decodeUrl(value) {
    if (!value) return '';

    let url = String(value)
      .trim()
      .replace(/\\u0026/gi, '&')
      .replace(/\\u003A/gi, ':')
      .replace(/\\u002F/gi, '/')
      .replace(/\\\//g, '/')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#x2F;/gi, '/')
      .replace(/&#47;/gi, '/');

    try {
      url = decodeURIComponent(url);
    } catch (_) {
      // Keep the original value if it is not URI-encoded.
    }

    if (url.startsWith('//')) url = 'https:' + url;
    return url;
  }

  addMedia(set, value) {
    const url = this.decodeUrl(value);
    if (!/^https?:\/\//i.test(url)) return;

    if (/\.(?:m3u8|m3u|mp4)(?:[?#]|$)/i.test(url)) {
      set.add(url);
    }
  }

  extractMedia(text) {
    const set = new Set();
    const html = String(text || '');

    const patterns = [
      /https?:\\?\/\\?\/[^"'<>\\\s]+?\.(?:m3u8|m3u|mp4)(?:\?[^"'<>\\\s]*)?/gi,
      /(?:src|file|source|url|hls|playlist|video|stream|streamUrl|videoUrl|contentUrl)\s*[:=]\s*["']([^"']+)["']/gi,
      /(?:data-src|data-file|data-video|data-url|data-hls|data-playlist)\s*=\s*["']([^"']+)["']/gi,
      /<source[^>]+src\s*=\s*["']([^"']+)["']/gi,
      /<video[^>]+src\s*=\s*["']([^"']+)["']/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        this.addMedia(set, match[1] || match[0]);
      }
    }

    return [...set];
  }

  iframeUrls(doc) {
    const frames = [];
    const seen = new Set();

    const add = (value) => {
      const url = this.abs(value);
      if (!url || seen.has(url)) return;
      seen.add(url);
      frames.push(url);
    };

    for (const iframe of doc.select('iframe[src], iframe[data-src]')) {
      add(iframe.attr('src') || iframe.attr('data-src'));
    }

    for (const element of doc.select('[data-player], [data-embed], [data-iframe], a[href*="player"]')) {
      add(element.attr('data-player') || element.attr('data-embed') || element.attr('data-iframe') || element.attr('href'));
    }

    return frames;
  }

  qualityFromUrl(url, index) {
    const match = String(url).match(/(?:^|[._\/-])(2160|1440|1080|720|576|540|480|360)p?(?:[._?&\/-]|$)/i);
    return match ? match[1] + 'p' : 'Fonte ' + (index + 1);
  }

  async getVideoList(url) {
    // AnimeFire exposes the episode sources through a small JSON endpoint.
    // Older implementations only searched the HTML for .m3u8/.mp4 and
    // therefore returned an empty video list when the player was moved out
    // of the episode HTML.
    const media = [];
    const seen = new Set();

    const add = (value, label) => {
      const source = this.decodeUrl(value);
      if (!source || !/^https?:\/\//i.test(source)) return;
      if (seen.has(source)) return;

      // The endpoint can return direct MP4/HLS URLs as well as GoogleVideo
      // URLs with signed query parameters. Keep the full URL; stripping the
      // query string would invalidate signed streams.
      if (/(?:\.m3u8|\.m3u|\.mp4)(?:[?#]|$)/i.test(source) ||
          /googlevideo\.com/i.test(source) ||
          /\/(?:video|stream|file)\//i.test(source)) {
        seen.add(source);
        media.push({ url: source, quality: label || this.qualityFromUrl(source, media.length) });
      }
    };

    const episodeMatch = String(url).match(/\/animes\/([^/?#]+)\/(\d+)\/?(?:[?#]|$)/i);

    if (episodeMatch) {
      const slug = episodeMatch[1];
      const episode = episodeMatch[2];
      const domains = [];

      // .io is the current site; .plus is kept as a compatibility fallback
      // because the historical AnimeFire API used that domain.
      domains.push(this.base);
      if (/animefire\.io$/i.test(this.base)) domains.push('https://animefire.plus');

      for (const domain of domains) {
        if (media.length >= 12) break;

        try {
          const apiUrl = domain + '/video/' + encodeURIComponent(slug) + '/' + episode;
          const response = await this.client.get(apiUrl, {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
            'Referer': url,
            'Accept': 'application/json,text/plain,*/*',
          });

          const body = String(response?.body || '');
          let json = null;
          try { json = JSON.parse(body); } catch (_) {}

          if (json && Array.isArray(json.data)) {
            for (const item of json.data) {
              if (!item) continue;
              add(item.src || item.url || item.file || item.source, item.label || item.resolution || item.quality);
            }
          } else {
            // Some mirrors return the JSON embedded in a script tag.
            const matches = body.match(/https?:\\?\/\\?\/[^\"'<>\\s]+/gi) || [];
            for (const candidate of matches) add(candidate, null);
          }
        } catch (error) {
          console.log('AnimeFire video API: ' + error);
        }
      }
    }

    // Fallback: inspect the episode page and public player frames.
    if (media.length === 0) {
      try {
        const first = await this.document(url, this.base + '/');
        for (const source of this.extractMedia(first.body)) add(source, null);

        const frames = this.iframeUrls(first.doc);
        for (const frame of frames.slice(0, 8)) {
          if (media.length >= 12) break;
          try {
            const nested = await this.document(frame, url);
            for (const source of this.extractMedia(nested.body)) add(source, null);
          } catch (error) {
            console.log('AnimeFire player: ' + error);
          }
        }
      } catch (error) {
        console.log('AnimeFire episode: ' + error);
      }
    }

    return media.map((item, index) => ({
      url: item.url,
      originalUrl: item.url,
      quality: item.quality || this.qualityFromUrl(item.url, index),
    }));
  }
}

// Mangayomi's JS runner expects an instantiated provider. Keep both spellings
// because older 0.8.x builds used the historical `extention` identifier.
const extension = new DefaultExtension();
const extention = extension;
