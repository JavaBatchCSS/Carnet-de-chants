// Compare la table alphabétique du PDF (pdftotext -layout) aux titres des pages reconstruites.
const fs = require('fs');
const toc = fs.readFileSync(process.argv[2], 'utf8');
const start = toc.indexOf('Table alphabétique'), end = toc.indexOf('Table thématique');
const nz = (s) => String(s).toLowerCase().replace(/œ/g, 'oe').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '').replace(/s/g, '');
const entries = [];
toc.slice(start + 17, end).split('\n').forEach((l) => {
  for (const m of l.matchAll(/(\S.*?)\s+(\d{1,3})(?=\s{2,}|\s*$)/g)) entries.push({ title: m[1].trim(), page: +m[2] });
});
const gen = JSON.parse(fs.readFileSync('tools/out/pages.json', 'utf8'));
const have = {};
Object.keys(gen).forEach((p) => { [...gen[p].matchAll(/class="song-title"[^>]*>([^<]*)</g)].forEach((m) => { (have[p] = have[p] || []).push(m[1]); }); });
console.log('entrées table:', entries.length);
const miss = entries.filter((e) => !(have[e.page] || []).some((t) => nz(t) === nz(e.title) || nz(t).includes(nz(e.title)) || nz(e.title).includes(nz(t))));
console.log('dans la table mais pas de titre correspondant sur la page :'); miss.forEach((e) => console.log('  ', e.page, e.title, '| titres page:', JSON.stringify(have[e.page] || [])));
const inToc = new Set(entries.map((e) => e.page + '|' + nz(e.title)));
console.log('titres de pages absents de la table :');
Object.keys(have).forEach((p) => have[p].forEach((t) => { if (!entries.some((e) => e.page == p && (nz(e.title) === nz(t) || nz(t).includes(nz(e.title)) || nz(e.title).includes(nz(t))))) console.log('  ', p, t); }));
fs.writeFileSync('tools/out/toc.json', JSON.stringify(entries));
