var mangayomiSources = [
  {
    name: 'AnimeFire',
    langs: ['pt-br'],
    baseUrl: 'https://animefire.io',
    apiUrl: '',
    iconUrl: 'https://animefire.io/favicon.ico',
    typeSource: 'single',
    itemType: 1,
    version: '0.3.6',
    dateFormat: '',
    dateFormatLocale: 'pt-br',
    pkgPath: 'anime/src/pt-br/animefire.js',
  },
];

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this._client = null;
  }

  get client() {
    if (!this._client) this._client = new Client();
    return this._client;
  }

  get base() {
    return ((this.source && this.source.baseUrl) || 'https://animefire.io').replace(/\/$/, '');
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
    const image = anchor ? anchor.selectFirst('img') : null;
    return this.imageFromElement(image);
  }

  parseCards(doc) {
    const list = [];
    const seen = new Set();

    for (const anchor of doc.select('a[href*="/animes/"]')) {
      const link = this.animeLink(anchor.attr('href'));
      if (!link || seen.has(link)) continue;

      let name = this.clean(anchor.text);
      if (!name) name = this.clean(anchor.attr('title') || anchor.attr('aria-label'));
      if (!name) {
        const image = anchor.selectFirst('img');
        if (image) name = this.clean(image.attr('alt') || image.attr('title'));
      }

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

  slugifySearch(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' e ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async search(query, page) {
    const currentPage = Math.max(1, Number(page || 1));
    const keyword = String(query || '').trim();
    if (!keyword) return { list: [], hasNextPage: false };

    const slug = this.slugifySearch(keyword);
    const encoded = encodeURIComponent(keyword);
    const candidates = [];

    if (slug) candidates.push(this.base + '/pesquisar/' + slug);
    if (encoded && encoded !== slug) candidates.push(this.base + '/pesquisar/' + encoded);

    // Fallback for titles where the search route is indexed without separators.
    const compact = slug.replace(/-/g, '');
    if (compact && compact !== slug) candidates.push(this.base + '/pesquisar/' + compact);

    for (const baseUrl of candidates) {
      const url = currentPage > 1 ? baseUrl + '?page=' + currentPage : baseUrl;
      try {
        const result = await this.listPage(url, currentPage);
        if (result.list.length > 0) return result;
      } catch (error) {
        console.log('AnimeFire search candidate: ' + error);
      }
    }

    return { list: [], hasNextPage: false };
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
    const bodyText = this.clean((body && body.text) || '');

    let title = this.clean(
      (doc.selectFirst('h1') ? doc.selectFirst('h1').text : '') ||
      (doc.selectFirst('meta[property="og:title"]') ? doc.selectFirst('meta[property="og:title"]').attr('content') : '') ||
      (doc.selectFirst('title') ? doc.selectFirst('title').text : '') ||
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

    return Array.from(set);
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
    // Robust extractor for AnimeFire 0.8.3:
    //  - direct MP4/M3U8 URLs
    //  - AnimeFire /video endpoint JSON
    //  - Blogger video.g players, resolving VIDEO_CONFIG.streams[].play_url
    //  - nested player pages, without returning the player page itself as a
    //    playable source (which can cause Mangayomi to stay on "processing").
    const videos = [];
    const seen = new Set();

    const cleanUrl = (value) => {
      if (!value) return '';
      let v = String(value).trim()
        .replace(/\\u0026/gi, '&')
        .replace(/\\u003A/gi, ':')
        .replace(/\\u002F/gi, '/')
        .replace(/\\\//g, '/')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#x2F;/gi, '/')
        .replace(/&#47;/gi, '/');
      try { v = decodeURIComponent(v); } catch (_) {}
      if (v.startsWith('//')) v = 'https:' + v;
      return v;
    };

    const isMedia = (value) =>
      /\.(?:mp4|m3u8|m3u)(?:[?#]|$)/i.test(String(value || '')) ||
      /googlevideo\.com\/videoplayback/i.test(String(value || ''));

    const isBlogger = (value) =>
      /^https?:\/\/(?:www\.)?blogger\.com\/video\.g\?token=/i.test(String(value || ''));

    const addVideo = (value, label, referer) => {
      const mediaUrl = cleanUrl(value);
      if (!/^https?:\/\//i.test(mediaUrl) || !isMedia(mediaUrl)) return;
      if (seen.has(mediaUrl)) return;
      seen.add(mediaUrl);
      videos.push({
        url: mediaUrl,
        originalUrl: mediaUrl,
        quality: String(label || '').trim() || ('Fonte ' + (videos.length + 1)),
        headers: {
          'Referer': referer || this.base + '/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
          'Accept': '*/*',
        },
      });
    };

    const quality = (item, fallback) => {
      const text = String(item && (item.label || item.quality || item.resolution || item.format_id || '') || '');
      const m = text.match(/(2160|1440|1080|720|576|540|480|360)p?/i);
      return m ? m[1] + 'p' : (text || fallback);
    };

    // Blogger's public player stores the actual stream URLs in:
    // var VIDEO_CONFIG = { ..., "streams": [{"play_url": "...", "format_id": 18}] };
    // This is the key difference between "player opens" and a real playable URL.
    const extractBloggerConfig = (html, referer) => {
      const body = String(html || '');
      const patterns = [
        /var\s+VIDEO_CONFIG\s*=\s*(\{[\s\S]*?\})\s*;?/i,
        /VIDEO_CONFIG\s*=\s*(\{[\s\S]*?\})\s*;?/i,
      ];

      for (const pattern of patterns) {
        const match = body.match(pattern);
        if (!match) continue;

        let jsonText = match[1];
        try {
          // Blogger uses JSON with escaped unicode sequences.
          jsonText = jsonText
            .replace(/\\u0026/gi, '&')
            .replace(/\\u003A/gi, ':')
            .replace(/\\u002F/gi, '/')
            .replace(/\\\//g, '/');
          const config = JSON.parse(jsonText);
          const streams = Array.isArray(config.streams) ? config.streams : [];
          for (let i = 0; i < streams.length; i++) {
            const stream = streams[i] || {};
            const playUrl = stream.play_url || stream.url || stream.src;
            addVideo(playUrl, quality(stream, 'Blogger ' + (i + 1)), referer || 'https://www.blogger.com/');
          }
          if (streams.length > 0) return true;
        } catch (error) {
          console.log('AnimeFire Blogger VIDEO_CONFIG: ' + error);
        }
      }
      return false;
    };

    const addFromHtml = (html, doc, referer) => {
      const body = String(html || '');
      let before = videos.length;

      // 1) Resolve Blogger before generic extraction.
      extractBloggerConfig(body, referer);

      // 2) Direct media URLs in the HTML.
      for (const mediaUrl of this.extractMedia(body)) {
        addVideo(mediaUrl, 'Fonte', referer);
      }

      // 3) Inspect iframes/data attributes. Never return a player page as a
      // playable source; resolve it first.
      const candidates = [];
      if (doc) {
        for (const iframe of doc.select('iframe[src], iframe[data-src]')) {
          candidates.push(iframe.attr('src') || iframe.attr('data-src'));
        }
        for (const element of doc.select('[data-video-src], [data-video], [data-src], [data-url], [data-player], [data-embed], [data-iframe]')) {
          candidates.push(
            element.attr('data-video-src') || element.attr('data-video') ||
            element.attr('data-src') || element.attr('data-url') ||
            element.attr('data-player') || element.attr('data-embed') ||
            element.attr('data-iframe')
          );
        }
      }

      // Player URLs can also be embedded in scripts.
      const playerPatterns = [
        /https?:\\?\/\\?\/(?:www\.)?blogger\.com\/video\.g\?token=[^"'<>\\\s]+/gi,
        /https?:\\?\/\\?\/[^"'<>\\\s]*blogspot\.com\/[^"'<>\\\s]+/gi,
      ];
      for (const pattern of playerPatterns) {
        let m;
        while ((m = pattern.exec(body)) !== null) candidates.push(m[0]);
      }

      return { added: videos.length > before, players: candidates.map(cleanUrl).filter(u => /^https?:\/\//i.test(u)) };
    };

    const inspectUrl = async (target, referer, depth) => {
      if (!target || depth > 2) return;
      const cleanTarget = cleanUrl(target);
      if (!/^https?:\/\//i.test(cleanTarget)) return;

      try {
        const response = await this.client.get(cleanTarget, {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
          'Referer': referer || this.base + '/',
          'Accept': 'text/html,application/xhtml+xml,application/json,text/plain,*/*',
        });
        const body = String((response && response.body) || '');
        if (!body) return;

        // Blogger video.g is the important path for the episodes that used to
        // stay loading. Resolve streams[] directly.
        const bloggerResolved = isBlogger(cleanTarget) && extractBloggerConfig(body, cleanTarget);

        const result = addFromHtml(body, response && response.doc ? response.doc : null, cleanTarget);
        if (result.players && depth < 2) {
          const unique = Array.from(new Set(result.players));
          for (const p of unique.slice(0, 8)) {
            if (isBlogger(p) && p === cleanTarget) continue;
            await inspectUrl(p, cleanTarget, depth + 1);
          }
        }
      } catch (error) {
        console.log('AnimeFire inspect video: ' + error);
      }
    };

    // 1) Episode page.
    await inspectUrl(url, this.base + '/', 0);

    // 2) Legacy /video endpoint. Some AnimeFire pages expose the player only
    // through this endpoint; recursively inspect nested URLs in JSON/HTML.
    const match = String(url || '').match(/\/animes\/([^/?#]+)\/(\d+)\/?(?:[?#].*)?$/i);
    if (match) {
      const slug = match[1];
      const episode = match[2];
      const hosts = ['https://animefire.plus', 'https://animefire.io'];

      for (const host of hosts) {
        try {
          const endpoint = host + '/video/' + encodeURIComponent(slug) + '/' + episode;
          const response = await this.client.get(endpoint, {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
            'Referer': host + '/animes/' + slug + '/' + episode,
            'Accept': 'application/json,text/plain,text/html,*/*',
          });
          const body = String((response && response.body) || '').trim();
          if (!body) continue;

          let json = null;
          try { json = JSON.parse(body); } catch (_) {}

          const queue = [];
          const walk = (value, label) => {
            if (value == null) return;
            if (typeof value === 'string') {
              const u = cleanUrl(value);
              if (isMedia(u)) addVideo(u, label || 'Fonte', endpoint);
              else if (isBlogger(u) || /blogspot\.com/i.test(u)) queue.push(u);
              return;
            }
            if (Array.isArray(value)) {
              for (const item of value) walk(item, label);
              return;
            }
            if (typeof value === 'object') {
              const itemLabel = value.label || value.quality || value.resolution || value.format_id || label;
              for (const key of Object.keys(value)) walk(value[key], itemLabel);
            }
          };

          if (json) walk(json, 'Fonte');
          else {
            // First resolve VIDEO_CONFIG if the endpoint itself is a player.
            extractBloggerConfig(body, endpoint);
            const r = addFromHtml(body, null, endpoint);
            for (const p of r.players) queue.push(p);
          }

          for (const p of Array.from(new Set(queue)).slice(0, 8)) {
            await inspectUrl(p, endpoint, 1);
          }
        } catch (error) {
          console.log('AnimeFire video endpoint: ' + error);
        }
      }
    }

    // Highest resolution first.
    videos.sort((a, b) => {
      const av = Number((String(a.quality).match(/(2160|1440|1080|720|576|540|480|360)/) || ['', 0])[1]);
      const bv = Number((String(b.quality).match(/(2160|1440|1080|720|576|540|480|360)/) || ['', 0])[1]);
      return bv - av;
    });

    return videos;
  }
}

// Mangayomi JS runner compatibility: expose the provider with `var` so
// the host can resolve the historical global identifier `extention`.
var extention = new DefaultExtension();
var extension = extention;
