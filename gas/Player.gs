/**
 * Source de lecture des chants (réglable par l'administrateur, onglet « Lecteur ») :
 *  - hidden  : lecteur YouTube officiel mais masqué en permanence (comme le carnet hébergé sur GitHub) : la vidéo et ses
 *              publicités ne s'affichent jamais ; un bouton ↻ arrête et relance le chant pour passer une publicité audio ;
 *  - youtube : lecteur officiel YouTube (API IFrame) — peut afficher des publicités ;
 *  - piped   : flux audio seul, sans publicité, via une instance Piped (l'alternative déjà utilisée par l'éditeur
 *              audio d'origine pour la recherche). Le serveur récupère l'adresse du flux ; le navigateur le lit
 *              dans une balise <audio>, sans aucune vidéo ni publicité.
 * Réglages dans les propriétés du script : PLAYER_SOURCE, PIPED_INSTANCES.
 */

function playerSource_() {
  var v = cfg_('PLAYER_SOURCE');
  return v === 'piped' || v === 'invidious' || v === 'hidden' ? v : 'youtube';
}

function pipedInstances_(kind) {
  return cfg_(kind === 'invidious' ? 'INVIDIOUS_INSTANCES' : 'PIPED_INSTANCES').split(/[\s,;]+/).filter(function (u) { return /^https:\/\//.test(u); })
    .map(function (u) { return u.replace(/\/+$/, ''); });
}

/** Adresse d'un flux audio pour une vidéo (appelé par le lecteur du carnet en mode « piped »). */
function getAudioStream(youtubeId) {
  var id = extractYoutubeId_(youtubeId);
  if (!/^[\w-]{11}$/.test(id)) throw new Error('Identifiant YouTube invalide');
  var map = getAudioMap_(), ann = annexAudio_();
  var known = Object.keys(map).concat(Object.keys(ann)).some(function (p) { return ((map[p] || ann[p]) || []).some(function (a) { return a.youtubeId === id; }); });
  if (!known) throw new Error('Vidéo inconnue du carnet');
  var cache = CacheService.getScriptCache(), key = 'pstream_' + id;
  var hit = cache.get(key);
  if (hit) { try { return JSON.parse(hit); } catch (e) { /* ignoré */ } }
  var found = pipedStream_(id);
  if (!found) throw new Error('Aucune instance Piped n’a répondu');
  cache.put(key, JSON.stringify(found), 600);
  return found;
}

/** Flux audio d'une instance : { url, duration } ou null. kind = 'piped' | 'invidious'. */
function instanceStream_(kind, base, id) {
  if (kind === 'invidious') {
    var r = UrlFetchApp.fetch(base + '/api/v1/videos/' + id + '?local=true&fields=lengthSeconds,adaptiveFormats', { muteHttpExceptions: true, followRedirects: true });
    if (r.getResponseCode() !== 200) throw new Error('HTTP ' + r.getResponseCode());
    var j = JSON.parse(r.getContentText());
    var list = (j.adaptiveFormats || []).filter(function (f) { return f && f.url && /^audio\//.test(f.type || ''); });
    list.sort(function (x, y) {
      var xm = /mp4/.test(x.type) ? 1 : 0, ym = /mp4/.test(y.type) ? 1 : 0;
      return (ym - xm) || ((Number(y.bitrate) || 0) - (Number(x.bitrate) || 0));
    });
    return list.length ? { url: list[0].url, duration: Number(j.lengthSeconds) || 0 } : null;
  }
  var p = UrlFetchApp.fetch(base + '/streams/' + id, { muteHttpExceptions: true, followRedirects: true });
  if (p.getResponseCode() !== 200) throw new Error('HTTP ' + p.getResponseCode());
  var q = JSON.parse(p.getContentText());
  var streams = (q.audioStreams || []).filter(function (x) { return x && x.url && !x.videoOnly; });
  streams.sort(function (x, y) {
    var xm = /mp4|m4a|aac/i.test(x.mimeType || x.format || '') ? 1 : 0, ym = /mp4|m4a|aac/i.test(y.mimeType || y.format || '') ? 1 : 0;
    return (ym - xm) || ((y.bitrate || 0) - (x.bitrate || 0));
  });
  return streams.length ? { url: streams[0].url, duration: Number(q.duration) || 0 } : null;
}

function pipedStream_(id) {
  var kind = playerSource_(), inst = pipedInstances_(kind), errors = [];
  for (var i = 0; i < inst.length; i++) {
    try {
      var f = instanceStream_(kind, inst[i], id);
      if (f) { f.instance = inst[i]; return f; }
      errors.push(inst[i] + ' : pas de flux audio');
    } catch (e) { errors.push(inst[i] + ' : ' + e.message); }
  }
  console.warn('Source sans publicité indisponible pour ' + id + ' — ' + errors.join(' | '));
  return null;
}

/** Réglage courant et état des instances (onglet « Lecteur » de l'administration). */
function adminPlayerGet() {
  requireAdmin_();
  return { source: playerSource_(), piped: pipedInstances_('piped').join('\n'), invidious: pipedInstances_('invidious').join('\n') };
}

function adminPlayerSet(source, piped, invidious) {
  requireAdmin_();
  if (source !== 'youtube' && source !== 'hidden' && source !== 'piped' && source !== 'invidious') throw new Error('Source inconnue');
  var sp = PropertiesService.getScriptProperties();
  [['PIPED_INSTANCES', piped], ['INVIDIOUS_INSTANCES', invidious]].forEach(function (kv) {
    var list = String(kv[1] || '').split(/[\s,;]+/).filter(Boolean);
    list.forEach(function (u) { if (!/^https:\/\/[\w.-]+(:\d+)?(\/[\w.\/-]*)?$/.test(u)) throw new Error('Adresse invalide : ' + u); });
    if (list.length) sp.setProperty(kv[0], list.join(','));
  });
  sp.setProperty('PLAYER_SOURCE', source);
  return adminPlayerGet();
}

/** Teste chaque instance avec une vidéo connue ; kind = 'piped' | 'invidious'. */
function adminPlayerTest(kind, instances) {
  requireAdmin_();
  kind = kind === 'invidious' ? 'invidious' : 'piped';
  var list = instances ? String(instances).split(/[\s,;]+/).filter(Boolean) : pipedInstances_(kind);
  var testId = null, map = getAudioMap_();
  Object.keys(map).some(function (p) { var a = (map[p] || [])[0]; if (a && /^[\w-]{11}$/.test(a.youtubeId || '')) { testId = a.youtubeId; return true; } return false; });
  return list.map(function (u) {
    var t0 = Date.now();
    try {
      var f = instanceStream_(kind, u.replace(/\/+$/, ''), testId);
      return { url: u, ok: !!f, ms: Date.now() - t0, detail: f ? 'flux audio disponible' : 'aucun flux audio' };
    } catch (e) { return { url: u, ok: false, ms: Date.now() - t0, detail: e.message }; }
  });
}
