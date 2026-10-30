// Génère la version hébergée (GitHub Pages) à partir des MÊMES sources que la version Apps Script (gas/) :
// même contenu reconstruit d'après le PDF, même interface, mêmes styles, même application cliente.
// Usage : node tools/build-gas.js && node tools/build-github.js
// Sortie : index.html, assets/style.css, assets/app.js, data/carnet-data.js, data/pdf-pages/*.jpg
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.join(__dirname, '..');
const gas = (f) => fs.readFileSync(path.join(root, 'gas', f), 'utf8').replace(/^﻿/, '');
const out = (f, c) => { const p = path.join(root, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const strip = (html, tag) => html.replace(new RegExp('^\\s*<' + tag + '>\\s*', 'i'), '').replace(new RegExp('\\s*</' + tag + '>\\s*$', 'i'), '');

// Liaison avec la barre d'onglets du site (API publique ?api=nav, sans clé)
const NAV_BASE = 'https://script.google.com/macros/s/AKfycbw2ZbmN4o1EO5kfj5MLHtzgPXwTEWYU1s3n37ew2WzuGEDtRcXn-jXjxEbi2U0cUI-z/exec';

// --- données : on réutilise les fichiers générés pour Apps Script ---
const dataJs = ['DataSongs', 'DataPages', 'DataContent'].map((f) => strip(gas(f + '.html'), 'script').trim()).join('\n');
const audioSrc = gas('AudioBase.gs');
const audio = JSON.parse(audioSrc.slice(audioSrc.indexOf('{'), audioSrc.lastIndexOf('}') + 1));
const cfgSrc = gas('Config.gs');
const fb = new Function('return ' + cfgSrc.match(/NAV_FALLBACK: (JSON\.stringify\(\[[\s\S]*?\]\))\n/)[1])();
const cfg = {
  textPages: [1, 2, 3, 4, 6],
  ytHost: 'https://www.youtube-nocookie.com',
  playerSource: 'hidden',            // lecteur YouTube masqué + bouton « relancer » (système historique de la version GitHub)
  navTab: 'documentation',
  navBase: NAV_BASE,
  navDomain: 'fsggb.fr',
  navFallback: JSON.parse(fb),
  imgBase: 'data/pdf-pages/'
};
const safe = (s) => s.replace(/<(\/script|!--)/gi, '\\u003c$1');
const dataFile = '// Généré par tools/build-github.js — ne pas éditer à la main.\n' +
  'window.CARNET_AUDIO=' + safe(JSON.stringify(audio)) + ';\n' + dataJs + '\n';
const h = (s) => crypto.createHash('md5').update(s).digest('hex').slice(0, 8);

// --- styles et application ---
const css = strip(gas('Style.html'), 'style') + '\n' + strip(gas('StyleExtra.html'), 'style');
const appJs = strip(gas('App.html'), 'script');
out('assets/style.css', css);
out('assets/app.js', appJs);
out('data/carnet-data.js', dataFile);

// --- images des pages-images du PDF ---
const imgSrc = gas('ImgData.gs');
const imgs = JSON.parse(imgSrc.slice(imgSrc.indexOf('{'), imgSrc.lastIndexOf('}') + 1));
Object.keys(imgs).forEach((n) => out('data/pdf-pages/' + n + '.jpg', Buffer.from(imgs[n], 'base64')));

// --- index.html : même modèle que la version Apps Script ---
let html = gas('Index.html');
html = html.replace("<?!= include('Style') ?>", '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">\n    <link rel="stylesheet" href="assets/style.css?v=' + h(css) + '">')
  .replace("<?!= include('StyleExtra') ?>", '');
const a = html.indexOf('<script>\n      window.CARNET_AUDIO');
const b = html.indexOf('</body>');
if (a < 0 || b < 0) throw new Error('Modèle Index.html inattendu');
html = html.slice(0, a) +
  '<script>\n' +
  '      window.CARNET_START_PAGE = Number(new URLSearchParams(location.search).get(\'p\')) || 0;\n' +
  '      window.CARNET_BASE_URL = location.origin + location.pathname;\n' +
  '      window.__NAV__ = null;\n' +
  '      window.CARNET_CFG = ' + JSON.stringify(cfg) + ';\n' +
  '      window.CARNET_ANNEX = null;\n' +
  '    </script>\n' +
  '    <script src="data/carnet-data.js?v=' + h(dataFile) + '"></script>\n' +
  '    <script src="assets/app.js?v=' + h(appJs) + '"></script>\n' +
  html.slice(b);
if (/<\?/.test(html)) throw new Error('Balise de modèle restante dans index.html');
out('index.html', html);
console.log('GitHub Pages régénéré : index.html, assets/ (', Math.round(css.length / 1024), 'Ko css,', Math.round(appJs.length / 1024), 'Ko js ), data/ (', Math.round(dataFile.length / 1024), 'Ko,', Object.keys(imgs).length, 'images )');
