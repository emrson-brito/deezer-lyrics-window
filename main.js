const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const DeezerMonitor = require('./src/deezerMonitor');
const LyricsService = require('./src/lyricsService');

let mainWindow;
let deezerMonitor;
let lyricsService;

// Busca e envia a letra de uma faixa (usado na troca de música e no refresh manual)
async function fetchAndSendLyrics(trackInfo) {
  if (!trackInfo || !lyricsService) return;
  try {
    const lyrics = await lyricsService.getLyrics(trackInfo.artist, trackInfo.title);

    if (mainWindow) {
      mainWindow.webContents.send('lyrics-update', { trackInfo, lyrics });
    }
  } catch (error) {
    console.error('Erro ao buscar letra:', error);
    if (mainWindow) {
      mainWindow.webContents.send('lyrics-error', { trackInfo, error: error.message });
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 350,
    height: 430,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    transparent: true,
    opacity: 0.95,
    icon: path.join(__dirname, 'favicon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  
  // Inicializar serviços
  lyricsService = new LyricsService();
  deezerMonitor = new DeezerMonitor();
  
  // Monitorar mudanças de música
  deezerMonitor.on('trackChanged', (trackInfo) => {
    console.log('Nova música detectada:', trackInfo);
    fetchAndSendLyrics(trackInfo);
  });

  // Monitorar posição de reprodução (para letras sincronizadas)
  deezerMonitor.on('positionUpdate', (position) => {
    if (mainWindow) {
      mainWindow.webContents.send('position-update', position);
    }
  });
  
  // Iniciar monitoramento
  deezerMonitor.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (deezerMonitor) {
    deezerMonitor.stop();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handlers IPC
ipcMain.handle('toggle-always-on-top', () => {
  if (mainWindow) {
    const isAlwaysOnTop = mainWindow.isAlwaysOnTop();
    mainWindow.setAlwaysOnTop(!isAlwaysOnTop);
    return !isAlwaysOnTop;
  }
  return false;
});

ipcMain.handle('minimize-window', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.handle('close-window', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

// Refresh manual: rebusca a letra da faixa atual (fallback caso algo tenha falhado)
ipcMain.handle('refresh-lyrics', async () => {
  const trackInfo = deezerMonitor ? deezerMonitor.getCurrentTrack() : null;
  if (!trackInfo) return false;
  await fetchAndSendLyrics(trackInfo);
  return true;
});
