// Détecte les vers anormalement longs (probablement deux vers collés) et les couplets de longueur atypique.
const g = JSON.parse(require('fs').readFileSync('tools/out/pages.json', 'utf8'));
let n = 0;
Object.keys(g).map(Number).sort((a, b) => a - b).filter((p) => p < 231).forEach((p) => {
  [...g[p].matchAll(/<section class="song">([\s\S]*?)<\/section>/g)].forEach((m) => {
    const t = (m[1].match(/class="song-title">([^<]*)</) || [])[1] || '';
    const lines = [];
    [...m[1].matchAll(/<div class="(?:verse|refrain)[^"]*">([\s\S]*?)<\/div>(?=<|$)/g)].forEach((b) => b[1].replace(/<div class="refrain-label">[^<]*<\/div>/, '').replace(/<span class="verse-number">\d+\.<\/span>/, '').split('<br>').forEach((l) => lines.push(l.replace(/<[^>]+>/g, '').trim())));
    if (lines.length < 4) return;
    const lens = lines.map((l) => l.length).sort((a, b) => a - b);
    const med = lens[Math.floor(lens.length / 2)];
    const odd = lines.filter((l) => l.length > Math.max(med * 1.45, med + 22));
    if (odd.length) { n++; console.log(p, t, '(méd ' + med + ')\n   ' + odd.map((l) => l.length + ': ' + l.slice(0, 110)).join('\n   ')); }
  });
});
console.log('chants suspects :', n);
