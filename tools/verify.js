// Base de vérification du carnet (hors ligne) : node tools/verify.js
// Contrôle la concordance avec le PDF, les données générées, le code Apps Script, les annexes et l'hygiène du dépôt.
// Code de sortie 0 = tout est bon ; 1 = au moins un échec.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/^﻿/, '');
const exists = (f) => fs.existsSync(path.join(root, f));
const nz = (s) => String(s || '').toLowerCase().replace(/œ/g, 'oe').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

const results = [];
function check(name, fn) {
  try {
    const r = fn();
    const problems = Array.isArray(r) ? r : (r === true || r === undefined ? [] : [String(r)]);
    results.push({ name, ok: problems.length === 0, problems });
  } catch (e) { results.push({ name, ok: false, problems: ['exception : ' + e.message] }); }
}
const loadData = (file, key) => {
  const html = read(file);
  const js = html.replace(/^\s*<script>/, '').replace(/<\/script>\s*$/, '').replace(/\\u003c/g, '<');
  const w = {}; new Function('window', js)(w); return w[key];
};

const songs = loadData('gas/DataSongs.html', 'songs_index_data');
const pagesIdx = loadData('gas/DataPages.html', 'pages_index_data');
const content = loadData('gas/DataContent.html', 'page_content_data');
const audioSrc = read('gas/AudioBase.gs');
const AUDIO = JSON.parse(audioSrc.slice(audioSrc.indexOf('{'), audioSrc.lastIndexOf('}') + 1));
const mdSrc = read('gas/ChantsMd.gs');
const CHANTS_MD = JSON.parse(mdSrc.slice(mdSrc.indexOf('['), mdSrc.lastIndexOf(']') + 1));
const TEXT_PAGES = [1, 2, 3, 4, 6];
const BLANK = [241, 243];
const PDF_PAGES = 246;

check('Pages 1 à 246 : toutes présentes (sauf les 2 pages blanches du PDF)', () => {
  const p = [];
  for (let n = 1; n <= PDF_PAGES - 2; n++) if (!content[n] && !BLANK.includes(n)) p.push('page ' + n + ' absente');
  const extra = Object.keys(content).map(Number).filter((n) => n > PDF_PAGES - 2 || (BLANK.includes(n)));
  extra.forEach((n) => p.push('page inattendue ' + n));
  return p;
});

check('Table alphabétique du PDF = chants du carnet (titre et page)', () => {
  if (!exists('tools/out/toc.json')) return ['tools/out/toc.json absent : lancer tools/check-toc.js <toc.txt>'];
  const toc = JSON.parse(read('tools/out/toc.json'));
  const strip = (s) => nz(s).replace(/s/g, '');
  const p = [];
  toc.forEach((e) => {
    const hit = songs.some((s) => s.page === e.page && (strip(s.title) === strip(e.title) || strip(s.title).includes(strip(e.title)) || strip(e.title).includes(strip(s.title))));
    if (!hit) p.push('table : « ' + e.title + ' » p.' + e.page + ' introuvable dans le carnet');
  });
  songs.forEach((s) => {
    const hit = toc.some((e) => e.page === s.page && (strip(s.title) === strip(e.title) || strip(s.title).includes(strip(e.title)) || strip(e.title).includes(strip(s.title))));
    if (!hit) p.push('carnet : « ' + s.title + ' » p.' + s.page + ' absent de la table du PDF');
  });
  return p;
});

check('Chaque chant du sommaire a son titre sur sa page', () => {
  const p = [];
  songs.forEach((s) => {
    const titles = [...(content[s.page] || '').matchAll(/class="song-title"[^>]*>([^<]*)</g)].map((m) => nz(m[1]));
    if (!titles.includes(nz(s.title))) p.push('« ' + s.title + ' » p.' + s.page);
  });
  return p;
});

check('Couplets numérotés : 1..N dans l’ordre (exceptions connues : p.110 sans 7, p.214 bilingue)', () => {
  const p = [];
  Object.keys(content).map(Number).sort((a, b) => a - b).forEach((n) => {
    if (n >= 231 && n <= 240) return;
    [...content[n].matchAll(/<section class="song">([\s\S]*?)<\/section>/g)].forEach((m) => {
      const nums = [...m[1].matchAll(/verse-number">(\d+)\./g)].map((x) => +x[1]);
      if (!nums.length || n === 110 || n === 214) return;
      if (nums.join() !== nums.map((_, i) => i + 1).join()) p.push('p.' + n + ' : ' + nums.join(','));
    });
  });
  return p;
});

check('Aucun vers collé à un autre (lignes anormalement longues hors prose)', () => {
  const p = [];
  Object.keys(content).map(Number).filter((n) => n >= 7 && n < 231).forEach((n) => {
    [...content[n].matchAll(/<div class="(?:verse|refrain)[^"]*">([\s\S]*?)<\/div>(?=<|$)/g)].forEach((b) => {
      b[1].split('<br>').forEach((l) => { const t = l.replace(/<[^>]+>/g, ''); if (t.length > 125) p.push('p.' + n + ' : ' + t.slice(0, 60)); });
    });
  });
  return p;
});

check('Carte audio : un enregistrement par chant, identifiants valides, pas de doublon', () => {
  const p = [], seen = {};
  songs.forEach((s) => {
    if (TEXT_PAGES.includes(s.page)) { if ((AUDIO[s.page] || []).length) p.push('p.' + s.page + ' est un texte mais a un audio'); return; }
    const e = (AUDIO[s.page] || []).find((a) => nz(a.title) === nz(s.title));
    if (!e) p.push('pas d’entrée audio : « ' + s.title + ' » p.' + s.page);
    else if (e.youtubeId !== 'NONE') {
      if (!/^[A-Za-z0-9_-]{11}$/.test(e.youtubeId)) p.push('identifiant invalide : ' + s.title);
      if (seen[e.youtubeId]) p.push('vidéo en double : ' + e.youtubeId + ' (' + seen[e.youtubeId] + ' / ' + s.title + ')');
      seen[e.youtubeId] = s.title;
    }
  });
  return p;
});

check('Fichiers .md : un par chant, aucun lien externe de dépôt', () => {
  const p = [];
  if (CHANTS_MD.length !== songs.length) p.push(CHANTS_MD.length + ' fichiers pour ' + songs.length + ' chants');
  CHANTS_MD.forEach(([name, text]) => { if (/github/i.test(text)) p.push(name + ' : lien GitHub'); if (!/^\d{3} - .+\.md$/.test(name)) p.push('nom : ' + name); });
  return p;
});

check('Pages-images : 11 images présentes', () => {
  const src = read('gas/ImgData.gs');
  const n = (src.match(/"\d+":"/g) || []).length;
  return n === 11 ? [] : [n + ' images au lieu de 11'];
});

check('Code Apps Script : syntaxe des fichiers .gs', () => {
  const p = [];
  fs.readdirSync(path.join(root, 'gas')).filter((f) => f.endsWith('.gs') && f !== 'NavConfig.gs').forEach((f) => {
    try { new vm.Script(read('gas/' + f), { filename: f }); } catch (e) { p.push(f + ' : ' + e.message); }
  });
  return p;
});

check('Code navigateur : syntaxe des scripts de App.html et Admin.html', () => {
  const p = [];
  ['gas/App.html', 'gas/Admin.html'].forEach((f) => {
    const html = read(f);
    [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach((m, i) => {
      try { new vm.Script(m[1], { filename: f + '#' + i }); } catch (e) { p.push(f + ' : ' + e.message); }
    });
  });
  return p;
});

check('Modèle Index.html : toutes les variables sont fournies par doGet', () => {
  const idx = read('gas/Index.html'), code = read('gas/Code.gs');
  const vars = [...idx.matchAll(/<\?!?=\s*([A-Za-z_]+)\s*\?>/g)].map((m) => m[1]);
  return vars.filter((v) => !new RegExp('t\\.' + v + '\\s*=').test(code)).map((v) => 'variable non fournie : ' + v);
});

check('Annexes : numérotation A, A1, B1… et conversion des paroles', () => {
  const p = [];
  const ctx = { CACHE_TTL: 1, normalize_: (s) => nz(s), extractYoutubeId_: (s) => s, requireAdmin_() {}, CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) }, PropertiesService: { getScriptProperties: () => ({ getProperties: () => ({}) }) } };
  vm.createContext(ctx);
  vm.runInContext(read('gas/Annexes.gs'), ctx);
  const f = (code) => vm.runInContext(code, ctx);
  if (f("annexPageOf_('A', 1)") !== 1001) p.push('A1 devrait être 1001');
  if (f("annexPageOf_('B', 1)") !== 1101) p.push('B1 devrait être 1101');
  if (f("annexLabelOf_(1000)") !== 'A') p.push('index de A');
  for (let li = 0; li < 26; li++) for (const seq of [1, 9, 10, 99]) {
    const L = String.fromCharCode(65 + li);
    const page = f(`annexPageOf_('${L}', ${seq})`);
    if (f(`annexLabelOf_(${page})`) !== L + seq) p.push('aller-retour ' + L + seq);
    if (page < 1000 || page <= 246) p.push('collision avec le PDF : ' + L + seq);
  }
  const h = f(`lyricsToHtml_('T<b>', 'Refrain :\\nLa la\\n\\nUn\\nDeux\\n\\nTrois', { cols: 2 })`);
  if (h.indexOf('<b>') !== -1 && h.indexOf('&lt;b&gt;') === -1) p.push('le HTML du titre n’est pas échappé');
  if (!/class="refrain"/.test(h) || !/verse-number">1\./.test(h) || !/verse-number">2\./.test(h) || !/cols c2/.test(h)) p.push('conversion des paroles : ' + h);
  const h2 = f(`lyricsToHtml_('X', '1 - a\\n\\n2 - b', {})`);
  if (!/verse-number">1\./.test(h2) || /verse-number">3\./.test(h2)) p.push('numéros saisis non respectés');
  return p;
});

check('Hygiène : pas de secret ni de lien GitHub dans le code déployé', () => {
  const p = [];
  const gi = read('.gitignore');
  if (!/gas\/NavConfig\.gs/.test(gi)) p.push('.gitignore doit exclure gas/NavConfig.gs');
  let key = '';
  if (exists('gas/NavConfig.gs')) key = (read('gas/NavConfig.gs').match(/SITE_NAV_KEY\s*=\s*'([^']+)'/) || [])[1] || '';
  fs.readdirSync(path.join(root, 'gas')).forEach((f) => {
    if (f === 'NavConfig.gs') return;
    const t = read('gas/' + f);
    if (key && t.includes(key)) p.push('clé partagée trouvée dans gas/' + f);
    if (/github\.com/i.test(t) && f !== 'Style.html') p.push('lien GitHub dans gas/' + f);
  });
  return p;
});

check('Taille du projet Apps Script raisonnable (< 6 Mo)', () => {
  let total = 0;
  fs.readdirSync(path.join(root, 'gas')).forEach((f) => { total += fs.statSync(path.join(root, 'gas', f)).size; });
  return total < 6 * 1024 * 1024 ? [] : ['taille ' + Math.round(total / 1024) + ' Ko'];
});

// --- rapport ---
let ko = 0;
results.forEach((r) => {
  console.log((r.ok ? '  OK  ' : ' ÉCHEC') + '  ' + r.name);
  r.problems.slice(0, 12).forEach((x) => console.log('        - ' + x));
  if (r.problems.length > 12) console.log('        … +' + (r.problems.length - 12));
  if (!r.ok) ko++;
});
console.log('\n' + (results.length - ko) + ' / ' + results.length + ' contrôles réussis' + (ko ? ' — ' + ko + ' en échec' : ''));
process.exit(ko ? 1 : 0);
