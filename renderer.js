const trackTitle = document.getElementById('trackTitle');
const trackArtist = document.getElementById('trackArtist');
const lyricsContainer = document.getElementById('lyricsContainer');
const pinButton = document.getElementById('pinButton');
const minimizeButton = document.getElementById('minimizeButton');
const closeButton = document.getElementById('closeButton');

let isPinned = true;
let currentLyrics = null;
let currentPosition = 0;

// Atualizar letras quando houver mudança
window.electronAPI.onLyricsUpdate((data) => {
  const { trackInfo, lyrics } = data;
  
  // Atualizar informações da música
  trackTitle.textContent = trackInfo.title || 'Música desconhecida';
  trackArtist.textContent = trackInfo.artist || 'Artista desconhecido';
  
  currentLyrics = lyrics;
  
  // Verificar se é letra sincronizada
  if (lyrics.synced && lyrics.lines && lyrics.lines.length > 0) {
    console.log('✓ Exibindo letra sincronizada');
    renderSyncedLyrics(lyrics.lines);
  } else if (lyrics.plain) {
    console.log('Exibindo letra simples');
    lyricsContainer.innerHTML = `<div class="lyrics-text">${escapeHtml(lyrics.plain)}</div>`;
  } else {
    lyricsContainer.innerHTML = '<div class="waiting-message"><p>Letra não encontrada</p></div>';
  }
  
  // Scroll to top
  lyricsContainer.scrollTop = 0;
});

// Atualizar posição de reprodução
window.electronAPI.onPositionUpdate((position) => {
  currentPosition = position;
  
  // Se temos letra sincronizada, atualizar destaque
  if (currentLyrics && currentLyrics.synced) {
    updateSyncedLyrics(position);
  }
});

// Tratar erros
window.electronAPI.onLyricsError((data) => {
  const { trackInfo, error } = data;
  
  trackTitle.textContent = trackInfo.title || 'Música desconhecida';
  trackArtist.textContent = trackInfo.artist || 'Artista desconhecido';
  
  lyricsContainer.innerHTML = `<div class="error-message"><p>Erro ao buscar letra:<br>${escapeHtml(error)}</p></div>`;
});

// Renderizar letras sincronizadas
function renderSyncedLyrics(lines) {
  const html = lines.map((line, index) => {
    return `<div class="lyric-line" data-time="${line.time}" data-index="${index}">${escapeHtml(line.text)}</div>`;
  }).join('');
  
  lyricsContainer.innerHTML = `
    <div class="countdown-container" style="display: none;">
      <div class="countdown-text">A letra começa em</div>
      <div class="countdown-timer">0:00</div>
      <div class="countdown-progress-bar">
        <div class="countdown-progress-fill"></div>
      </div>
    </div>
    <div class="lyrics-synced">${html}</div>
  `;
}

// Atualizar destaque das letras sincronizadas
function updateSyncedLyrics(position) {
  const lines = document.querySelectorAll('.lyric-line');
  if (lines.length === 0) return;
  
  const countdownContainer = document.querySelector('.countdown-container');
  const countdownTimer = document.querySelector('.countdown-timer');
  const countdownProgressFill = document.querySelector('.countdown-progress-fill');
  const firstLineTime = parseFloat(lines[0].getAttribute('data-time'));
  
  // Se ainda não chegou na primeira linha, mostrar contador
  if (position < firstLineTime) {
    const timeUntilStart = firstLineTime - position;
    const minutes = Math.floor(timeUntilStart / 60);
    const seconds = Math.floor(timeUntilStart % 60);
    
    if (countdownContainer && countdownTimer) {
      countdownContainer.style.display = 'flex';
      countdownTimer.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      
      // Atualizar barra de progresso
      if (countdownProgressFill) {
        const progressPercentage = (timeUntilStart / firstLineTime) * 100;
        countdownProgressFill.style.width = `${progressPercentage}%`;
      }
    }
    
    // Esconder todas as linhas
    lines.forEach(line => line.classList.remove('active'));
    return;
  }
  
  // Esconder contador quando a letra começar
  if (countdownContainer) {
    countdownContainer.style.display = 'none';
  }
  
  let activeIndex = -1;
  
  // Encontrar a linha atual baseada na posição
  for (let i = 0; i < lines.length; i++) {
    const lineTime = parseFloat(lines[i].getAttribute('data-time'));
    if (position >= lineTime) {
      activeIndex = i;
    } else {
      break;
    }
  }
  
  // Remover classe active de todas as linhas
  lines.forEach(line => {
    line.classList.remove('active');
  });
  
  // Adicionar classe active na linha atual
  if (activeIndex >= 0) {
    const activeLine = lines[activeIndex];
    activeLine.classList.add('active');
    
    // Auto-scroll para centralizar a linha ativa
    const containerHeight = lyricsContainer.clientHeight;
    const lineTop = activeLine.offsetTop;
    const lineHeight = activeLine.clientHeight;
    const scrollTo = lineTop - (containerHeight / 2) + (lineHeight / 2);
    
    lyricsContainer.scrollTo({
      top: scrollTo,
      behavior: 'smooth'
    });
  }
}

// Toggle always on top
pinButton.addEventListener('click', async () => {
  isPinned = await window.electronAPI.toggleAlwaysOnTop();
  pinButton.classList.toggle('pinned', isPinned);
  pinButton.title = isPinned ? 'Fixado no topo' : 'Não fixado';
});

// Window controls
minimizeButton.addEventListener('click', () => {
  window.electronAPI.minimizeWindow();
});

closeButton.addEventListener('click', () => {
  window.electronAPI.closeWindow();
});

// Função auxiliar para escapar HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
