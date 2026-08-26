const trackTitle = document.getElementById('trackTitle');
const trackArtist = document.getElementById('trackArtist');
const lyricsContainer = document.getElementById('lyricsContainer');
const pinButton = document.getElementById('pinButton');
const refreshButton = document.getElementById('refreshButton');
const translateButton = document.getElementById('translateButton');
const minimizeButton = document.getElementById('minimizeButton');
const closeButton = document.getElementById('closeButton');

let isPinned = true;
let currentLyrics = null;
let currentPosition = 0;
let currentActiveIndex = -1;

// Chave da faixa exibida: traduções que chegam atrasadas (de uma música que já
// trocou) são descartadas.
let currentTrackKey = null;

// Atualizar letras quando houver mudança
window.electronAPI.onLyricsUpdate((data) => {
  const { trackInfo, lyrics } = data;

  // Atualizar informações da música
  trackTitle.textContent = trackInfo.title || 'Música desconhecida';
  trackArtist.textContent = trackInfo.artist || 'Artista desconhecido';

  currentLyrics = lyrics;
  currentActiveIndex = -1; // Reset do destaque ao trocar de música
  currentTrackKey = `${trackInfo.artist} - ${trackInfo.title}`;

  // Verificar se é letra sincronizada
  if (lyrics.synced && lyrics.lines && lyrics.lines.length > 0) {
    console.log('✓ Exibindo letra sincronizada');
    renderSyncedLyrics(lyrics.lines);
  } else if (lyrics.plain) {
    console.log('Exibindo letra simples');
    renderPlainLyrics(lyrics.plain);
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

  // Limpa o estado da letra anterior para não ficar preso ao trocar de música
  currentLyrics = null;
  currentActiveIndex = -1;

  lyricsContainer.innerHTML = `<div class="error-message"><p>Erro ao buscar letra:<br>${escapeHtml(error)}</p></div>`;
});

// Aplicar tradução recebida sobre a letra já exibida
window.electronAPI.onTranslationUpdate((data) => {
  const { trackKey, translations } = data;

  // Tradução de outra música (chegou depois da troca de faixa)
  if (trackKey !== currentTrackKey) return;

  // Letra já está em português: nada a mostrar
  if (!translations) return;

  const targets = document.querySelectorAll('.lyric-translation');
  targets.forEach((target) => {
    const index = parseInt(target.getAttribute('data-index'), 10);
    const translated = translations[index];
    if (!translated) return;

    target.textContent = translated;
    target.classList.add('visible');
  });
});

// Renderizar letras sincronizadas
function renderSyncedLyrics(lines) {
  const html = lines.map((line, index) => {
    return `<div class="lyric-line" data-time="${line.time}" data-index="${index}">` +
      `<span class="lyric-original">${escapeHtml(line.text)}</span>` +
      `<span class="lyric-translation" data-index="${index}"></span>` +
      `</div>`;
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

// Renderizar letra simples (sem sincronia) linha a linha, para que a tradução
// possa ser encaixada sob cada verso
function renderPlainLyrics(plain) {
  const html = plain.split('\n').map((text, index) => {
    if (!text.trim()) {
      return '<div class="plain-line empty"></div>';
    }

    return `<div class="plain-line">` +
      `<span class="lyric-original">${escapeHtml(text)}</span>` +
      `<span class="lyric-translation" data-index="${index}"></span>` +
      `</div>`;
  }).join('');

  lyricsContainer.innerHTML = `<div class="lyrics-text">${html}</div>`;
}

// Atualizar destaque das letras sincronizadas
function updateSyncedLyrics(position) {
  const lines = document.querySelectorAll('.lyric-line');
  if (lines.length === 0) return;

  const firstLineTime = parseFloat(lines[0].getAttribute('data-time'));

  // Se ainda não chegou na primeira linha, mostrar contador
  if (position < firstLineTime) {
    updateCountdown(position, firstLineTime);

    // Limpar destaque se houver
    if (currentActiveIndex >= 0 && lines[currentActiveIndex]) {
      lines[currentActiveIndex].classList.remove('active');
      currentActiveIndex = -1;
    }
    return;
  }

  hideCountdown();

  // Encontrar a linha atual baseada na posição
  let activeIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const lineTime = parseFloat(lines[i].getAttribute('data-time'));
    if (position >= lineTime) {
      activeIndex = i;
    } else {
      break;
    }
  }

  // Nada mudou: evita repaint, recálculo de layout e re-disparo do scroll suave
  if (activeIndex === currentActiveIndex) return;

  // Tirar o destaque apenas da linha anterior
  if (currentActiveIndex >= 0 && lines[currentActiveIndex]) {
    lines[currentActiveIndex].classList.remove('active');
  }
  currentActiveIndex = activeIndex;

  // Destacar a nova linha ativa
  if (activeIndex >= 0) {
    const activeLine = lines[activeIndex];
    activeLine.classList.add('active');

    // Auto-scroll para centralizar a linha ativa
    const containerHeight = lyricsContainer.clientHeight;
    const scrollTo = activeLine.offsetTop - (containerHeight / 2) + (activeLine.clientHeight / 2);

    lyricsContainer.scrollTo({
      top: scrollTo,
      behavior: 'smooth'
    });
  }
}

// Atualiza a contagem regressiva antes da primeira linha
let lastCountdownLabel = '';
function updateCountdown(position, firstLineTime) {
  const countdownContainer = document.querySelector('.countdown-container');
  const countdownTimer = document.querySelector('.countdown-timer');
  const countdownProgressFill = document.querySelector('.countdown-progress-fill');
  if (!countdownContainer || !countdownTimer) return;

  countdownContainer.style.display = 'flex';

  const timeUntilStart = firstLineTime - position;
  const minutes = Math.floor(timeUntilStart / 60);
  const seconds = Math.floor(timeUntilStart % 60);
  const label = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  // Só escreve no DOM quando o segundo exibido muda
  if (label !== lastCountdownLabel) {
    countdownTimer.textContent = label;
    lastCountdownLabel = label;
  }

  if (countdownProgressFill) {
    const progressPercentage = (timeUntilStart / firstLineTime) * 100;
    countdownProgressFill.style.width = `${progressPercentage}%`;
  }
}

function hideCountdown() {
  const countdownContainer = document.querySelector('.countdown-container');
  if (countdownContainer && countdownContainer.style.display !== 'none') {
    countdownContainer.style.display = 'none';
  }
}

// Toggle always on top
pinButton.addEventListener('click', async () => {
  isPinned = await window.electronAPI.toggleAlwaysOnTop();
  pinButton.classList.toggle('pinned', isPinned);
  pinButton.title = isPinned ? 'Fixado no topo' : 'Não fixado';
});

// Mostrar/ocultar a tradução (preferência persistida entre sessões)
let translationEnabled = localStorage.getItem('translationEnabled') !== 'false';

function applyTranslationPreference() {
  lyricsContainer.classList.toggle('translation-hidden', !translationEnabled);
  translateButton.classList.toggle('pinned', translationEnabled);
  translateButton.title = translationEnabled
    ? 'Tradução (pt-BR) ativada'
    : 'Tradução (pt-BR) desativada';
}

applyTranslationPreference();
window.electronAPI.setTranslationEnabled(translationEnabled);

translateButton.addEventListener('click', async () => {
  translationEnabled = !translationEnabled;
  localStorage.setItem('translationEnabled', String(translationEnabled));
  applyTranslationPreference();

  // Ao reativar, o processo principal retraduz a letra já exibida
  await window.electronAPI.setTranslationEnabled(translationEnabled);
});

// Recarregar letra manualmente (fallback caso algo tenha falhado)
refreshButton.addEventListener('click', async () => {
  refreshButton.classList.add('spinning');
  lyricsContainer.innerHTML = '<div class="loading"></div>';
  try {
    const ok = await window.electronAPI.refreshLyrics();
    if (!ok) {
      lyricsContainer.innerHTML = '<div class="waiting-message"><p>Nenhuma música tocando no Deezer.</p></div>';
    }
  } finally {
    setTimeout(() => refreshButton.classList.remove('spinning'), 500);
  }
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
