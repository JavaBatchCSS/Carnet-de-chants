/**
 * Auto-contrôle du carnet (administrateur) : adminSelfTest() ou ?page=report&op=selftest[&deep=1].
 * Chaque contrôle renvoie { name, ok, detail }. Le mode « deep » fait un aller-retour d'écriture sur une partie
 * d'annexe temporaire (Z) puis la supprime.
 */
function adminSelfTest(deep) {
  requireAdmin_();
  var out = [];
  function check(name, fn) {
    try { var r = fn(); out.push({ name: name, ok: r === true || (r && r.ok !== false && r !== false), detail: (r && r.detail) || '' }); }
    catch (e) { out.push({ name: name, ok: false, detail: String(e && e.message || e) }); }
  }

  check('Réglages (propriétés du script)', function () {
    var need = ['SITE_NAV_BASE', 'SITE_NAV_KEY', 'SITE_NAV_TAB', 'TEXT_PAGES', 'DRIVE_FOLDER_ID'];
    var props = PropertiesService.getScriptProperties().getProperties();
    var miss = need.filter(function (k) { return !props[k]; });
    return { ok: !miss.length, detail: miss.length ? 'manquantes : ' + miss.join(', ') : need.length + ' réglages présents' };
  });

  check('Source de lecture', function () {
    var src = playerSource_();
    if (src === 'youtube' || src === 'hidden') return { ok: true, detail: (src === 'hidden' ? 'YouTube masqué' : 'YouTube officiel') + ' (aucune instance tierce sollicitée)' };
    var r = adminPlayerTest(src).filter(function (x) { return x.ok; });
    return { ok: r.length > 0, detail: src + ' : ' + r.length + ' instance(s) répondent' };
  });

  check('Aucun secret envoyé au navigateur', function () {
    var key = cfg_('SITE_NAV_KEY');
    var blob = JSON.stringify(clientConfig_()) + JSON.stringify(getSiteNav());
    return { ok: !key || blob.indexOf(key) === -1, detail: 'configuration client et barre d’onglets' };
  });

  check('Carte audio du PDF', function () {
    var map = getAudioMap_(), pages = Object.keys(map), bad = [], seen = {}, dup = [];
    pages.forEach(function (p) {
      map[p].forEach(function (a) {
        if (a.youtubeId !== 'NONE' && !/^[A-Za-z0-9_-]{11}$/.test(a.youtubeId)) bad.push(p + ':' + a.title);
        else if (a.youtubeId !== 'NONE') { if (seen[a.youtubeId]) dup.push(a.youtubeId); seen[a.youtubeId] = 1; }
      });
    });
    var total = pages.reduce(function (n, p) { return n + map[p].length; }, 0);
    var none = pages.reduce(function (n, p) { return n + map[p].filter(function (a) { return a.youtubeId === 'NONE'; }).length; }, 0);
    return { ok: !bad.length && !dup.length, detail: total + ' chants, ' + (total - none) + ' vidéos, ' + none + ' sans vidéo' + (bad.length ? ' ; identifiants invalides : ' + bad.join(', ') : '') + (dup.length ? ' ; vidéos en double : ' + dup.join(', ') : '') };
  });

  check('Pages-images du PDF', function () {
    var n = Object.keys(PAGE_IMAGES).length;
    return { ok: n === 11 && Object.keys(PAGE_IMAGES).every(function (k) { return getPageImage(k).length > 1000; }), detail: n + ' images' };
  });

  check('Export des paroles (fichiers .md embarqués)', function () {
    var n = CHANTS_MD.length;
    var okNames = CHANTS_MD.every(function (e) { return /^\d{3} - .+\.md$/.test(e[0]) && e[1].indexOf('---') !== -1; });
    return { ok: n >= 200 && okNames, detail: n + ' fichiers' };
  });

  check('Dossier Drive et fichiers exportés', function () {
    var root = DriveApp.getFolderById(cfg_('DRIVE_FOLDER_ID'));
    var it = root.getFoldersByName('chants');
    if (!it.hasNext()) return { ok: false, detail: 'sous-dossier « chants » absent : lancer exporterChantsDansDrive()' };
    var f = it.next().getFiles(), n = 0;
    while (f.hasNext()) { f.next(); n++; }
    var sh = root.getFilesByName(FEUILLE_REFERENCE_);
    return { ok: n === CHANTS_MD.length && sh.hasNext(), detail: n + ' / ' + CHANTS_MD.length + ' fichiers ; feuille ' + (sh.hasNext() ? 'présente' : 'ABSENTE') };
  });

  check('Barre d’onglets (projet « barre »)', function () {
    var nav = getSiteNav();
    return { ok: !!(nav && nav.tabs && nav.tabs.length), detail: nav ? nav.tabs.length + ' onglets, ' + (nav.connected ? 'connecté' : 'public') : 'indisponible' };
  });

  check('Service YouTube (API officielle)', function () {
    var v = fetchVideos_(['dQw4w9WgXcQ']);
    return { ok: !!v['dQw4w9WgXcQ'], detail: 'Videos.list répond' };
  });

  check('Annexes : cohérence des numéros', function () {
    var all = annexReadAll_(), probs = [];
    var letters = {};
    all.parts.forEach(function (p) { letters[p.letter] = 1; });
    var labels = {};
    all.songs.forEach(function (s) {
      var l = annexLabelOf_(s.page);
      if (!letters[s.letter]) probs.push(l + ' : partie ' + s.letter + ' inexistante');
      if (annexLetterOf_(s.page) !== s.letter) probs.push(l + ' : lettre incohérente');
      if (labels[l]) probs.push(l + ' en double');
      labels[l] = 1;
    });
    var pub = annexPublic_();
    all.songs.forEach(function (s) { if (!pub.content[s.page]) probs.push(annexLabelOf_(s.page) + ' : page non générée'); });
    return { ok: !probs.length, detail: all.parts.length + ' parties, ' + all.songs.length + ' chants' + (probs.length ? ' ; ' + probs.join(' ; ') : '') };
  });

  if (deep) {
    check('Annexes : aller-retour d’écriture (partie Z temporaire)', function () {
      var sp = PropertiesService.getScriptProperties();
      var had = annexReadAll_().parts.some(function (p) { return p.letter === 'Z'; });
      if (had) return { ok: false, detail: 'la partie Z existe déjà : test ignoré' };
      var created = 0;
      try {
        adminAnnexSavePart({ letter: 'Z', name: 'Test automatique', intro: '' });
        var r1 = adminAnnexSaveSong({ letter: 'Z', title: 'Chant de test', body: 'Refrain :\nLa la la\n\nPremier couplet\nsur deux lignes\n\nSecond couplet', cols: 1 });
        var r2 = adminAnnexSaveSong({ letter: 'Z', title: 'Autre chant', body: '1 - Un\n2 - Deux', cols: 2 });
        created = 2;
        var pub = annexPublic_();
        var ok = r1.label === 'Z1' && r2.label === 'Z2' && r1.page === 3501 && pub.content[3500] && pub.content[3501].indexOf('verse-number">2.<') !== -1 && pub.labels[3502] === 'Z2';
        adminAnnexDeleteSong(r1.page);
        var r3 = adminAnnexSaveSong({ letter: 'Z', title: 'Troisième', body: 'Texte' });
        ok = ok && r3.label === 'Z1';    // le numéro libre le plus bas est réutilisé
        return { ok: ok, detail: 'Z1, Z2 créés ; après suppression de Z1, le suivant reprend le numéro ' + r3.label };
      } finally {
        annexReadAll_().songs.filter(function (s) { return s.letter === 'Z'; }).forEach(function (s) { sp.deleteProperty(ANN_SONG_PREFIX_ + s.page); });
        sp.setProperty(ANN_PARTS_KEY_, JSON.stringify(annexReadAll_().parts.filter(function (p) { return p.letter !== 'Z'; })));
        annexInvalidate_();
      }
    });
  }

  return out;
}
