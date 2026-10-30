/**
 * Annexes : chants et textes ajoutés par l'administrateur, HORS de la version PDF.
 *
 * Numérotation (pour que la version numérique concorde toujours avec le PDF) :
 *  - les pages 1 à 246 sont celles du PDF, jamais décalées ;
 *  - chaque annexe vit dans une « partie » identifiée par une lettre (A, B, C…) ;
 *  - la page d'index de la partie A est « A », ses chants sont « A1 », « A2 »… (B1, B2… pour la partie B) ;
 *  - le numéro libre le plus bas est attribué à un nouveau chant (les annexes n'existent pas dans le PDF : réutiliser un numéro supprimé est sans conséquence) ;
 *  - en interne, la page numérique est 1000 + 100 × rang de la lettre + numéro : index de la partie A = 1000, A1 = 1001, A2 = 1002 ;
 *    index de B = 1100, B1 = 1101… (adresse directe : ?p=1001).
 *
 * Stockage : propriétés du script (ann_parts, ann_s_<page>, ann_log), cache public de 6 h.
 */
var ANN_PARTS_KEY_ = 'ann_parts';
var ANN_SONG_PREFIX_ = 'ann_s_';
var ANN_LOG_KEY_ = 'ann_log';
var ANN_CACHE_KEY_ = 'ann_pub_v1';
var ANN_BASE_ = 1000;
var ANN_STEP_ = 100;
var ANN_MAX_SEQ_ = 99;

function annexPageOf_(letter, seq) { return ANN_BASE_ + (letter.charCodeAt(0) - 65) * ANN_STEP_ + seq; }
function annexLetterOf_(page) { return String.fromCharCode(65 + Math.floor((page - ANN_BASE_) / ANN_STEP_)); }
function annexSeqOf_(page) { return (page - ANN_BASE_) % ANN_STEP_; }
function annexLabelOf_(page) { return annexLetterOf_(page) + (annexSeqOf_(page) || ''); }
function isAnnexPage_(page) { return Number(page) >= ANN_BASE_; }

function annexEsc_(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

/** Plus petit numéro libre (1..99) d'une partie, ou 0 si elle est pleine. */
function annexNextSeq_(songs, letter) {
  var used = {};
  songs.forEach(function (s) { if (s.letter === letter) used[annexSeqOf_(s.page)] = true; });
  for (var n = 1; n <= ANN_MAX_SEQ_; n++) if (!used[n]) return n;
  return 0;
}

/* ---------- Lecture ---------- */

function annexReadAll_() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var parts = [];
  try { parts = JSON.parse(props[ANN_PARTS_KEY_] || '[]'); } catch (e) { parts = []; }
  var songs = [];
  Object.keys(props).forEach(function (k) {
    if (k.indexOf(ANN_SONG_PREFIX_) !== 0) return;
    try { var s = JSON.parse(props[k]); if (s && s.page) songs.push(s); } catch (e) { /* entrée illisible ignorée */ }
  });
  songs.sort(function (a, b) { return a.page - b.page; });
  parts.sort(function (a, b) { return a.letter < b.letter ? -1 : 1; });
  return { parts: parts, songs: songs };
}

/* ---------- Paroles (texte saisi) -> HTML identique à celui des pages du PDF ---------- */

var ANN_NUM_ = /^(\d{1,2})\s*[-–.)]\s*(.*)$/;
var ANN_REF_ = /^(dernier refrain|refrain final|refrain|coda|final|solo|chœur|choeur)\b\s*:?\s*(.*)$/i;

function annexBlocks_(body) {
  var text = String(body || '').replace(/\r/g, '').trim();
  if (!text) return [];
  return text.split(/\n\s*\n+/).map(function (b) {
    return b.split('\n').map(function (l) { return l.replace(/\s+$/, ''); }).filter(function (l) { return l.trim() !== ''; });
  }).filter(function (b) { return b.length; });
}

/** options : { cols: 1|2|3, numbering: 'auto'|'none' } */
function lyricsToHtml_(title, body, options) {
  options = options || {};
  var blocks = annexBlocks_(body);
  var anyNum = blocks.some(function (b) { return ANN_NUM_.test(b[0]); });
  var auto = options.numbering !== 'none' && !anyNum && blocks.some(function (b) { return !ANN_REF_.test(b[0]); });
  var n = 0;
  var html = blocks.map(function (b) {
    var m;
    if ((m = ANN_REF_.exec(b[0]))) {
      var label = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() + ' :';
      var lines = (m[2] ? [m[2]] : []).concat(b.slice(1));
      return '<div class="refrain"><div class="refrain-label">' + annexEsc_(label) + '</div>' + lines.map(annexEsc_).join('<br>') + '</div>';
    }
    if ((m = ANN_NUM_.exec(b[0]))) {
      return '<div class="verse"><span class="verse-number">' + m[1] + '.</span>' + [m[2]].concat(b.slice(1)).map(annexEsc_).join('<br>') + '</div>';
    }
    if (auto) { n++; return '<div class="verse"><span class="verse-number">' + n + '.</span>' + b.map(annexEsc_).join('<br>') + '</div>'; }
    return '<div class="verse nonum">' + b.map(annexEsc_).join('<br>') + '</div>';
  }).join('');
  var cols = Math.min(3, Math.max(1, parseInt(options.cols, 10) || 1));
  if (cols > 1) html = '<div class="cols c' + cols + '">' + html + '</div>';
  return '<section class="song"><div class="song-head"><div class="song-title">' + annexEsc_(title) + '</div><div class="song-actions"></div></div>' + html + '</section>';
}

/* ---------- Données publiques (injectées dans la page du carnet) ---------- */

function annexPublic_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(ANN_CACHE_KEY_);
  if (hit) { try { return JSON.parse(hit); } catch (e) { /* recalcul */ } }

  var all = annexReadAll_();
  var out = { content: {}, pages: {}, index: [], audio: {}, labels: {}, parts: [] };
  all.parts.forEach(function (part) {
    var mine = all.songs.filter(function (s) { return s.letter === part.letter; });
    if (!mine.length) return;
    var partPage = annexPageOf_(part.letter, 0);
    var heading = 'Annexe ' + part.letter + ' — ' + part.name;
    out.parts.push({ letter: part.letter, name: part.name, page: partPage, count: mine.length });
    out.labels[partPage] = part.letter;
    out.index.push({ title: heading, page: partPage, label: part.letter, heading: true });

    var byNum = mine.map(function (s) { return '<li><a href="#page-' + s.page + '"><b>' + annexLabelOf_(s.page) + '</b> ' + annexEsc_(s.title) + '</a></li>'; }).join('');
    var alpha = mine.slice().sort(function (a, b) { return normalize_(a.title) < normalize_(b.title) ? -1 : 1; })
      .map(function (s) { return '<li><a href="#page-' + s.page + '">' + annexEsc_(s.title) + ' <span class="annex-ref">' + annexLabelOf_(s.page) + '</span></a></li>'; }).join('');
    out.content[partPage] = '<section class="song plain annex-index"><div class="song-head"><div class="annex-title">' + annexEsc_(heading) + '</div></div>' +
      (part.intro ? '<p class="annex-intro">' + annexEsc_(part.intro) + '</p>' : '') +
      '<div class="annex-sub">Par numéro</div><ol class="annex-list">' + byNum + '</ol>' +
      '<div class="annex-sub">Par ordre alphabétique</div><ul class="annex-list">' + alpha + '</ul>' +
      '<p class="annex-note">Annexe hors version imprimée : elle ne décale jamais les pages du PDF.</p></section>';
    out.pages[partPage] = { songs: [], annexIndex: true };

    mine.forEach(function (s) {
      out.content[s.page] = lyricsToHtml_(s.title, s.body, { cols: s.cols, numbering: s.numbering });
      out.pages[s.page] = { songs: [s.title], annex: true };
      out.labels[s.page] = annexLabelOf_(s.page);
      out.index.push({ title: s.title, page: s.page, label: annexLabelOf_(s.page) });
      if (s.youtubeId && s.youtubeId !== 'NONE') out.audio[s.page] = [{ title: s.title, youtubeId: s.youtubeId }];
    });
  });
  try { cache.put(ANN_CACHE_KEY_, JSON.stringify(out), CACHE_TTL); } catch (e) { /* trop gros : pas de cache */ }
  return out;
}

function annexInvalidate_() { CacheService.getScriptCache().remove(ANN_CACHE_KEY_); }

/** Audio des annexes, au même format que la carte audio du PDF. */
function annexAudio_() { return annexPublic_().audio; }

function annexLog_(what) {
  var sp = PropertiesService.getScriptProperties();
  var log = [];
  try { log = JSON.parse(sp.getProperty(ANN_LOG_KEY_) || '[]'); } catch (e) { log = []; }
  var who = '';
  try { who = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail(); } catch (e) { who = ''; }
  log.unshift({ t: new Date().toISOString(), by: who, what: what });
  sp.setProperty(ANN_LOG_KEY_, JSON.stringify(log.slice(0, 40)));
}

/* ---------- API d'administration ---------- */

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function adminAnnexList() {
  requireAdmin_();
  var all = annexReadAll_();
  var log = [];
  try { log = JSON.parse(PropertiesService.getScriptProperties().getProperty(ANN_LOG_KEY_) || '[]'); } catch (e) { log = []; }
  return {
    parts: all.parts,
    songs: all.songs.map(function (s) { return { page: s.page, label: annexLabelOf_(s.page), letter: s.letter, title: s.title, body: s.body, cols: s.cols || 1, numbering: s.numbering || 'auto', youtubeId: s.youtubeId || '', updated: s.updated }; }),
    nextLabels: all.parts.reduce(function (acc, p) {
      var n = annexNextSeq_(all.songs, p.letter);
      acc[p.letter] = n ? p.letter + n : null;
      return acc;
    }, {}),
    log: log
  };
}

/** Crée (sans lettre) ou modifie (avec lettre) une partie d'annexe. */
function adminAnnexSavePart(part) {
  requireAdmin_();
  var name = String(part && part.name || '').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 60) throw new Error('Le nom de la partie doit faire entre 2 et 60 caractères.');
  var intro = String(part && part.intro || '').trim().slice(0, 400);
  return withLock_(function () {
    var sp = PropertiesService.getScriptProperties();
    var parts = annexReadAll_().parts;
    var letter = String(part && part.letter || '').toUpperCase();
    var cur = parts.filter(function (p) { return p.letter === letter; })[0];
    if (cur) { cur.name = name; cur.intro = intro; }
    else {
      if (!letter) { for (var c = 65; c <= 90; c++) { var l = String.fromCharCode(c); if (!parts.some(function (p) { return p.letter === l; })) { letter = l; break; } } }
      if (!/^[A-Z]$/.test(letter)) throw new Error('Plus de lettre disponible (A à Z).');
      if (parts.some(function (p) { return p.letter === letter; })) throw new Error('Cette lettre est déjà utilisée.');
      parts.push({ letter: letter, name: name, intro: intro });
    }
    sp.setProperty(ANN_PARTS_KEY_, JSON.stringify(parts));
    annexInvalidate_();
    annexLog_((cur ? 'Partie modifiée : ' : 'Partie créée : ') + letter + ' — ' + name);
    return { letter: letter, name: name, intro: intro };
  });
}

function adminAnnexDeletePart(letter) {
  requireAdmin_();
  letter = String(letter || '').toUpperCase();
  return withLock_(function () {
    var all = annexReadAll_();
    if (all.songs.some(function (s) { return s.letter === letter; })) throw new Error('Supprimez d’abord les chants de cette partie.');
    var sp = PropertiesService.getScriptProperties();
    sp.setProperty(ANN_PARTS_KEY_, JSON.stringify(all.parts.filter(function (p) { return p.letter !== letter; })));
    annexInvalidate_();
    annexLog_('Partie supprimée : ' + letter);
    return true;
  });
}

function annexValidateSong_(s) {
  var title = String(s && s.title || '').replace(/\s+/g, ' ').trim();
  if (title.length < 2 || title.length > 100) throw new Error('Le titre doit faire entre 2 et 100 caractères.');
  var body = String(s && s.body || '').replace(/\r/g, '').trim();
  if (!body) throw new Error('Les paroles sont vides.');
  if (body.length > 8000) throw new Error('Paroles trop longues (8 000 caractères maximum).');
  var yt = String(s && s.youtube || '').trim();
  var id = yt ? extractYoutubeId_(yt) : '';
  if (yt && !id) throw new Error('Lien ou identifiant YouTube invalide.');
  return { title: title, body: body, youtubeId: id === 'NONE' ? '' : id, cols: Math.min(3, Math.max(1, parseInt(s.cols, 10) || 1)), numbering: s.numbering === 'none' ? 'none' : 'auto' };
}

/**
 * Ajoute (sans page) ou modifie (avec page) un chant d'annexe. Le numéro libre le plus bas est attribué automatiquement.
 * s = { page?, letter, title, body, youtube, cols, numbering, force }
 */
function adminAnnexSaveSong(s) {
  requireAdmin_();
  var v = annexValidateSong_(s);
  var video = null;
  if (v.youtubeId) {
    try { video = fetchVideos_([v.youtubeId])[v.youtubeId]; } catch (e) { video = undefined; }  // quota / service indisponible : on n'empêche pas l'enregistrement
    if (video === null && !s.force) throw new Error('Cette vidéo est introuvable ou privée.');
    if (video && !video.embeddable && !s.force) throw new Error('Cette vidéo interdit la lecture intégrée.');
  }
  return withLock_(function () {
    var sp = PropertiesService.getScriptProperties();
    var all = annexReadAll_();
    var page = parseInt(s.page, 10) || 0, rec;
    if (page) {
      rec = all.songs.filter(function (x) { return x.page === page; })[0];
      if (!rec) throw new Error('Chant inconnu.');
    } else {
      var letter = String(s.letter || '').toUpperCase();
      if (!all.parts.some(function (p) { return p.letter === letter; })) throw new Error('Partie inconnue.');
      var seq = annexNextSeq_(all.songs, letter);
      if (!seq) throw new Error('Cette partie est pleine (99 chants).');
      page = annexPageOf_(letter, seq);
      rec = { page: page, letter: letter };
    }
    var dup = all.songs.some(function (x) { return x.letter === rec.letter && x.page !== page && normalize_(x.title) === normalize_(v.title); });
    if (dup) throw new Error('Un chant de cette partie porte déjà ce titre.');
    rec.title = v.title; rec.body = v.body; rec.youtubeId = v.youtubeId; rec.cols = v.cols; rec.numbering = v.numbering;
    rec.updated = new Date().toISOString();
    sp.setProperty(ANN_SONG_PREFIX_ + page, JSON.stringify(rec));
    annexInvalidate_();
    annexLog_('Chant enregistré : ' + annexLabelOf_(page) + ' — ' + v.title);
    return { page: page, label: annexLabelOf_(page), video: video || null };
  });
}

function adminAnnexDeleteSong(page) {
  requireAdmin_();
  page = parseInt(page, 10) || 0;
  return withLock_(function () {
    var sp = PropertiesService.getScriptProperties();
    var raw = sp.getProperty(ANN_SONG_PREFIX_ + page);
    if (!raw) throw new Error('Chant inconnu.');
    var title = '';
    try { title = JSON.parse(raw).title; } catch (e) { /* titre inconnu */ }
    sp.deleteProperty(ANN_SONG_PREFIX_ + page);
    annexInvalidate_();
    annexLog_('Chant supprimé : ' + annexLabelOf_(page) + ' — ' + title);
    return true;
  });
}

/** Aperçu (HTML identique à celui du carnet) sans rien enregistrer. */
function adminAnnexPreview(s) {
  requireAdmin_();
  var title = String(s && s.title || 'Titre du chant').slice(0, 100);
  return lyricsToHtml_(title, String(s && s.body || ''), { cols: s && s.cols, numbering: s && s.numbering });
}
