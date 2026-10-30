/**
 * Barre d'onglets du site, lue DIRECTEMENT dans le projet « barre » (API de liaison ?api=nav) :
 * aucun onglet n'est recopié ici, la barre se met à jour toute seule quand elle est modifiée dans l'admin de la barre.
 *  - onglets publics : toujours ;
 *  - onglets privés  : si le visiteur est connecté à Google avec une adresse reconnue comme membre actif
 *    (ou, côté navigateur, grâce à la « sonde » de connexion de la barre).
 * Robustesse : appel « membre » en échec -> appel public ; tout en échec -> dernière barre réussie (NAV_LAST_GOOD).
 * La barre ne disparaît donc jamais. Mise en cache 15 min par visiteur (CacheService).
 */
function navFetch_(withEmail, email) {
  var url = cfg_('SITE_NAV_BASE') + '?api=nav' + (withEmail ? '&email=' + encodeURIComponent(email) + '&key=' + encodeURIComponent(cfg_('SITE_NAV_KEY')) : '');
  var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  if (r.getResponseCode() !== 200) return null;
  var j = JSON.parse(r.getContentText());
  return (j && j.ok) ? j : null;
}

function navUserKey_() {
  var email = '';
  try { email = String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (e) { /* visiteur anonyme */ }
  return { email: email, key: 'NAV_V3_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, email || 'public')) };
}

/** Barre de ce visiteur : cache, sinon appel à la barre, sinon dernière version connue. */
function getSiteNav() {
  var base = cfg_('SITE_NAV_BASE');
  if (!base) return null;
  var u = navUserKey_(), cache = CacheService.getScriptCache();
  var hit = cache.get(u.key);
  if (hit) { try { return JSON.parse(hit); } catch (e) { /* recalcul */ } }

  var j = null;
  try { if (u.email) j = navFetch_(true, u.email); } catch (e) { /* repli public */ }
  if (!j) { try { j = navFetch_(false, ''); } catch (e) { /* repli dernière version */ } }
  if (j) {
    // Sondes : l'adresse « domaine » (/a/macros/fsggb.fr/) s'ouvre dans un cadre pour un compte fsggb.fr connecté ; l'adresse simple sert aux autres cas.
    var probeDomain = base.replace('/macros/s/', '/a/macros/' + cfg_('SITE_NAV_DOMAIN') + '/s/') + '?sonde=barre';
    var out = { active: cfg_('SITE_NAV_TAB'), connected: !!(j.connecte || j.connected), tabs: j.tabs || [],
      probes: [probeDomain, base + '?sonde=barre'] };
    try {
      cache.put(u.key, JSON.stringify(out), 900);
      PropertiesService.getScriptProperties().setProperty('NAV_LAST_GOOD', JSON.stringify(out));
    } catch (e) { /* cache plein : sans conséquence */ }
    return out;
  }
  try {
    var last = PropertiesService.getScriptProperties().getProperty('NAV_LAST_GOOD');
    if (last) { var o = JSON.parse(last); o.connected = false; return o; }
  } catch (e) { /* rien de mémorisé */ }
  return null;
}
