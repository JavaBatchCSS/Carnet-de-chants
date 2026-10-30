// Exporte un fichier Markdown par chant (chants/<page> - <titre>.md) + un index CSV pour la feuille de référence.
// Usage : node tools/export-md.js   (après tools/rebuild-pages.js et tools/build-gas.js)
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const gen = JSON.parse(fs.readFileSync(path.join(root, 'tools/out/pages.json'), 'utf8'));
const audioSrc = fs.readFileSync(path.join(root, 'gas/AudioBase.gs'), 'utf8');
const AUDIO = JSON.parse(audioSrc.slice(audioSrc.indexOf('{'), audioSrc.lastIndexOf('}') + 1));
const APP = 'https://script.google.com/macros/s/AKfycbyDCjAt0IJFIHXLTASJxKuhERNNgBvq50DtKWYuoF1mEPMXpCw0wUz70IucsB2tO8NIYQ/exec';
const RENAME = { 'Montjoie': 'Notre Dame, Montjoie', "Au 31 du mois d'août": 'Au trente et un du mois d’août' };
const dec = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const TEXT_PAGES = [1, 2, 3, 4, 6];
const fileName = (p, t) => String(p).padStart(3, '0') + ' - ' + t.replace(/[\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() + '.md';

const outDir = path.join(root, 'chants');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir);
const rows = [['Page', 'Titre', 'Lien carnet', 'Fichier MD', 'YouTube', 'Couplets']];
let count = 0;
Object.keys(gen).map(Number).sort((a, b) => a - b).forEach((p) => {
  [...gen[p].matchAll(/<section class="song">([\s\S]*?)<\/section>/g)].forEach((m) => {
    const body = m[1];
    const t0 = dec((body.match(/class="song-title">([^<]*)</) || [])[1] || '');
    if (!t0 || /^Table /.test(t0)) return;
    const title = RENAME[t0] || t0;
    const blocks = [...body.matchAll(/<div class="(refrain|verse)[^"]*">([\s\S]*?)<\/div>(?=<|$)/g)].map((b) => {
      const inner = b[2];
      if (b[1] === 'refrain') {
        const lab = (inner.match(/refrain-label">([^<]*)</) || [])[1] || 'Refrain :';
        const lines = inner.replace(/<div class="refrain-label">[^<]*<\/div>/, '').split('<br>').map((l) => dec(l.replace(/<[^>]+>/g, '')));
        return '> **' + lab + '**  \n' + lines.map((l) => '> ' + l).join('  \n');
      }
      const num = (inner.match(/verse-number">(\d+)\./) || [])[1];
      const lines = inner.replace(/<span class="verse-number">\d+\.<\/span>/, '').split('<br>').map((l) => dec(l.replace(/<[^>]+>/g, '')));
      return (num ? '**' + num + '.** ' : '') + lines.join('  \n');
    });
    const au = (AUDIO[p] || []).find((a) => a.title === title || a.title === t0);
    const isText = TEXT_PAGES.includes(p);
    const yt = !isText && au && au.youtubeId !== 'NONE' ? 'https://www.youtube.com/watch?v=' + au.youtubeId : '';
    const md = '# ' + title + '\n\n- Page du carnet : ' + p + '\n- Carnet en ligne : ' + APP + '?p=' + p + '\n- Type : ' + (isText ? 'texte (pas de chant)' : 'chant') + (isText ? '' : '\n- Vidéo : ' + (yt || 'aucune')) + '\n\n---\n\n' + blocks.join('\n\n') + '\n';
    const fn = fileName(p, title);
    fs.writeFileSync(path.join(outDir, fn), md, 'utf8');
    rows.push([p, title, APP + '?p=' + p, fn, yt, (body.match(/verse-number/g) || []).length]);
    count++;
  });
});
const md = fs.readdirSync(outDir).sort().map((f) => [f, fs.readFileSync(path.join(outDir, f), 'utf8')]);
fs.writeFileSync(path.join(root, 'gas/ChantsMd.gs'), ['// Généré par tools/export-md.js — un fichier .md par chant, écrit dans le Drive par exporterChantsDansDrive().', 'const CHANTS_MD = ' + JSON.stringify(md) + ';', ''].join(String.fromCharCode(10)), 'utf8');
const csv = rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
fs.writeFileSync(path.join(root, 'tools/out/chants.csv'), '\ufeff' + csv, 'utf8');
console.log(count, 'chants exportés dans chants/');
