// Contrôle croisé : chaque couplet produit doit former, dans la mise en page texte du PDF (pdftotext -layout),
// une suite de lignes consécutives alignées dans la même colonne. Sinon : page à contrôler à l'œil.
// Usage : node tools/check-layout.js <layout.txt>
const fs = require('fs');
const lay = fs.readFileSync(process.argv[2], 'utf8').split('\f');
const g = JSON.parse(fs.readFileSync('tools/out/pages.json', 'utf8'));
const NORM = (t) => t.replace(/œ/g, 'oe').replace(/Œ/g, 'Oe').replace(/[’‘]/g, "'").replace(/[«»“”]/g, '"').replace(/ /g, ' ').normalize('NFD').replace(/[̀-ͯ]/g, '');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const bad = {};
Object.keys(g).map(Number).filter((p) => p > 4 && p < 231).sort((a, b) => a - b).forEach((p) => {
  const rows = NORM(lay[p + 1] || '').split('\n');
  [...g[p].matchAll(/<div class="(?:verse|refrain)[^"]*">([\s\S]*?)<\/div>(?=<|$)/g)].forEach((b) => {
    const lines = b[1].replace(/<div class="refrain-label">[^<]*<\/div>/, '').replace(/<span class="verse-number">\d+\.<\/span>/, '').split('<br>')
      .map((l) => NORM(l.replace(/<[^>]+>/g, '')).replace(/ \(bis\)$/, '').trim()).filter(Boolean);
    if (lines.length < 2) return;
    const cands = lines.map((l) => {
      const re = new RegExp(l.split(/\s+/).map(esc).join('\\s+'));
      const out = [];
      rows.forEach((r, i) => { const m = re.exec(r); if (m) out.push([i, m.index]); });
      return out;
    });
    // chaîne : lignes successives, rangées croissantes (écart <= 3), même colonne (±32 car.)
    let ok = false;
    (cands[0] || []).forEach(([r0, c0]) => {
      let r = r0, c = c0, good = true;
      for (let k = 1; k < cands.length && good; k++) {
        const nx = cands[k].find(([ri, ci]) => ri > r && ri - r <= 3 && Math.abs(ci - c) <= 32);
        if (!nx) good = false; else { r = nx[0]; c = nx[1]; }
      }
      if (good) ok = true;
    });
    if (!ok) (bad[p] = bad[p] || []).push(lines[0].slice(0, 40) + (cands.some((x) => !x.length) ? ' [introuvable]' : ''));
  });
});
const pages = Object.keys(bad);
pages.forEach((p) => console.log(p, bad[p].join(' || ')));
console.log('pages à contrôler :', pages.length);
