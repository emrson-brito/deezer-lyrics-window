const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');

/**
 * Monitora o aplicativo Deezer e detecta mudanças de música.
 *
 * Em vez de relançar o PowerShell a cada poll (o que sobrecarregava a CPU),
 * mantém UM ÚNICO processo PowerShell persistente que inicializa a Windows
 * Media Session API uma vez e emite uma linha JSON por intervalo.
 *
 * A posição de reprodução é interpolada em JavaScript (aritmética pura) entre
 * as leituras reais, então as letras sincronizadas continuam suaves sem custo.
 */
class DeezerMonitor extends EventEmitter {
  constructor() {
    super();
    this.currentTrack = null;
    this.psScriptPath = path.join(__dirname, 'getMediaInfo.ps1');

    // Intervalo de leitura real do PowerShell (ms)
    this.pollIntervalMs = 1000;

    // Processo e estado de ciclo de vida
    this.psProcess = null;
    this.stopping = false;
    this.restartTimer = null;

    // Watchdog: se o PowerShell parar de emitir linhas (ex.: trava em transição
    // de faixa), reiniciamos o processo para o app não "morrer".
    this.lastLineAt = 0;
    this.watchdogTimer = null;
    this.watchdogIntervalMs = 2000;
    this.staleThresholdMs = 6000;

    // Estado para interpolação de posição
    this.lastPosition = 0;
    this.lastPositionAt = 0;
    this.isPlaying = false;
    this.positionTimer = null;
    this.positionTickMs = 250;
  }

  /**
   * Inicia o monitoramento
   */
  start() {
    console.log('Iniciando monitoramento via Windows Media API (processo persistente)...');
    this.stopping = false;
    this.lastLineAt = Date.now();
    this.spawnProcess();
    this.startPositionInterpolation();
    this.startWatchdog();
  }

  /**
   * Para o monitoramento e encerra o processo PowerShell
   */
  stop() {
    this.stopping = true;

    if (this.positionTimer) {
      clearInterval(this.positionTimer);
      this.positionTimer = null;
    }
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.psProcess) {
      this.psProcess.kill();
      this.psProcess = null;
    }

    console.log('Monitoramento parado');
  }

  /**
   * Sobe o processo PowerShell persistente e conecta a leitura de stdout
   */
  spawnProcess() {
    this.psProcess = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', this.psScriptPath,
        '-IntervalMs', String(this.pollIntervalMs)
      ],
      { windowsHide: true }
    );

    const rl = readline.createInterface({ input: this.psProcess.stdout });
    rl.on('line', (line) => this.handleLine(line));

    this.psProcess.on('error', (err) => {
      console.error('Erro no processo PowerShell:', err.message);
    });

    this.psProcess.on('exit', (code) => {
      this.psProcess = null;
      if (!this.stopping) {
        console.warn(`Processo PowerShell encerrou (código ${code}); reiniciando em 2s...`);
        this.restartTimer = setTimeout(() => this.spawnProcess(), 2000);
      }
    });
  }

  /**
   * Processa uma linha JSON emitida pelo PowerShell
   */
  handleLine(line) {
    // Qualquer linha recebida prova que o PowerShell está vivo e respondendo.
    this.lastLineAt = Date.now();

    const text = line.trim();
    if (!text) return;

    let mediaInfo;
    try {
      mediaInfo = JSON.parse(text);
    } catch (parseError) {
      return;
    }

    // Sem mídia ou mídia não-Deezer
    if (!mediaInfo || !mediaInfo.Source || !mediaInfo.Source.toLowerCase().includes('deezer')) {
      if (this.currentTrack !== null) {
        this.currentTrack = null;
        this.isPlaying = false;
        console.log('Nenhuma mídia do Deezer tocando');
      }
      return;
    }

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

    // Atualiza a base de interpolação com a leitura real
    this.isPlaying = mediaInfo.Status === 'Playing';

    if (mediaInfo.Position !== undefined && mediaInfo.Position !== null) {
      this.lastPosition = mediaInfo.Position;
      this.lastPositionAt = Date.now();
      // Correção imediata da posição na UI
      this.emit('positionUpdate', this.lastPosition);
    }
  }

  /**
   * Emite atualizações de posição interpoladas entre as leituras reais.
   * É apenas aritmética — sem processos nem chamadas de sistema.
   */
  startPositionInterpolation() {
    this.positionTimer = setInterval(() => {
      if (!this.isPlaying || !this.lastPositionAt) return;
      const elapsed = (Date.now() - this.lastPositionAt) / 1000;
      this.emit('positionUpdate', this.lastPosition + elapsed);
    }, this.positionTickMs);
  }

  /**
   * Watchdog: se o PowerShell ficar mudo por tempo demais (trava em transição de
   * faixa, por exemplo), mata o processo. O handler de 'exit' cuida do restart.
   */
  startWatchdog() {
    this.watchdogTimer = setInterval(() => {
      if (this.stopping || !this.psProcess) return;
      if (Date.now() - this.lastLineAt > this.staleThresholdMs) {
        console.warn('Watchdog: PowerShell travado (sem dados). Reiniciando...');
        this.lastLineAt = Date.now(); // evita matar em sequência durante o restart
        this.psProcess.kill();
      }
    }, this.watchdogIntervalMs);
  }

  /**
   * Faixa atual conhecida (usada pelo refresh manual de letra)
   */
  getCurrentTrack() {
    return this.currentTrack;
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
