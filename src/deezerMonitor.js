const { EventEmitter } = require('events');
const { exec } = require('child_process');
const path = require('path');

/**
 * Monitora o aplicativo Deezer e detecta mudanças de música
 * Usa a Windows Media Session API via PowerShell
 */
class DeezerMonitor extends EventEmitter {
  constructor() {
    super();
    this.currentTrack = null;
    this.intervalId = null;
    this.checkInterval = 500;
    this.psScriptPath = path.join(__dirname, 'getMediaInfo.ps1');
  }

  /**
   * Inicia o monitoramento
   */
  start() {
    console.log('Iniciando monitoramento via Windows Media API...');
    this.intervalId = setInterval(() => {
      this.checkMediaInfo();
    }, this.checkInterval);
    
    // Verificar imediatamente
    this.checkMediaInfo();
  }

  /**
   * Para o monitoramento
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Monitoramento parado');
    }
  }

  /**
   * Verifica informações de mídia via Windows Media API
   */
  checkMediaInfo() {
    const psCommand = `powershell.exe -ExecutionPolicy Bypass -File "${this.psScriptPath}"`;
    
    exec(psCommand, { encoding: 'utf8', timeout: 5000 }, (error, stdout, stderr) => {
      if (error || !stdout.trim()) {
        // Sem mídia tocando ou erro
        if (this.currentTrack !== null) {
          this.currentTrack = null;
          console.log('Nenhuma mídia tocando');
        }
        return;
      }

      try {
        const mediaInfo = JSON.parse(stdout.trim());
        
        // Verificar se é do Deezer
        if (mediaInfo.Source && mediaInfo.Source.toLowerCase().includes('deezer')) {
          const trackInfo = {
            title: mediaInfo.Title || 'Desconhecido',
            artist: mediaInfo.Artist || 'Desconhecido',
            album: mediaInfo.Album || ''
          };

          if (this.hasTrackChanged(trackInfo)) {
            this.currentTrack = trackInfo;
            console.log('✓ Nova música detectada:', trackInfo);
            this.emit('trackChanged', trackInfo);
          }
          
          // Emitir atualização de posição para sincronização
          if (mediaInfo.Position !== undefined) {
            this.emit('positionUpdate', mediaInfo.Position);
          }
        }
      } catch (parseError) {
        console.error('Erro ao parsear JSON:', parseError.message);
      }
    });
  }

  /**
   * Verifica se a música mudou
   */
  hasTrackChanged(newTrack) {
    if (!this.currentTrack) {
      return true;
    }

    return (
      this.currentTrack.artist !== newTrack.artist ||
      this.currentTrack.title !== newTrack.title
    );
  }
}

module.exports = DeezerMonitor;
