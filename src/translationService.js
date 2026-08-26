const axios = require('axios');

/**
 * Serviço de tradução das letras.
 *
 * Usa o endpoint público do Google Translate (client=gtx), que não exige chave.
 * A tradução é feita LINHA A LINHA para manter o alinhamento 1:1 com a letra
 * sincronizada: cada linha traduzida precisa cair exatamente sob a linha
 * original correspondente.
 *
 * Para não disparar uma requisição por linha, as linhas são agrupadas em lotes
 * unidos por "\n". Se o serviço devolver um número diferente de linhas (pode
 * acontecer quando ele reagrupa frases), aquele lote é refeito linha a linha.
 */
class TranslationService {
  constructor(targetLang = 'pt-BR') {
    this.apiUrl = 'https://translate.googleapis.com/translate_a/single';
    this.targetLang = targetLang;

    // Cache por linha: refrões repetidos e músicas revisitadas não custam rede
    this.cache = new Map();
    this.maxCacheEntries = 5000;

    // Limites do lote (a requisição é GET: o texto vai na query string)
    this.maxChunkChars = 1200;
    this.maxChunkLines = 20;
    this.concurrency = 4;
  }

  /**
   * Traduz um array de linhas preservando os índices.
   *
   * @param {string[]} texts - Linhas originais (linhas vazias são preservadas)
   * @returns {Promise<Object>} - { detectedLang, translations }
   *   `translations` é um array do mesmo tamanho de `texts` (posições sem
   *   tradução ficam null), ou null quando a letra já está no idioma alvo.
   */
  async translateLines(texts) {
    if (!Array.isArray(texts) || texts.length === 0) {
      return { detectedLang: null, translations: null };
    }

    const translations = new Array(texts.length).fill(null);

    // Índices que realmente precisam de tradução (não vazios e fora do cache)
    const pending = [];
    for (let i = 0; i < texts.length; i++) {
      const text = (texts[i] || '').trim();
      if (!text) continue;

      const cached = this.cache.get(this.cacheKey(text));
      if (cached !== undefined) {
        translations[i] = cached;
      } else {
        pending.push({ index: i, text });
      }
    }

    if (pending.length === 0) {
      return { detectedLang: null, translations };
    }

    const chunks = this.buildChunks(pending);

    // O primeiro lote é feito sozinho para detectar o idioma: se a letra já
    // estiver em português, não faz sentido gastar rede com o resto.
    const first = await this.translateChunk(chunks[0]);
    if (first.detectedLang && first.detectedLang.toLowerCase().startsWith('pt')) {
      return { detectedLang: first.detectedLang, translations: null };
    }
    this.applyChunkResult(chunks[0], first.translations, translations);

    await this.runWithConcurrency(chunks.slice(1), async (chunk) => {
      const result = await this.translateChunk(chunk);
      this.applyChunkResult(chunk, result.translations, translations);
    });

    return { detectedLang: first.detectedLang, translations };
  }

  /**
   * Agrupa as linhas pendentes em lotes respeitando os limites de tamanho
   */
  buildChunks(pending) {
    const chunks = [];
    let current = [];
    let currentChars = 0;

    for (const item of pending) {
      const cost = item.text.length + 1;
      const wouldOverflow =
        current.length >= this.maxChunkLines ||
        (current.length > 0 && currentChars + cost > this.maxChunkChars);

      if (wouldOverflow) {
        chunks.push(current);
        current = [];
        currentChars = 0;
      }

      current.push(item);
      currentChars += cost;
    }

    if (current.length > 0) {
      chunks.push(current);
    }

    return chunks;
  }

  /**
   * Traduz um lote. Se o alinhamento quebrar, refaz linha a linha.
   */
  async translateChunk(chunk) {
    const joined = chunk.map((item) => item.text).join('\n');

    try {
      const result = await this.requestTranslation(joined);
      const parts = result.text.split('\n').map((part) => part.trim());

      if (parts.length === chunk.length) {
        return { detectedLang: result.detectedLang, translations: parts };
      }

      // Alinhamento quebrado: o serviço reagrupou as frases
      const perLine = await this.translateLineByLine(chunk);
      return { detectedLang: result.detectedLang, translations: perLine };
    } catch (error) {
      console.log(`Tradução indisponível para um trecho: ${error.message}`);
      return { detectedLang: null, translations: new Array(chunk.length).fill(null) };
    }
  }

  /**
   * Fallback: uma requisição por linha (garante alinhamento)
   */
  async translateLineByLine(chunk) {
    const translations = new Array(chunk.length).fill(null);

    await this.runWithConcurrency(
      chunk.map((item, position) => ({ item, position })),
      async ({ item, position }) => {
        try {
          const result = await this.requestTranslation(item.text);
          translations[position] = result.text.trim();
        } catch (error) {
          translations[position] = null;
        }
      }
    );

    return translations;
  }

  /**
   * Grava o resultado de um lote no array final e no cache
   */
  applyChunkResult(chunk, chunkTranslations, translations) {
    if (!chunkTranslations) return;

    chunk.forEach((item, position) => {
      const translated = chunkTranslations[position];
      if (!translated) return;

      translations[item.index] = translated;
      this.setCache(item.text, translated);
    });
  }

  /**
   * Chamada única ao endpoint de tradução
   */
  async requestTranslation(text) {
    const response = await axios.get(this.apiUrl, {
      params: {
        client: 'gtx',
        sl: 'auto',
        tl: this.targetLang,
        dt: 't',
        q: text
      },
      timeout: 10000
    });

    const data = response.data;
    if (!Array.isArray(data) || !Array.isArray(data[0])) {
      throw new Error('Resposta de tradução inesperada');
    }

    // data[0] traz os segmentos traduzidos; data[2] o idioma detectado
    const translated = data[0]
      .map((segment) => (Array.isArray(segment) ? segment[0] || '' : ''))
      .join('');

    return { text: translated, detectedLang: typeof data[2] === 'string' ? data[2] : null };
  }

  /**
   * Executa tarefas com um teto de requisições simultâneas
   */
  async runWithConcurrency(items, worker) {
    if (items.length === 0) return;

    let cursor = 0;
    const runners = new Array(Math.min(this.concurrency, items.length))
      .fill(null)
      .map(async () => {
        while (cursor < items.length) {
          const item = items[cursor++];
          await worker(item);
        }
      });

    await Promise.all(runners);
  }

  cacheKey(text) {
    return `${this.targetLang}::${text}`;
  }

  setCache(text, translated) {
    // Cache simples com teto: ao encher, descarta a entrada mais antiga
    if (this.cache.size >= this.maxCacheEntries) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
    this.cache.set(this.cacheKey(text), translated);
  }
}

module.exports = TranslationService;
