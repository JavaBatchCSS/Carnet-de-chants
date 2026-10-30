/**
 * Carnet de Chants — Troupe Saint Elme
 * Application web Google Apps Script.
 *
 *  - Public : le carnet (Index.html), lecture via l'API IFrame officielle de YouTube.
 *  - Admin  : ?page=admin (réservé au propriétaire / ADMIN_EMAILS), vérification et
 *             recherche des vidéos via l'API YouTube Data v3 (service avancé « YouTube »).
 */

/** Clé de cache liée au contenu de la carte de base : un nouveau déploiement ne sert jamais une ancienne carte. */
function audioCacheKey_() {
  const s = JSON.stringify(AUDIO_BASE);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return 'audio_map_' + (h >>> 0).toString(36);
}
const CACHE_TTL = 6 * 60 * 60; // 6 h
const PROP_PAGE_PREFIX = 'aud_';
const PROP_REPORTS = 'reports';
const MAX_REPORTS = 60;

/* ------------------------------------------------------------------ */
/* Point d'entrée                                                      */
/* ------------------------------------------------------------------ */

function doGet(e) {
  const params = (e && e.parameter) || {};
  const which = String(params.page || '').toLowerCase();
  if (which === 'admin') return adminPage_();
  if (which === 'report') return reportJson_(params);

  ensureConfig_();
  const t = HtmlService.createTemplateFromFile('Index');
  t.annexJson = JSON.stringify(annexPublic_()).replace(/</g, String.fromCharCode(92) + 'u003c');
  t.cfgJson = JSON.stringify(clientConfig_()).replace(/</g, String.fromCharCode(92) + 'u003c');
  t.audioJson = JSON.stringify(getAudioMap_()).replace(/</g, '\\u003c');
  t.startPage = Math.max(0, parseInt(params.p, 10) || 0);
  t.baseUrl = ScriptApp.getService().getUrl();
  t.navJson = JSON.stringify(getSiteNav()).replace(/</g, String.fromCharCode(92) + 'u003c');
  return t.evaluate()
    .setTitle('Carnet de Chants')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Export JSON en lecture seule (administrateurs) : ?page=report&op=audit | search&q=… */
function reportJson_(params) {
  let out;
  try {
    requireAdmin_();
    if (params.op === 'audit') out = adminAudit();
    else if (params.op === 'search') out = adminSearch(String(params.q || ''), String(params.x || 'chant scout'));
    else if (params.op === 'selftest') out = adminSelfTest(String(params.deep || '') === '1');
    else if (params.op === 'navtest') {
      try { out = { nav: getSiteNav(), direct: navFetch_(false, '') }; } catch (err) { out = { error: String(err) }; }
    }
    else if (params.op === 'multi') {
      out = {};
      String(params.q || '').split('||').forEach(function (q) {
        out[q] = adminSearch(q, String(params.x || 'chant scout')).slice(0, 4).map(function (v) {
          return [v.id, v.score, v.secs, v.channel, v.title.slice(0, 70)].join('¦');
        });
      });
    }
    else out = { error: 'op inconnue' };
  } catch (err) {
    out = { error: String(err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** Image d'une page-illustration du PDF (base64 JPEG), servie à la demande. */
function getPageImage(n) {
  return PAGE_IMAGES[String(parseInt(n, 10) || 0)] || '';
}

/** Inclusion de fichiers HTML dans un template (<?!= include('X') ?>). */
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/* ------------------------------------------------------------------ */
/* Carte audio : base + surcharges (propriétés du script)              */
/* ------------------------------------------------------------------ */

function getAudioMap_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(audioCacheKey_());
  if (hit) {
    try { return JSON.parse(hit); } catch (err) { /* recalcul */ }
  }
  const map = JSON.parse(JSON.stringify(AUDIO_BASE));
  const props = PropertiesService.getScriptProperties().getProperties();
  Object.keys(props).forEach(function (k) {
    if (k.indexOf(PROP_PAGE_PREFIX) !== 0) return;
    try { map[k.substring(PROP_PAGE_PREFIX.length)] = JSON.parse(props[k]); } catch (err) { /* ignore */ }
  });
  try { cache.put(audioCacheKey_(), JSON.stringify(map), CACHE_TTL); } catch (err) { /* > 100 Ko : pas de cache */ }
  return map;
}

function invalidateAudioCache_() {
  CacheService.getScriptCache().remove(audioCacheKey_());
}

function extractYoutubeId_(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.toUpperCase() === 'NONE') return 'NONE';
  const m = raw.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed\/|shorts\/|live\/)|[?&]v=)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{11}$/.test(raw) ? raw : '';
}

/* ------------------------------------------------------------------ */
/* Signalement des lectures impossibles (appelé par le client)         */
/* ------------------------------------------------------------------ */

function reportPlaybackError(page, youtubeId, code) {
  page = String(parseInt(page, 10) || 0);
  youtubeId = extractYoutubeId_(youtubeId);
  const known = ((getAudioMap_()[page] || annexAudio_()[page]) || []).some(function (a) { return a.youtubeId === youtubeId; });
  if (!known || youtubeId === 'NONE') return false;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) return false;
  try {
    const sp = PropertiesService.getScriptProperties();
    const reports = JSON.parse(sp.getProperty(PROP_REPORTS) || '{}');
    const key = page + ':' + youtubeId;
    if (!reports[key] && Object.keys(reports).length >= MAX_REPORTS) return false;
    const r = reports[key] || { page: Number(page), id: youtubeId, n: 0 };
    r.n++; r.code = Number(code) || 0; r.last = new Date().toISOString();
    reports[key] = r;
    sp.setProperty(PROP_REPORTS, JSON.stringify(reports));
    return true;
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ */
/* Administration                                                      */
/* ------------------------------------------------------------------ */

function isAdmin_() {
  const email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!email) return false;
  const owner = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  const extra = String(PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS') || '')
    .toLowerCase().split(/[\s,;]+/).filter(Boolean);
  return email === owner || extra.indexOf(email) !== -1;
}

function requireAdmin_() {
  if (!isAdmin_()) throw new Error('Accès réservé aux administrateurs.');
}

function adminPage_() {
  if (!isAdmin_()) {
    return HtmlService.createHtmlOutput(
      '<meta charset="utf-8"><body style="font-family:sans-serif;padding:2rem">' +
      '<h2>Accès réservé</h2><p>Connectez-vous avec le compte administrateur du carnet (même domaine que le propriétaire du script).</p></body>')
      .setTitle('Accès réservé');
  }
  const t = HtmlService.createTemplateFromFile('Admin');
  t.baseUrl = ScriptApp.getService().getUrl();
  return t.evaluate().setTitle('Administration du carnet')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Liste de toutes les entrées audio, avec leur numéro de page et leur rang. */
function adminListEntries() {
  requireAdmin_();
  const map = getAudioMap_();
  const out = [];
  const textPages = cfg_('TEXT_PAGES').split(/[\s,;]+/).filter(Boolean).map(Number);
  Object.keys(map).map(Number).sort(function (a, b) { return a - b; }).forEach(function (page) {
    if (textPages.indexOf(page) !== -1) return;
    map[page].forEach(function (a, i) {
      out.push({ page: page, index: i, title: a.title, youtubeId: a.youtubeId });
    });
  });
  annexReadAll_().songs.forEach(function (s) {
    out.push({ page: s.page, index: 0, title: s.title, youtubeId: s.youtubeId || 'NONE', annex: true, label: annexLabelOf_(s.page) });
  });
  const reports = JSON.parse(PropertiesService.getScriptProperties().getProperty(PROP_REPORTS) || '{}');
  return { entries: out, reports: Object.keys(reports).map(function (k) { return reports[k]; }) };
}

/** Interroge Videos.list par lots de 50 (1 unité de quota par appel). */
function fetchVideos_(ids) {
  const found = {};
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const res = YouTube.Videos.list('snippet,contentDetails,status', { id: chunk.join(','), maxResults: 50 });
    (res.items || []).forEach(function (v) {
      const blocked = v.contentDetails && v.contentDetails.regionRestriction && v.contentDetails.regionRestriction.blocked || [];
      const allowed = v.contentDetails && v.contentDetails.regionRestriction && v.contentDetails.regionRestriction.allowed;
      found[v.id] = {
        id: v.id,
        title: v.snippet.title,
        channel: v.snippet.channelTitle,
        desc: String(v.snippet.description || '').replace(/\s+/g, ' ').slice(0, 200),
        secs: parseIsoDuration_(v.contentDetails.duration),
        embeddable: !!v.status.embeddable,
        privacy: v.status.privacyStatus,
        blockedFR: blocked.indexOf('FR') !== -1 || (allowed ? allowed.indexOf('FR') === -1 : false)
      };
    });
  }
  return found;
}

function parseIsoDuration_(iso) {
  const m = String(iso || '').match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

/** Vérifie chaque identifiant : existence, intégration autorisée, blocage FR, doublons, titre suspect. */
function adminAudit() {
  requireAdmin_();
  const { entries } = adminListEntries();
  const ids = Array.from(new Set(entries.map(function (e) { return e.youtubeId; }).filter(function (id) { return id && id !== 'NONE'; })));
  const info = fetchVideos_(ids);
  const usage = {};
  entries.forEach(function (e) { if (e.youtubeId !== 'NONE') usage[e.youtubeId] = (usage[e.youtubeId] || 0) + 1; });

  return entries.map(function (e) {
    const row = { page: e.page, index: e.index, title: e.title, youtubeId: e.youtubeId, status: 'none', notes: [] };
    if (e.youtubeId === 'NONE') return row;
    const v = info[e.youtubeId];
    if (!v) { row.status = 'missing'; row.notes.push('Vidéo introuvable ou privée'); return row; }
    row.video = v;
    row.status = 'ok';
    if (!v.embeddable) { row.status = 'blocked'; row.notes.push('Lecture intégrée interdite'); }
    if (v.privacy === 'private') { row.status = 'missing'; row.notes.push('Vidéo privée'); }
    if (v.blockedFR) { row.status = 'blocked'; row.notes.push('Bloquée en France'); }
    if (usage[e.youtubeId] > 1) { row.notes.push('Même vidéo utilisée ' + usage[e.youtubeId] + ' fois'); if (row.status === 'ok') row.status = 'suspect'; }
    const overlap = titleOverlap_(e.title, v.title);
    if (overlap < 0.34) { row.notes.push('Titre de la vidéo éloigné du chant'); if (row.status === 'ok') row.status = 'suspect'; }
    if (v.secs && (v.secs < 40 || v.secs > 600)) { row.notes.push('Durée inhabituelle (' + formatSecs_(v.secs) + ')'); if (row.status === 'ok') row.status = 'suspect'; }
    return row;
  });
}

function formatSecs_(s) {
  return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
}

function normalize_(s) {
  return String(s || '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

const STOP_ = ['les', 'des', 'une', 'aux', 'dans', 'sur', 'pour', 'avec', 'que', 'qui', 'est', 'the', 'and'];

function tokens_(s) {
  return normalize_(s).split(' ').filter(function (w) { return w.length >= 3 && STOP_.indexOf(w) === -1; });
}

function titleOverlap_(song, video) {
  const a = tokens_(song);
  if (!a.length) return 1;
  const b = normalize_(video);
  let hit = 0;
  a.forEach(function (w) { if (b.indexOf(w) !== -1) hit++; });
  return hit / a.length;
}

/**
 * Cherche des vidéos candidates (intégrables, syndiquées, musique) pour un chant.
 * Coût : 100 unités de quota par requête de recherche.
 */
function adminSearch(title, extraTerms) {
  requireAdmin_();
  const q = String(title) + ' ' + (extraTerms || 'chant scout');
  const res = YouTube.Search.list('snippet', {
    q: q, type: 'video', maxResults: 10, regionCode: 'FR', relevanceLanguage: 'fr',
    videoEmbeddable: 'true', videoSyndicated: 'true', safeSearch: 'strict'
  });
  const ids = (res.items || []).map(function (it) { return it.id.videoId; }).filter(Boolean);
  const info = fetchVideos_(ids);
  return ids.map(function (id) { return info[id]; }).filter(function (v) { return v && v.embeddable && !v.blockedFR; })
    .map(function (v) {
      let score = titleOverlap_(title, v.title) * 100;
      if (v.secs < 50 || v.secs > 480) score -= 30;
      if (/montjoie|sapiens|padres|scout|ch[oœ]eur/i.test(v.channel + ' ' + v.title)) score += 10;
      v.score = Math.round(score);
      return v;
    })
    .sort(function (a, b) { return b.score - a.score; })
    .slice(0, 5);
}

/** Valide puis enregistre l'identifiant d'une entrée (surcharge stockée dans les propriétés du script). */
function adminSaveEntry(page, index, idOrUrl, force) {
  requireAdmin_();
  const id = extractYoutubeId_(idOrUrl);
  if (!id) throw new Error('Identifiant ou lien YouTube invalide.');
  let video = null;
  if (id !== 'NONE') {
    video = fetchVideos_([id])[id];
    if (!video && !force) throw new Error('Cette vidéo est introuvable ou privée.');
    if (video && !video.embeddable && !force) throw new Error('Cette vidéo interdit la lecture intégrée.');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (isAnnexPage_(page)) {
      const sp0 = PropertiesService.getScriptProperties();
      const raw = sp0.getProperty(ANN_SONG_PREFIX_ + page);
      if (!raw) throw new Error('Chant d’annexe inconnu.');
      const rec = JSON.parse(raw);
      rec.youtubeId = id === 'NONE' ? '' : id;
      sp0.setProperty(ANN_SONG_PREFIX_ + page, JSON.stringify(rec));
      annexInvalidate_();
      return { youtubeId: id, video: video };
    }
    const map = getAudioMap_();
    const list = (map[String(page)] || []).slice();
    if (!list[index]) throw new Error('Entrée inconnue.');
    list[index] = { title: list[index].title, youtubeId: id };
    PropertiesService.getScriptProperties().setProperty(PROP_PAGE_PREFIX + page, JSON.stringify(list));
    invalidateAudioCache_();
  } finally {
    lock.releaseLock();
  }
  return { youtubeId: id, video: video };
}

function adminClearReports() {
  requireAdmin_();
  PropertiesService.getScriptProperties().deleteProperty(PROP_REPORTS);
  return true;
}

/** Retire les surcharges d'une page pour revenir à la carte de base du dépôt. */
function adminResetPage(page) {
  requireAdmin_();
  PropertiesService.getScriptProperties().deleteProperty(PROP_PAGE_PREFIX + page);
  invalidateAudioCache_();
  return true;
}
