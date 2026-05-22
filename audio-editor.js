// audio-editor.js
// Éditeur complet : charge songs-index + audio-map, fusionne, permet recherche YouTube et édition

// ─── Chargement d'un script externe ───
function loadScript(src) {
  return new Promise((resolve, reject) => {
    // Vérifie si déjà chargé
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Impossible de charger ' + src));
    document.head.appendChild(s);
  });
}

// ─── État global ───
let allSongs = [];  // Liste fusionnée [{title, page, section, sectionName, youtubeId}]
let modified = false;
let currentFilter = 'all';

function markModified() {
  modified = true;
  document.getElementById('save-indicator').classList.add('visible');
}

// ─── Chargement et fusion des données ───
async function loadData() {
  const statusEl = document.getElementById('load-status');
  statusEl.textContent = 'Chargement des index…';

  await loadScript('public/songs-index.js');
  await loadScript('public/audio-map.js');

  const songsIndex = window.songs_index_data || [];
  const audioMap = window.audio_map_data || {};

  // Construire un lookup rapide : page → [{title, youtubeId}]
  const audioLookup = {};
  Object.entries(audioMap).forEach(([page, entries]) => {
    entries.forEach(e => {
      const key = `${page}::${e.title}`;
      audioLookup[key] = e.youtubeId || '';
    });
  });

  // Fusionner : chaque chant du songs-index reçoit son youtubeId s'il existe
  allSongs = songsIndex
    .filter(s => s.page >= 1) // garder tous les chants
    .map(s => {
      const key = `${s.page}::${s.title}`;
      return {
        title: s.title,
        page: s.page,
        section: s.section,
        sectionName: s.sectionName,
        youtubeId: audioLookup[key] || ''
      };
    });

  statusEl.textContent = `${allSongs.length} chants chargés.`;
  return allSongs;
}

// ─── Statistiques ───
function updateStats() {
  const total = allSongs.length;
  const found = allSongs.filter(s => s.youtubeId).length;
  const missing = total - found;
  const pct = total > 0 ? Math.round((found / total) * 100) : 0;

  document.getElementById('stats').innerHTML =
    `<strong>${total}</strong> chants — ` +
    `<span class="stat-ok">${found} trouvés (${pct}%)</span> — ` +
    `<span class="stat-miss">${missing} manquants</span>`;

  // Barre de progression
  const bar = document.getElementById('progress-bar-fill');
  if (bar) bar.style.width = pct + '%';
}

// ─── Création d'une ligne ───
function createRow(song, index) {
  const tr = document.createElement('tr');
  const hasSong = !!song.youtubeId;
  tr.className = hasSong ? 'found' : 'missing';
  tr.dataset.index = index;

  // Page
  const tdPage = document.createElement('td');
  tdPage.textContent = song.page;
  tdPage.className = 'col-page';

  // Titre
  const tdTitle = document.createElement('td');
  tdTitle.className = 'col-title';
  const titleSpan = document.createElement('span');
  titleSpan.textContent = song.title;
  const sectionSpan = document.createElement('span');
  sectionSpan.className = 'section-tag';
  sectionSpan.textContent = song.sectionName || '';
  tdTitle.appendChild(titleSpan);
  tdTitle.appendChild(sectionSpan);

  // Statut
  const tdStatus = document.createElement('td');
  tdStatus.className = 'col-status';
  tdStatus.innerHTML = hasSong
    ? '<span class="badge badge-ok">✅</span>'
    : '<span class="badge badge-missing">❌</span>';

  // Action
  const tdAction = document.createElement('td');
  tdAction.className = 'col-action';

  const inputWrap = document.createElement('div');
  inputWrap.className = 'input-group';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = song.youtubeId;
  input.placeholder = 'ID YouTube';
  input.addEventListener('input', () => {
    song.youtubeId = input.value.trim();
    const nowHas = !!song.youtubeId;
    tr.className = nowHas ? 'found' : 'missing';
    tdStatus.innerHTML = nowHas
      ? '<span class="badge badge-ok">✅</span>'
      : '<span class="badge badge-missing">❌</span>';
    markModified();
    updateStats();
  });

  // Bouton recherche YouTube
  const searchBtn = document.createElement('button');
  searchBtn.innerHTML = '🔍';
  searchBtn.title = 'Rechercher sur YouTube';
  searchBtn.className = 'icon-btn search-btn';
  searchBtn.addEventListener('click', () => toggleSearch(tr, song, input));

  // Bouton aperçu
  const previewBtn = document.createElement('button');
  previewBtn.innerHTML = '▶';
  previewBtn.title = 'Écouter';
  previewBtn.className = 'icon-btn preview-btn';
  previewBtn.addEventListener('click', () => togglePreview(tr, song));

  inputWrap.appendChild(input);
  inputWrap.appendChild(searchBtn);
  inputWrap.appendChild(previewBtn);
  tdAction.appendChild(inputWrap);

  tr.appendChild(tdPage);
  tr.appendChild(tdTitle);
  tr.appendChild(tdStatus);
  tr.appendChild(tdAction);
  return tr;
}

// ─── Recherche YouTube (inline sous la ligne) ───
function toggleSearch(tr, song, input) {
  const next = tr.nextElementSibling;
  if (next && next.classList.contains('search-row')) {
    next.remove();
    return;
  }
  // Supprimer toute autre ligne de recherche/preview ouverte
  document.querySelectorAll('.search-row, .preview-row').forEach(r => r.remove());

  const searchTr = document.createElement('tr');
  searchTr.className = 'search-row';
  const searchTd = document.createElement('td');
  searchTd.colSpan = 4;

  // Barre de recherche personnalisée
  const searchBar = document.createElement('div');
  searchBar.className = 'search-bar';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.value = song.title;
  searchInput.placeholder = 'Rechercher sur YouTube…';
  searchInput.className = 'search-input';

  const goBtn = document.createElement('button');
  goBtn.textContent = '🔍 Rechercher';
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

  // Zone de résultats
  const resultsDiv = document.createElement('div');
  resultsDiv.className = 'yt-results';

  function doSearch() {
    const query = searchInput.value.trim();
    if (!query) return;
    resultsDiv.innerHTML = '<p class="loading-text">Chargement des résultats YouTube…</p>';

    // Intégrer un iframe de recherche YouTube
    resultsDiv.innerHTML = '';

    const iframe = document.createElement('iframe');
    iframe.width = '100%';
    iframe.height = '400';
    iframe.style.border = 'none';
    iframe.style.borderRadius = '8px';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.src = `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(query)}`;
    resultsDiv.appendChild(iframe);

    // Instructions pour l'utilisateur
    const helpDiv = document.createElement('div');
    helpDiv.className = 'search-help';
    helpDiv.innerHTML = `
      <p>📋 <strong>Comment importer :</strong></p>
      <ol>
        <li>Trouvez la bonne vidéo ci-dessus</li>
        <li>Copiez l'ID YouTube depuis l'URL (ex: <code>dQw4w9WgXcQ</code> depuis youtube.com/watch?v=<strong>dQw4w9WgXcQ</strong>)</li>
        <li>Collez-le dans le champ ID ci-dessus</li>
      </ol>
      <p>💡 Ou collez une URL complète YouTube ci-dessous :</p>
    `;

    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.placeholder = 'Collez une URL YouTube complète ici…';
    urlInput.className = 'url-input';
    urlInput.addEventListener('input', () => {
      const url = urlInput.value.trim();
      const id = extractYoutubeId(url);
      if (id) {
        input.value = id;
        song.youtubeId = id;
        input.dispatchEvent(new Event('input'));
        urlInput.style.borderColor = '#4ade80';
        urlInput.style.background = 'rgba(74,222,128,0.1)';
      }
    });

    helpDiv.appendChild(urlInput);
    resultsDiv.appendChild(helpDiv);
  }

  goBtn.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

  searchTd.appendChild(searchBar);
  searchTd.appendChild(resultsDiv);
  searchTr.appendChild(searchTd);
  tr.after(searchTr);

  // Lancer automatiquement la recherche
  doSearch();
}

// ─── Extraction de l'ID YouTube depuis une URL ───
function extractYoutubeId(url) {
  if (!url) return null;
  // Déjà un ID simple (11 caractères) ?
  if (/^[\w-]{11}$/.test(url)) return url;
  // URL standard
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/,
    /(?:youtube\.com\/v\/)([\w-]{11})/,
    /(?:music\.youtube\.com\/watch\?.*v=)([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

// ─── Aperçu vidéo ───
function togglePreview(tr, song) {
  const next = tr.nextElementSibling;
  if (next && next.classList.contains('preview-row')) {
    next.remove();
    return;
  }
  if (!song.youtubeId) return;
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

// ─── Rendu du tableau ───
function renderTable() {
  const tbody = document.querySelector('#chants-table tbody');
  tbody.innerHTML = '';

  const searchTerm = (document.getElementById('search-box')?.value || '').toLowerCase();

  allSongs.forEach((song, idx) => {
    const hasSong = !!song.youtubeId;
    const status = hasSong ? 'found' : 'missing';

    // Filtre statut
    if (currentFilter !== 'all' && currentFilter !== status) return;
    // Filtre recherche texte
    if (searchTerm && !song.title.toLowerCase().includes(searchTerm) &&
        !String(song.page).includes(searchTerm)) return;

    tbody.appendChild(createRow(song, idx));
  });

  updateStats();
}

// ─── Export ───
function exportAudioMap() {
  // Reconstruire audio_map_data à partir d'allSongs
  const audioMap = {};
  allSongs.forEach(s => {
    const pageKey = String(s.page);
    if (!audioMap[pageKey]) audioMap[pageKey] = [];
    audioMap[pageKey].push({
      title: s.title,
      youtubeId: s.youtubeId || ''
    });
  });
  const content = `window.audio_map_data = ${JSON.stringify(audioMap, null, 2)};\n`;
  const blob = new Blob([content], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'audio-map.js';
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Initialisation ───
document.getElementById('load-audio-map').addEventListener('click', async () => {
  const btn = document.getElementById('load-audio-map');
  btn.disabled = true;
  btn.textContent = '⏳ Chargement…';
  try {
    await loadData();
    renderTable();
    document.getElementById('editor-section').classList.remove('hidden-section');
    document.getElementById('export-section').classList.remove('hidden-section');
    btn.textContent = '✅ Chargé !';
  } catch (err) {
    console.error('[audio-editor]', err);
    btn.textContent = '❌ Erreur';
    document.getElementById('load-status').textContent = 'Erreur : ' + err.message;
  }
});

document.getElementById('export-json').addEventListener('click', exportAudioMap);

// Filtres
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderTable();
  });
});

// Recherche texte
const searchBox = document.getElementById('search-box');
if (searchBox) {
  searchBox.addEventListener('input', () => renderTable());
}

// Alerte avant fermeture
window.addEventListener('beforeunload', (e) => {
  if (modified) { e.preventDefault(); e.returnValue = ''; }
});
