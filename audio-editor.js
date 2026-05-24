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

function createRow(song, index, songsOnPage) {
  const tr = document.createElement('tr');
  const statusInfo = getStatusInfo(song.youtubeId);
  tr.className = statusInfo.class;
  tr.dataset.index = index;

  const tdPage = document.createElement('td');
  tdPage.className = 'col-page';
  tdPage.textContent = song.page;
  if (songsOnPage > 1) {
    const indicator = document.createElement('span');
    indicator.className = 'page-indicator';
    indicator.textContent = `${songsOnPage} chants`;
    tdPage.appendChild(indicator);
  }

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

// ==========================================
// ⚙️ CONFIGURATION (stockée dans localStorage)
// ==========================================

function getConfig(key, fallback = '') {
  // Clé API fournie par l'utilisateur comme valeur par défaut
  if (key === 'yt_key' && !localStorage.getItem('chants_cfg_yt_key')) {
    return 'AIzaSyBTgbSPahw5Ck2pJDXx4KuDbB4H9kTP1IE';
  }
  return localStorage.getItem('chants_cfg_' + key) || fallback;
}

// ── Initialisation de l'interface de configuration ──
(function initConfig() {
  const fields = {
    'cfg-yt-key':  'yt_key',
    'cfg-gh-repo': 'gh_repo',
    'cfg-gh-token':'gh_token',
    'cfg-gh-path': 'gh_path'
  };

  // Remplir les champs avec les valeurs stockées
  Object.entries(fields).forEach(([elId, storageKey]) => {
    const el = document.getElementById(elId);
    if (el) {
      const stored = getConfig(storageKey);
      if (stored) el.value = stored;
    }
  });

  // Bouton Sauvegarder
  document.getElementById('save-config')?.addEventListener('click', () => {
    Object.entries(fields).forEach(([elId, storageKey]) => {
      const el = document.getElementById(elId);
      if (el) localStorage.setItem('chants_cfg_' + storageKey, el.value.trim());
    });
    const st = document.getElementById('config-status');
    if (st) { st.textContent = '✅ Configuration sauvegardée !'; st.style.color = '#4ade80'; }
    setTimeout(() => { if (st) st.textContent = ''; }, 3000);
  });

  // Boutons afficher/masquer mot de passe
  document.querySelectorAll('.toggle-vis-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      if (target) target.type = target.type === 'password' ? 'text' : 'password';
    });
  });

  // Ouvrir automatiquement le panneau s'il manque la clé YouTube
  if (!getConfig('yt_key')) {
    const panel = document.getElementById('config-panel');
    if (panel) panel.open = true;
  }
})();

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.tokhmi.xyz',
  'https://piped-api.garudalinux.org',
  'https://pipedapi.smarthome-zone.net',
  'https://pipedapi.in.projectsegfau.lt'
];

// ─── Recherche API ───
async function fetchYoutubeAPI(query, pageToken = '') {
  let ytError = null;
  const ytKey = getConfig('yt_key');

  // 1. Tenter l'API YouTube officielle si la clé est configurée
  if (ytKey) {
    try {
      let url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=8&q=${encodeURIComponent(query)}&key=${ytKey}`;
      if (pageToken) url += `&pageToken=${pageToken}`;
      
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
      const items = data.items.map(item => {
        const txt = document.createElement("textarea");
        txt.innerHTML = item.snippet.title;
        return {
          url: `?v=${item.id.videoId}`,
          thumbnail: item.snippet.thumbnails.medium ? item.snippet.thumbnails.medium.url : item.snippet.thumbnails.default.url,
          title: txt.value,
          uploaderName: item.snippet.channelTitle
        };
      });
      
      return { nextPageToken: data.nextPageToken, items: items };
    } catch (err) {
      console.warn("L'API YouTube officielle a échoué. Basculement sur Piped...", err);
      ytError = err;
    }
  }

  // 2. Tenter les instances Piped en fallback (ou si pas de clé API)
  let pipedError = null;
  for (const instance of PIPED_INSTANCES) {
    try {
      let url = `${instance}/search?q=${encodeURIComponent(query)}&filter=videos`;
      if (pageToken) url += `&nextpage=${encodeURIComponent(pageToken)}`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      
      return {
        nextPageToken: data.nextpage || '',
        items: data.items.slice(0, 8) // Prendre les 8 premiers
      };
    } catch (err) {
      console.warn(`[API] Échec avec ${instance}:`, err);
      pipedError = err;
    }
  }
  
  throw new Error("Toutes les méthodes de recherche (YouTube et Piped) ont échoué.");
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

  const channelSelect = document.createElement('select');
  channelSelect.className = 'search-input';
  channelSelect.style.flex = '0 0 160px';
  channelSelect.innerHTML = `
    <option value="Choeur Montjoie OR Sapiens OR Padres">Top 3 chaînes</option>
    <option value="Choeur Montjoie Saint Denis">Chœur Montjoie</option>
    <option value="Sapiens France">Sapiens France</option>
    <option value="Les Padres">Les Padrés</option>
    <option value="">N'importe qui</option>
  `;

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.value = song.title; // On ne met plus les OR ici, c'est géré par le select
  searchInput.className = 'search-input';

  const goBtn = document.createElement('button');
  goBtn.textContent = '🔍 Chercher';
  goBtn.className = 'primary-btn';
  goBtn.style.padding = '.4rem .8rem';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✖';
  closeBtn.className = 'danger-btn';
  closeBtn.style.padding = '.4rem .6rem';
  closeBtn.addEventListener('click', () => searchTr.remove());

  searchBar.appendChild(channelSelect);
  searchBar.appendChild(searchInput);
  searchBar.appendChild(goBtn);
  searchBar.appendChild(closeBtn);

  const previewContainer = document.createElement('div');
  previewContainer.className = 'search-preview-container';

  const resultsDiv = document.createElement('div');
  resultsDiv.className = 'yt-results-grid';

  const loadMoreBtn = document.createElement('button');
  loadMoreBtn.textContent = 'Charger plus de résultats...';
  loadMoreBtn.className = 'secondary-btn';
  loadMoreBtn.style.display = 'none';
  loadMoreBtn.style.width = '100%';
  loadMoreBtn.style.marginTop = '1rem';

  let currentNextPageToken = '';

  async function doSearch(isLoadMore = false) {
    const baseQuery = searchInput.value.trim();
    if (!baseQuery) return;

    const channelFilter = channelSelect.value;
    const query = channelFilter ? `${baseQuery} ${channelFilter}` : baseQuery;
    
    if (!isLoadMore) {
      resultsDiv.innerHTML = '<p class="loading-text">Recherche en cours...</p>';
      currentNextPageToken = '';
      loadMoreBtn.style.display = 'none';
      previewContainer.innerHTML = '';
    } else {
      loadMoreBtn.textContent = 'Chargement...';
      loadMoreBtn.disabled = true;
    }

    try {
      const results = await fetchYoutubeAPI(query, currentNextPageToken);
      
      if (!isLoadMore) resultsDiv.innerHTML = '';
      
      if (results.items.length === 0 && !isLoadMore) {
        resultsDiv.innerHTML = '<p class="loading-text">Aucun résultat trouvé.</p>';
        return;
      }
      
      results.items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'yt-card';
        const vidId = item.url.split('?v=')[1];
        
        card.innerHTML = `
          <img src="${item.thumbnail}" alt="miniature">
          <div class="yt-card-info">
            <div class="yt-card-title" title="${item.title}">${item.title}</div>
            <div class="yt-card-author">${item.uploaderName}</div>
            <div class="yt-card-actions" style="margin-top:0.5rem; display:flex; gap:0.4rem;">
              <button class="primary-btn select-video-btn" style="flex:1; padding:0.4rem; font-size:0.8rem;">Sélectionner</button>
              <button class="secondary-btn preview-video-btn" style="padding:0.4rem; font-size:0.8rem;" title="Préécouter ici">▶</button>
              <a href="https://www.youtube.com/watch?v=${vidId}" target="_blank" class="secondary-btn" style="padding:0.4rem; font-size:0.8rem; text-decoration:none; display:flex; align-items:center;" title="Ouvrir sur YouTube (Secours)">↗</a>
            </div>
          </div>
        `;
        
        card.querySelector('.select-video-btn').addEventListener('click', () => {
          song.youtubeId = vidId;
          updateCallback();
          searchTr.remove(); // fermer la recherche après sélection
        });

        card.querySelector('.preview-video-btn').addEventListener('click', () => {
          previewContainer.innerHTML = `
            <div style="position:relative; width:100%; height:250px; margin-bottom:1rem; background:#000; border-radius:8px;">
              <iframe width="100%" height="100%" style="border:none; border-radius:8px;" 
                src="https://yewtu.be/embed/${vidId}?autoplay=1" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen>
              </iframe>
              <div style="position:absolute; top:5px; right:5px; display:flex; gap:5px;">
                <a href="https://www.youtube.com/watch?v=${vidId}" target="_blank" class="secondary-btn" style="text-decoration:none; font-size:0.8rem; padding:0.3rem 0.6rem;">↗ Ouvrir sur YouTube</a>
                <button class="danger-btn close-preview-btn">✖ Fermer</button>
              </div>
            </div>
          `;
          previewContainer.querySelector('.close-preview-btn').addEventListener('click', () => {
            previewContainer.innerHTML = '';
          });
          previewContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
        
        resultsDiv.appendChild(card);
      });

      currentNextPageToken = results.nextPageToken;
      if (currentNextPageToken) {
        loadMoreBtn.style.display = 'block';
        loadMoreBtn.textContent = 'Charger plus de résultats...';
        loadMoreBtn.disabled = false;
      } else {
        loadMoreBtn.style.display = 'none';
      }

    } catch (err) {
      if (!isLoadMore) {
        resultsDiv.innerHTML = `<p class="loading-text" style="color:#f87171">Erreur de recherche: ${err.message}</p>`;
      } else {
        loadMoreBtn.textContent = 'Erreur. Réessayer ?';
        loadMoreBtn.disabled = false;
      }
    }
  }

  loadMoreBtn.addEventListener('click', () => doSearch(true));
  goBtn.addEventListener('click', () => doSearch(false));
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(false); });

  searchTd.appendChild(searchBar);
  searchTd.appendChild(previewContainer);
  searchTd.appendChild(resultsDiv);
  searchTd.appendChild(loadMoreBtn);
  searchTr.appendChild(searchTd);
  tr.after(searchTr);

  doSearch(false);
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
  td.style.position = 'relative';

  const iframe = document.createElement('iframe');
  iframe.width = '100%';
  iframe.height = '220';
  iframe.style.border = 'none';
  iframe.style.borderRadius = '8px';
  iframe.style.background = '#000';
  iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
  iframe.allowFullscreen = true;
  iframe.src = `https://yewtu.be/embed/${song.youtubeId}?autoplay=1`;

  const btnContainer = document.createElement('div');
  btnContainer.style.position = 'absolute';
  btnContainer.style.top = '15px';
  btnContainer.style.right = '20px';
  btnContainer.style.display = 'flex';
  btnContainer.style.gap = '5px';

  const openBtn = document.createElement('a');
  openBtn.href = `https://www.youtube.com/watch?v=${song.youtubeId}`;
  openBtn.target = '_blank';
  openBtn.textContent = '↗ Ouvrir sur YouTube';
  openBtn.className = 'secondary-btn';
  openBtn.style.textDecoration = 'none';
  openBtn.style.fontSize = '0.8rem';
  openBtn.style.padding = '0.3rem 0.6rem';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✖ Fermer';
  closeBtn.className = 'danger-btn';
  closeBtn.style.fontSize = '0.8rem';
  closeBtn.style.padding = '0.3rem 0.6rem';
  closeBtn.addEventListener('click', () => prevTr.remove());

  btnContainer.appendChild(openBtn);
  btnContainer.appendChild(closeBtn);

  td.appendChild(iframe);
  td.appendChild(btnContainer);
  prevTr.appendChild(td);
  tr.after(prevTr);
}

function renderTable() {
  const tbody = document.querySelector('#chants-table tbody');
  tbody.innerHTML = '';

  const searchTerm = (document.getElementById('search-box')?.value || '').toLowerCase();

  // Pré-calculer combien de chants par page
  const songsPerPage = {};
  allSongs.forEach(s => {
    songsPerPage[s.page] = (songsPerPage[s.page] || 0) + 1;
  });

  let currentSection = null;
  let lastPage = null;

  allSongs.forEach((song, idx) => {
    const info = getStatusInfo(song.youtubeId);

    // Filtres
    if (currentFilter !== 'all' && currentFilter !== info.class) return;
    if (searchTerm && !song.title.toLowerCase().includes(searchTerm) &&
        !String(song.page).includes(searchTerm)) return;

    // En-tête de section (grande partie)
    if (song.sectionName !== currentSection) {
      currentSection = song.sectionName;
      const secTr = document.createElement('tr');
      secTr.className = 'section-header';
      secTr.innerHTML = `<td colspan="4">${currentSection}</td>`;
      tbody.appendChild(secTr);
      lastPage = null; // reset pour le séparateur de page
    }

    // Séparateur de page (trait visuel entre groupes de pages)
    const row = createRow(song, idx, songsPerPage[song.page]);
    if (song.page !== lastPage) {
      row.classList.add('page-group-start');
      lastPage = song.page;
    }

    tbody.appendChild(row);
  });

  updateStats();
}

// ─── Export & GitHub ───
function generateContent() {
  const audioMap = {};
  allSongs.forEach(s => {
    if (s.youtubeId) {
      const pageKey = String(s.page);
      if (!audioMap[pageKey]) audioMap[pageKey] = [];
      audioMap[pageKey].push({ title: s.title, youtubeId: s.youtubeId });
    }
  });
  return `window.audio_map_data = ${JSON.stringify(audioMap, null, 2)};\n`;
}

function exportAudioMap() {
  const content = generateContent();
  const blob = new Blob([content], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'audio-map.js';
  a.click();
  URL.revokeObjectURL(url);
  
  modified = false;
  document.getElementById('save-indicator').classList.remove('visible');
  document.getElementById('export-status').textContent = 'Fichier téléchargé ! Remplacez manuellement public/audio-map.js.';
  document.getElementById('export-status').style.color = '#38bdf8';
}

async function pushToGithub() {
  const repo = getConfig('gh_repo');
  const token = getConfig('gh_token');
  const path = getConfig('gh_path', 'public/audio-map.js');
  const statusEl = document.getElementById('export-status');

  if (!repo || !token || !path) {
    statusEl.textContent = '❌ Configuration GitHub incomplète (remplir la section 🔑 en haut). Téléchargement local…';
    statusEl.style.color = '#f87171';
    exportAudioMap();
    return;
  }

  statusEl.textContent = '⏳ Récupération du fichier depuis GitHub...';
  statusEl.style.color = '#fbbf24';

  const content = generateContent();
  
  try {
    // 1. Obtenir le SHA du fichier existant
    const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    let sha = null;
    if (getRes.ok) {
      const data = await getRes.json();
      sha = data.sha;
    } else if (getRes.status !== 404) {
      throw new Error(`Erreur lors de la lecture (${getRes.status})`);
    }

    // 2. Mettre à jour (ou créer) le fichier
    statusEl.textContent = '⏳ Envoi des modifications vers GitHub...';
    
    // Encodage base64 utf-8 supportant les accents
    const base64Content = btoa(unescape(encodeURIComponent(content)));

    const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Mise à jour des chants audio (via éditeur web)',
        content: base64Content,
        sha: sha // optionnel si 404 (nouveau fichier)
      })
    });

    if (!putRes.ok) {
      const err = await putRes.json();
      throw new Error(err.message || putRes.status);
    }

    statusEl.textContent = '✅ Fichier mis à jour avec succès sur GitHub !';
    statusEl.style.color = '#4ade80';
    modified = false;
    document.getElementById('save-indicator').classList.remove('visible');

  } catch (error) {
    console.error("Erreur GitHub:", error);
    statusEl.textContent = `❌ Échec de la mise à jour GitHub: ${error.message}. Téléchargement local en cours...`;
    statusEl.style.color = '#f87171';
    exportAudioMap();
  }
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

const exportGhBtn = document.getElementById('export-github');
if(exportGhBtn) exportGhBtn.addEventListener('click', pushToGithub);

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
