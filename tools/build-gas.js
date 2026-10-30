// Génère les fichiers de données / styles du projet Apps Script (gas/) à partir des sources du dépôt.
// Usage : node tools/build-gas.js
//   - tools/out/pages.json : pages reconstruites depuis le PDF (node tools/rebuild-pages.js <bbox.html>)
//   - tools/out/img/*.jpg  : pages-images du PDF (pdftoppm -jpeg -r 100 -f N -l N ...)
//   - tools/audio-overrides.json : corrections manuelles de la carte audio
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/^﻿/, '');
const write = (f, c) => fs.writeFileSync(path.join(root, 'gas', f), c, 'utf8');

// Pages du carnet qui sont des images (n° imprimé -> n° de page PDF) : séparateurs de section et illustrations.
const IMAGE_PAGES = { 5: 7, 25: 27, 69: 71, 97: 99, 113: 115, 160: 162, 161: 163, 200: 202, 201: 203, 242: 244, 244: 246 };
const DIVIDERS = { 5: 'Chants de prières', 25: 'Chants scouts', 69: 'Chants marins', 97: 'Chants de la fleur de lys', 113: 'Chants de tradition', 161: 'Chants de guerre', 201: 'Chants de veillée' };
const BLANK_PAGES = ['241', '243'];
const TEXT_PAGES = [1, 2, 3, 4, 6]; // prières et textes : pas de chant, donc pas d'audio
const TITLE_FIX = { 75: 'Au trente et un du mois d’août' };

// Dans du JSON, on neutralise </script et <!-- (échappement unicode, équivalent pour le parseur JS).
const safe = (json) => json.replace(/<(\/script|!--)/gi, '\\u003c$1');
const normKey = (s) => String(s || '').toLowerCase().replace(/œ/g, 'oe').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

const load = (file) => { const h = {}; new Function('window', read(file))(h); return h; };
const RENAME = { 'Montjoie': 'Notre Dame, Montjoie', "Au 31 du mois d'août": 'Au trente et un du mois d’août' }; // titres tels qu'imprimés dans le PDF
const songs = load('public/songs-index.js').songs_index_data.filter((s) => !IMAGE_PAGES[s.page])
  .map((s) => Object.assign({}, s, { title: RENAME[s.title] || s.title }));
const pagesIdx = load('public/pages-index.js').pages_index_data;
const content = load('public/page-content.js').page_content_data;
const gen = JSON.parse(read('tools/out/pages.json'));

// --- pages-index ---
Object.keys(IMAGE_PAGES).forEach((n) => {
  pagesIdx[n] = Object.assign({ songs: [] }, pagesIdx[n], DIVIDERS[n] ? { isSectionDivider: true, sectionName: DIVIDERS[n] } : { isImagePage: true });
});
BLANK_PAGES.forEach((n) => { delete pagesIdx[n]; });

// --- contenu des pages ---
const pages = {};
Object.keys(content).forEach((n) => { pages[n] = content[n]; });
Object.keys(gen).forEach((n) => {
  if (pages[n] && pages[n].indexOf('toc-page') !== -1) return; // tables : liens cliquables conservés
  pages[n] = gen[n];
});
Object.keys(TITLE_FIX).forEach((n) => {
  pages[n] = pages[n].replace(/(<div class="song-title"[^>]*>)[^<]*/, '$1' + TITLE_FIX[n]);
});
Object.keys(IMAGE_PAGES).forEach((n) => {
  pages[n] = '<div class="pdfimg" data-img="' + n + '" data-alt="' + (DIVIDERS[n] || 'Illustration du carnet') + '"></div>';
});
BLANK_PAGES.forEach((n) => { delete pages[n]; });
Object.keys(pages).forEach((k) => {
  pages[k] = pages[k].replace(/\s*\n\s*/g, ' ').replace(/>\s+</g, '><').trim();
});

write('DataSongs.html', '<script>window.songs_index_data=' + safe(JSON.stringify(songs)) + ';</script>\n');
write('DataPages.html', '<script>window.pages_index_data=' + safe(JSON.stringify(pagesIdx)) + ';</script>\n');
write('DataContent.html', '<script>window.page_content_data=' + safe(JSON.stringify(pages)) + ';</script>\n');

// --- carte audio de base : une entrée par chant, dans l'ordre des titres de chaque page ---
const old = load('public/audio-map.js').audio_map_data;
const audio = {};
Object.keys(pages).forEach((p) => {
  const titles = [...pages[p].matchAll(/class="song-title"[^>]*>([^<]*)</g)].map((m) => m[1].trim());
  if (!titles.length || TEXT_PAGES.includes(Number(p))) return;
  const prev = (old[p] || []).slice();
  audio[p] = titles.map((t, i) => {
    const e = prev.find((a) => normKey(a.title) === normKey(t)) ||
      prev.find((a) => normKey(a.title).includes(normKey(t)) || normKey(t).includes(normKey(a.title))) ||
      (prev.length === titles.length ? prev[i] : null);
    return { title: t, youtubeId: e ? e.youtubeId : 'NONE' };
  });
});
// corrections issues de l'audit YouTube
const ov = JSON.parse(read('tools/audio-overrides.json'));
Object.keys(ov).forEach((k) => {
  if (k[0] === '_') return;
  const [p, t] = k.split('|');
  const e = (audio[p] || []).find((a) => normKey(a.title) === normKey(t));
  if (!e) throw new Error('Surcharge sans chant correspondant : ' + k);
  e.youtubeId = ov[k];
});
write('AudioBase.gs', '// Généré par tools/build-gas.js depuis public/audio-map.js — ne pas éditer à la main.\nconst AUDIO_BASE = ' + JSON.stringify(audio) + ';\n');

// --- images des pages (servies à la demande par getPageImage) ---
const imgs = {};
Object.keys(IMAGE_PAGES).forEach((n) => {
  imgs[n] = fs.readFileSync(path.join(root, 'tools', 'out', 'img', 'pdf-' + String(IMAGE_PAGES[n]).padStart(3, '0') + '.jpg')).toString('base64');
});
write('ImgData.gs', '// Généré par tools/build-gas.js (rendu des pages-images du PDF) — ne pas éditer à la main.\nconst PAGE_IMAGES = ' + JSON.stringify(imgs) + ';\n');

write('Style.html', '<style>\n' + read('tools/src/style.base.css') + '\n</style>\n');
console.log('gas/ régénéré :', Object.keys(pages).length, 'pages,', songs.length, 'chants');
