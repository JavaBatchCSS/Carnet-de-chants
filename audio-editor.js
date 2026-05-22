// audio-editor.js
// Éditeur complet : charge songs-index + audio-map, fusionne, permet recherche via API Piped et édition

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Impossible de charger ' + src));
    document.head.appendChild(s);
  });
}

let allSongs = [];
let modified = false;
let currentFilter = 'all';

function markModified() {
  modified = true;
  const indicator = document.getElementById('save-indicator');
  if (indicator) indicator.classList.add('visible');
}

async function loadData() {
  const statusEl = document.getElementById('load-status');
  if(statusEl) statusEl.textContent = 'Chargement des index…';

  await loadScript('public/songs-index.js');
  await loadScript('public/audio-map.js');

  const songsIndex = window.songs_index_data || [];
  const audioMap = window.audio_map_data || {};

  const audioLookup = {};
  Object.entries(audioMap).forEach(([page, entries]) => {
    entries.forEach(e => {
      const key = `${page}::${e.title}`;
      audioLookup[key] = e.youtubeId || '';
    });
  });

  // Filtrer les pages >= 1 et trier par page
  allSongs = songsIndex
    .filter(s => s.page >= 1)
    .sort((a, b) => a.page - b.page)
    .map(s => {
      const key = `${s.page}::${s.title}`;
      return {
        title: s.title,
        page: s.page,
        section: s.section || 'unknown',
        sectionName: s.sectionName || 'Autres',
        youtubeId: audioLookup[key] || ''
      };
    });

  if(statusEl) statusEl.textContent = `${allSongs.length} chants chargés.`;
  return allSongs;
}

function updateStats() {
  const total = allSongs.length;
  const found = allSongs.filter(s => s.youtubeId && s.youtubeId !== 'NONE').length;
  const ignored = allSongs.filter(s => s.youtubeId === 'NONE').length;
  const missing = total - found - ignored;
  const pct = total > 0 ? Math.round(((found + ignored) / total) * 100) : 0;

  const statsEl = document.getElementById('stats');
  if (statsEl) {
    statsEl.innerHTML =
      `<strong>${total}</strong> chants — ` +
      `<span class="stat-ok">${found} trouvés</span> — ` +
      `<span class="stat-ignore">${ignored} ignorés</span> — ` +
      `<span class="stat-miss">${missing} manquants</span>`;
  }

  const bar = document.getElementById('progress-bar-fill');
  if (bar) bar.style.width = pct + '%';
}

function getStatusInfo(youtubeId) {
  if (!youtubeId) return { class: 'missing', html: '<span class="badge badge-missing">❌</span>' };
  if (youtubeId === 'NONE') return { class: 'ignored', html: '<span class="badge badge-ignore">🗑️</span>' };
  return { class: 'found', html: '<span class="badge badge-ok">✅</span>' };
}

function createRow(song, index) {
  const tr = document.createElement('tr');
  const statusInfo = getStatusInfo(song.youtubeId);
  tr.className = statusInfo.class;
  tr.dataset.index = index;

  const tdPage = document.createElement('td');
  tdPage.textContent = song.page;
  tdPage.className = 'col-page';

  const tdTitle = document.createElement('td');
  tdTitle.className = 'col-title';
  const titleSpan = document.createElement('span');
  titleSpan.textContent = song.title;
  tdTitle.appendChild(titleSpan);

  const tdStatus = document.createElement('td');
  tdStatus.className = 'col-status';
  tdStatus.innerHTML = statusInfo.html;

  const tdAction = document.createElement('td');
  tdAction.className = 'col-action';

  const inputWrap = document.createElement('div');
  inputWrap.className = 'input-group';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = song.youtubeId === 'NONE' ? '' : song.youtubeId;
  input.placeholder = song.youtubeId === 'NONE' ? '(Ignoré)' : 'ID YouTube';
  
  const updateRowState = () => {
    const info = getStatusInfo(song.youtubeId);
    tr.className = info.class;
    tdStatus.innerHTML = info.html;
    input.value = song.youtubeId === 'NONE' ? '' : song.youtubeId;
    input.placeholder = song.youtubeId === 'NONE' ? '(Ignoré)' : 'ID YouTube';
    markModified();
    updateStats();
  };

  input.addEventListener('input', () => {
    song.youtubeId = input.value.trim();
    updateRowState();
  });

  const searchBtn = document.createElement('button');
  searchBtn.innerHTML = '🔍';
  searchBtn.title = 'Rechercher sur YouTube';
  searchBtn.className = 'icon-btn search-btn';
  searchBtn.addEventListener('click', () => toggleSearch(tr, song, updateRowState));

  const previewBtn = document.createElement('button');
  previewBtn.innerHTML = '▶';
  previewBtn.title = 'Écouter';
  previewBtn.className = 'icon-btn preview-btn';
  previewBtn.addEventListener('click', () => togglePreview(tr, song));

  const ignoreBtn = document.createElement('button');
  ignoreBtn.innerHTML = '🗑️';
  ignoreBtn.title = 'Ignorer ce chant (ne pas l\'afficher dans l\'app)';
  ignoreBtn.className = 'icon-btn ignore-btn';
  ignoreBtn.addEventListener('click', () => {
    song.youtubeId = 'NONE';
    updateRowState();
  });

  inputWrap.appendChild(input);
  inputWrap.appendChild(searchBtn);
  inputWrap.appendChild(previewBtn);
  inputWrap.appendChild(ignoreBtn);
  tdAction.appendChild(inputWrap);

  tr.appendChild(tdPage);
  tr.appendChild(tdTitle);
  tr.appendChild(tdStatus);
  tr.appendChild(tdAction);
  return tr;
}

// ─── Gestion de la clé API YouTube ───
const apiKeyInput = document.getElementById('yt-api-key');
if (apiKeyInput) {
  apiKeyInput.value = localStorage.getItem('yt_api_key') || '';
}
const saveKeyBtn = document.getElementById('save-api-key');
if (saveKeyBtn) {
  saveKeyBtn.addEventListener('click', () => {
    localStorage.setItem('yt_api_key', apiKeyInput.value.trim());
    alert('Clé API enregistrée localement !');
  });
}

// ─── Recherche API ───
async function fetchYoutubeAPI(query) {
  const key = localStorage.getItem('yt_api_key');
  if (!key) {
    throw new Error("Veuillez entrer une clé API YouTube en haut de la page.");
  }

  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=8&q=${encodeURIComponent(query)}&key=${key}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    let errorMsg = `HTTP ${response.status}`;
    try {
      const errData = await response.json();
      if (errData.error && errData.error.message) {
        errorMsg = errData.error.message;
      }
    } catch(e) {}
    throw new Error(`Erreur API YouTube: ${errorMsg}`);
  }
  
  const data = await response.json();
  return data.items.map(item => {
    // On décode les entités HTML dans les titres renvoyés par YouTube
    const txt = document.createElement("textarea");
    txt.innerHTML = item.snippet.title;
    
    return {
      url: `?v=${item.id.videoId}`,
      thumbnail: item.snippet.thumbnails.medium ? item.snippet.thumbnails.medium.url : item.snippet.thumbnails.default.url,
      title: txt.value,
      uploaderName: item.snippet.channelTitle,
      duration: 0 // L'API search ne renvoie pas la durée sans appel supplémentaire
    };
  });
}

function toggleSearch(tr, song, updateCallback) {
  const next = tr.nextElementSibling;
  if (next && next.classList.contains('search-row')) {
    next.remove();
    return;
  }
  document.querySelectorAll('.search-row, .preview-row').forEach(r => r.remove());

  const searchTr = document.createElement('tr');
  searchTr.className = 'search-row';
  const searchTd = document.createElement('td');
  searchTd.colSpan = 4;

  const searchBar = document.createElement('div');
  searchBar.className = 'search-bar';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.value = `${song.title} Choeur Montjoie OR Sapiens OR Padres`;
  searchInput.className = 'search-input';

  const goBtn = document.createElement('button');
  goBtn.textContent = '🔍 Chercher via API';
  goBtn.className = 'primary-btn';
  goBtn.style.padding = '.4rem .8rem';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✖';
  closeBtn.className = 'danger-btn';
  closeBtn.style.padding = '.4rem .6rem';
  closeBtn.addEventListener('click', () => searchTr.remove());

  searchBar.appendChild(searchInput);
  searchBar.appendChild(goBtn);
  searchBar.appendChild(closeBtn);

  const resultsDiv = document.createElement('div');
  resultsDiv.className = 'yt-results-grid';

  async function doSearch() {
    const query = searchInput.value.trim();
    if (!query) return;
    resultsDiv.innerHTML = '<p class="loading-text">Recherche en cours...</p>';

    try {
      const results = await fetchYoutubeAPI(query);
      resultsDiv.innerHTML = '';
      if (results.length === 0) {
        resultsDiv.innerHTML = '<p class="loading-text">Aucun résultat trouvé.</p>';
        return;
      }
      
      results.forEach(item => {
        const card = document.createElement('div');
        card.className = 'yt-card';
        const vidId = item.url.split('?v=')[1];
        
        card.innerHTML = `
          <img src="${item.thumbnail}" alt="miniature">
          <div class="yt-card-info">
            <div class="yt-card-title" title="${item.title}">${item.title}</div>
            <div class="yt-card-author">${item.uploaderName}</div>
          </div>
        `;
        
        card.addEventListener('click', () => {
          song.youtubeId = vidId;
          updateCallback();
          searchTr.remove(); // fermer la recherche après sélection
        });
        
        resultsDiv.appendChild(card);
      });
    } catch (err) {
      resultsDiv.innerHTML = `<p class="loading-text" style="color:#f87171">Erreur de recherche: ${err.message}. L'API est peut-être temporairement indisponible.</p>`;
    }
  }

  goBtn.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

  searchTd.appendChild(searchBar);
  searchTd.appendChild(resultsDiv);
  searchTr.appendChild(searchTd);
  tr.after(searchTr);

  doSearch();
}

function togglePreview(tr, song) {
  const next = tr.nextElementSibling;
  if (next && next.classList.contains('preview-row')) {
    next.remove();
    return;
  }
  if (!song.youtubeId || song.youtubeId === 'NONE') return;
  document.querySelectorAll('.search-row, .preview-row').forEach(r => r.remove());

  const prevTr = document.createElement('tr');
  prevTr.className = 'preview-row';
  const td = document.createElement('td');
  td.colSpan = 4;

  const iframe = document.createElement('iframe');
  iframe.width = '100%';
  iframe.height = '220';
  iframe.style.border = 'none';
  iframe.style.borderRadius = '8px';
  iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
  iframe.allowFullscreen = true;
  iframe.src = `https://www.youtube.com/embed/${song.youtubeId}?autoplay=1`;

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✖ Fermer';
  closeBtn.className = 'danger-btn';
  closeBtn.style.marginTop = '6px';
  closeBtn.addEventListener('click', () => prevTr.remove());

  td.appendChild(iframe);
  td.appendChild(closeBtn);
  prevTr.appendChild(td);
  tr.after(prevTr);
}

function renderTable() {
  const tbody = document.querySelector('#chants-table tbody');
  tbody.innerHTML = '';

  const searchTerm = (document.getElementById('search-box')?.value || '').toLowerCase();

  let currentSection = null;

  allSongs.forEach((song, idx) => {
    const info = getStatusInfo(song.youtubeId);

    // Filtres
    if (currentFilter !== 'all' && currentFilter !== info.class) return;
    if (searchTerm && !song.title.toLowerCase().includes(searchTerm) &&
        !String(song.page).includes(searchTerm)) return;

    // En-tête de section
    if (song.sectionName !== currentSection) {
      currentSection = song.sectionName;
      const secTr = document.createElement('tr');
      secTr.className = 'section-header';
      secTr.innerHTML = `<td colspan="4">${currentSection}</td>`;
      tbody.appendChild(secTr);
    }

    tbody.appendChild(createRow(song, idx));
  });

  updateStats();
}

function exportAudioMap() {
  const audioMap = {};
  allSongs.forEach(s => {
    // N'exporter que si un youtubeId est défini (y compris 'NONE')
    if (s.youtubeId) {
      const pageKey = String(s.page);
      if (!audioMap[pageKey]) audioMap[pageKey] = [];
      audioMap[pageKey].push({
        title: s.title,
        youtubeId: s.youtubeId
      });
    }
  });
  const content = `window.audio_map_data = ${JSON.stringify(audioMap, null, 2)};\n`;
  const blob = new Blob([content], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'audio-map.js';
  a.click();
  URL.revokeObjectURL(url);
  
  modified = false;
  document.getElementById('save-indicator').classList.remove('visible');
}

document.getElementById('load-audio-map').addEventListener('click', async () => {
  const btn = document.getElementById('load-audio-map');
  btn.disabled = true;
  btn.textContent = '⏳ Chargement…';
  try {
    await loadData();
    renderTable();
    const edSection = document.getElementById('editor-section');
    if(edSection) edSection.classList.remove('hidden-section');
    const expSection = document.getElementById('export-section');
    if(expSection) expSection.classList.remove('hidden-section');
    btn.textContent = '✅ Chargé !';
  } catch (err) {
    console.error(err);
    btn.textContent = '❌ Erreur';
    document.getElementById('load-status').textContent = 'Erreur : ' + err.message;
  }
});

const exportBtn = document.getElementById('export-json');
if(exportBtn) exportBtn.addEventListener('click', exportAudioMap);

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderTable();
  });
});

const searchBox = document.getElementById('search-box');
if (searchBox) {
  searchBox.addEventListener('input', () => renderTable());
}

window.addEventListener('beforeunload', (e) => {
  if (modified) { e.preventDefault(); e.returnValue = ''; }
});
