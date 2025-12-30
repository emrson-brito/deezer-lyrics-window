const axios = require('axios');

/**
 * Serviço para buscar letras de músicas
 * Usa lrclib.net para letras sincronizadas e lyrics.ovh como fallback
 */
class LyricsService {
  constructor() {
    this.lrclibUrl = 'https://lrclib.net/api';
    this.lyricsOvhUrl = 'https://api.lyrics.ovh/v1';
  }

  /**
   * Busca a letra de uma música (tenta sincronizada primeiro)
   * @param {string} artist - Nome do artista
   * @param {string} title - Título da música
   * @returns {Promise<Object>} - Objeto com letra e informações de sincronização
   */
  async getLyrics(artist, title) {
    try {
      console.log(`Buscando letra: ${artist} - ${title}`);
      
      // Limpar nome do artista e título
      const cleanArtist = this.cleanSearchTerm(artist);
      const cleanTitle = this.cleanSearchTerm(title);

      // Tentar buscar letra sincronizada primeiro
      try {
        const syncedLyrics = await this.getSyncedLyrics(cleanArtist, cleanTitle);
        if (syncedLyrics) {
          console.log('✓ Letra sincronizada encontrada!');
          return syncedLyrics;
        }
      } catch (error) {
        console.log('Letra sincronizada não disponível, tentando letra simples...');
      }

      // Fallback: buscar letra simples
      const simpleLyrics = await this.getSimpleLyrics(cleanArtist, cleanTitle);
      return simpleLyrics;
      
    } catch (error) {
      throw new Error(`Erro ao buscar letra: ${error.message}`);
    }
  }

  /**
   * Busca letra sincronizada (LRC format)
   */
  async getSyncedLyrics(artist, title) {
    const url = `${this.lrclibUrl}/search?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
    
    const response = await axios.get(url, { timeout: 10000 });

    if (response.data && response.data.length > 0) {
      const track = response.data[0];
      
      if (track.syncedLyrics) {
        return {
          synced: true,
          lrc: track.syncedLyrics,
          plain: track.plainLyrics || this.parseLrcToPlain(track.syncedLyrics),
          lines: this.parseLrc(track.syncedLyrics)
        };
      }
    }

    return null;
  }

  /**
   * Busca letra simples (fallback)
   */
  async getSimpleLyrics(artist, title) {
    const url = `${this.lyricsOvhUrl}/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    
    const response = await axios.get(url, { timeout: 10000 });

    if (response.data && response.data.lyrics) {
      return {
        synced: false,
        plain: response.data.lyrics,
        lines: []
      };
    }

    throw new Error('Letra não encontrada');
  }

  /**
   * Converte LRC para texto simples
   */
  parseLrcToPlain(lrc) {
    return lrc
      .split('\n')
      .map(line => line.replace(/^\[\d{2}:\d{2}\.\d{2,3}\]/, '').trim())
      .filter(line => line)
      .join('\n');
  }

  /**
   * Parse LRC format para array de objetos com tempo e texto
   */
  parseLrc(lrc) {
    const lines = [];
    const lrcLines = lrc.split('\n');

    for (const line of lrcLines) {
      const match = line.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)$/);
      if (match) {
        const minutes = parseInt(match[1]);
        const seconds = parseInt(match[2]);
        const milliseconds = parseInt(match[3].padEnd(3, '0'));
        const text = match[4].trim();

        if (text) {
          const timeInSeconds = minutes * 60 + seconds + milliseconds / 1000;
          lines.push({
            time: timeInSeconds,
            text: text
          });
        }
      }
    }

    return lines;
  }

  /**
   * Limpa termos de busca removendo caracteres especiais e extras
   */
  cleanSearchTerm(term) {
    return term
      .replace(/\(.*?\)/g, '') // Remove conteúdo entre parênteses
      .replace(/\[.*?\]/g, '') // Remove conteúdo entre colchetes
      .replace(/feat\.|ft\.|featuring/gi, '') // Remove "feat."
      .replace(/[^\w\s]/g, '') // Remove caracteres especiais
      .trim();
  }
}

module.exports = LyricsService;
