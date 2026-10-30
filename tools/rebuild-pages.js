// Reconstruit le contenu de chaque page du carnet à partir de la géométrie du PDF (pdftotext -bbox-layout).
// Usage : node tools/rebuild-pages.js <bbox.html> [songs-index.js]
// Sortie : tools/out/pages.json  { "<n° de page>": "<html>" }  (n° imprimé = page PDF - 2)
const fs = require('fs');
const path = require('path');
const bboxFile = process.argv[2];
const xml = fs.readFileSync(bboxFile, 'utf8');
const holder = {};
new Function('window', fs.readFileSync(path.join(__dirname, '..', 'public', 'songs-index.js'), 'utf8').replace(/^﻿/, ''))(holder);
const knownTitles = holder.songs_index_data || [];

const nz = (s) => String(s || '').toLowerCase().replace(/œ/g, 'oe').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dec = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const num = (v) => parseFloat(v);

const pages = xml.split('<page ').slice(1);
const out = {};
const stats = { pages: 0, titles: 0 };

pages.forEach((chunk, i) => {
  const pdfIdx = i + 1;
  const n = pdfIdx - 2;
  if (n < 1) return;
  const W = num(chunk.match(/width="([\d.]+)"/)[1]);
  const H = num(chunk.match(/height="([\d.]+)"/)[1]);
  const lines = [];
  // Une « ligne » de pdftotext peut chevaucher deux colonnes voisines : on la redécoupe aux grands espaces
  // et devant un numéro de couplet (« 4 - »).
  for (const m of chunk.matchAll(/<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/line>/g)) {
    const ws0 = [...m[5].matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)]
      .map((w) => ({ x: num(w[1]), y: num(w[2]), x2: num(w[3]), y2: num(w[4]), t: dec(w[5]) }));
    const ws = ws0.filter((w) => !/^[{}]+$/.test(w.t));
    if (!ws.length) continue;
    const h = num(m[4]) - num(m[2]);
    const segs = [[]];
    ws.forEach((w, k) => {
      const prev = ws[k - 1];
      const bigGap = prev && h < 22 && w.x - prev.x2 > h * 2.5;
      const numStart = prev && h < 22 && /^\d{1,2}$/.test(w.t) && ws[k + 1] && /^[-–]/.test(ws[k + 1].t) && w.x - prev.x2 > 1.5;
      if (bigGap || numStart) segs.push([]);
      segs[segs.length - 1].push(w);
    });
    segs.forEach((sg) => {
      const text = sg.map((w) => w.t).join(' ').trim();
      if (!text) return;
      lines.push({ x: Math.min(...sg.map((w) => w.x)), y: Math.min(...sg.map((w) => w.y)), x2: Math.max(...sg.map((w) => w.x2)), y2: Math.max(...sg.map((w) => w.y2)), text, ws: sg });
    });
  }
  if (!lines.length) return;
  // numéro imprimé du bas de page
  const footer = lines.filter((l) => /^\d{1,3}$/.test(l.text.trim()) && l.y > H * 0.85 && Math.abs((l.x + l.x2) / 2 - W / 2) < W * 0.1);
  const body = lines.filter((l) => !footer.includes(l));
  if (!body.length) return;
  body.forEach((l) => { l.h = l.y2 - l.y; l.text = l.text.replace(/\s+bis\s*$/i, ' (bis)'); });
  // accolades : supprimées ; « bis » en marge : rattaché à la 2e des deux lignes qu'il couvre
  for (let k = body.length - 1; k >= 0; k--) if (/^[{}•·●]+$/.test(body[k].text)) body.splice(k, 1);
  for (let k = body.length - 1; k >= 0; k--) {
    const bl = body[k];
    if (!/^\(?bis\)?$/i.test(bl.text)) continue;
    const yc = (bl.y + bl.y2) / 2;
    const cand = body.filter((o) => o !== bl && o.x < bl.x && o.x2 <= bl.x + 8 && bl.x - o.x2 < 45 && !/^\(?bis\)?$/i.test(o.text))
      .sort((p, q) => Math.abs((p.y + p.y2) / 2 - yc) - Math.abs((q.y + q.y2) / 2 - yc)).slice(0, 2);
    if (cand.length) { const tgt = cand.sort((p, q) => q.y - p.y)[0]; if (!/bis\)$/.test(tgt.text)) tgt.text += ' (bis)'; body.splice(k, 1); }
  }

  // Titres : police nettement plus grande que le corps
  const bodyH = body.map((l) => l.h).sort((a, b) => a - b)[Math.floor(body.length / 2)];
  const isTitle = (l) => l.h >= Math.max(22, bodyH * 1.7) && (l.text.match(/[A-Za-zÀ-ÿ]/g) || []).length >= 3;
  const titleLines = body.filter(isTitle).sort((a, b) => a.y - b.y || a.x - b.x);
  const rest = body.filter((l) => !isTitle(l));

  // regroupement des lignes de titre (même chant) : proches verticalement et centres alignés
  const titles = [];
  titleLines.forEach((l) => {
    const c = (l.x + l.x2) / 2;
    const t = titles.find((t) => l.y - t.y2 < l.h * 0.9 && Math.abs(c - (t.x + t.x2) / 2) < 70);
    if (t) { t.lines.push(l.text); t.x = Math.min(t.x, l.x); t.x2 = Math.max(t.x2, l.x2); t.y2 = Math.max(t.y2, l.y2); }
    else titles.push({ lines: [l.text], x: l.x, x2: l.x2, y: l.y, y2: l.y2, h: l.h });
  });
  titles.sort((a, b) => a.x - b.x);

  // colonnes : on regroupe les bords gauches des lignes (les colonnes voisines peuvent se frôler, pas leurs marges)
  const xs = [...new Set(rest.map((l) => Math.round(l.x)))].sort((p, q) => p - q);
  let groups = [];
  xs.forEach((x) => { const g = groups[groups.length - 1]; if (g && x - g.hi <= W * 0.07) { g.hi = x; g.n += rest.filter((l) => Math.round(l.x) === x).length; } else groups.push({ lo: x, hi: x, n: rest.filter((l) => Math.round(l.x) === x).length }); });
  // un groupe trop petit (1-2 lignes) est une ligne centrée ou décalée : fusionné avec le voisin le plus proche
  while (groups.length > 1) {
    const k = groups.findIndex((g) => g.n < 3);
    if (k < 0) break;
    const left = groups[k - 1], right = groups[k + 1];
    const toLeft = left && (!right || groups[k].lo - left.hi <= right.lo - groups[k].hi);
    const t = toLeft ? left : right;
    t.lo = Math.min(t.lo, groups[k].lo); t.hi = Math.max(t.hi, groups[k].hi); t.n += groups[k].n;
    groups.splice(k, 1);
  }
  // mise en page « tableau » (numéro ou « Refrain » en marge, texte à distance) : une seule colonne
  const labelRows = rest.filter((a) => /^(\d{1,2}\s*[-–]?|refrain\s*:?)$/i.test(a.text) && rest.some((b) => b !== a && b.x > a.x2 + 12 && Math.abs(b.y - a.y) < 4)).length;
  if (labelRows >= 2 && n < 231 && groups.length > 1 && !rest.some((l) => l.x > W * 0.42)) groups = [{ lo: groups[0].lo, hi: groups[groups.length - 1].hi, n: rest.length }];
  const bands = groups.map((g) => [g.lo, g.hi]);
  const cuts = groups.slice(1).map((g, k) => (groups[k].hi + g.lo) / 2);
  const bandOf = (l) => cuts.filter((c) => l.x > c).length;
  // « amorces de colonne » : bords gauches fréquents (écart > 2,5 % de la largeur), avec les rangées qu'ils occupent
  let subs = [];
  const calcSubs = () => {
    subs = [];
    if (groups.length < 2) return;
    const ls = rest.slice().sort((p, q) => p.x - q.x);
    let cur = null;
    ls.forEach((l) => {
      if (cur && l.x - cur.hi <= W * 0.025) { cur.hi = l.x; cur.ys.push(l.y); cur.n++; }
      else { cur = { lo: l.x, hi: l.x, ys: [l.y], n: 1 }; subs.push(cur); }
    });
    subs = subs.filter((c) => c.n >= 2 && c.lo > groups[0].hi + 15).map((c) => ({ lo: c.lo, y0: Math.min(...c.ys), y1: Math.max(...c.ys) }));
  };
  for (let pass = 0; pass < 3; pass++) {
  calcSubs();
  // une ligne qui déborde sur la colonne voisine est coupée au premier mot qui commence dans cette colonne
  for (let k = rest.length - 1; k >= 0; k--) {
    const l = rest[k];
    if (!l.ws) continue;
    let pieces = [l.ws];
    subs.forEach((sc) => {
      if (l.y < sc.y0 - l.h * 1.05 || l.y > sc.y1 + l.h * 1.05) return;
      pieces = pieces.flatMap((p) => {
        const j = p.findIndex((w) => w.x >= sc.lo - 1);
        return j > 0 && p[0].x < sc.lo - 6 ? [p.slice(0, j), p.slice(j)] : [p];
      });
    });
    if (pieces.length < 2) continue;
    const parts = pieces.map((p) => ({ x: Math.min(...p.map((w) => w.x)), y: l.y, x2: Math.max(...p.map((w) => w.x2)), y2: l.y2, h: l.h, text: p.map((w) => w.t).join(' ').trim(), ws: p }));
    if (process.env.AUDIT) console.log('COUPE p' + n, JSON.stringify(parts.map((q) => q.text.slice(0, 22))));
    rest.splice(k, 1, ...parts);
  }
  }
  rest.forEach((l) => { l.b = bandOf(l); });
  rest.sort((a, b) => a.b - b.b || a.y - b.y || a.x - b.x);
  for (let k = rest.length - 1; k > 0; k--) {
    const p = rest[k - 1], q = rest[k];
    if (p.b === q.b && Math.abs(p.y - q.y) < q.h * 0.4) { if (process.env.AUDIT) console.log('FUSION p' + n, Math.round(q.x - p.x2) + 'pt', JSON.stringify(p.text.slice(-25)), '+', JSON.stringify(q.text.slice(0, 25))); p.text += ' ' + q.text; p.x2 = Math.max(p.x2, q.x2); rest.splice(k, 1); }
  }

  // --- sortie sémantique : chants / colonnes / couplets / refrains (la mise en page s'adapte à l'écran) ---
  let html = '';
  const used = titles.map((t) => {
    const raw = t.lines.join(' ').replace(/\s+/g, ' ').trim();
    // la police des titres perd les « s » à l'extraction : comparaison sans « s »
    const ns = (x) => nz(x).replace(/s/g, '');
    const k = ns(raw);
    const known = knownTitles.find((s) => s.page === n && ns(s.title) === k) || knownTitles.find((s) => s.page === n && (ns(s.title).startsWith(k) || k.startsWith(ns(s.title))));
    return { raw, text: known ? known.title : raw, t, lines: [] };
  });
  used.sort((a, b) => a.t.y - b.t.y || a.t.x - b.t.x);
  const sideBySide = used.length > 1 && Math.max(...used.map((u) => u.t.y)) - Math.min(...used.map((u) => u.t.y)) < 20;
  const orphans = [];
  rest.forEach((l) => {
    if (!used.length) { orphans.push(l); return; }
    let u;
    if (sideBySide) {
      const c = (l.x + l.x2) / 2;
      u = used.reduce((best, cur) => (Math.abs((cur.t.x + cur.t.x2) / 2 - c) < Math.abs((best.t.x + best.t.x2) / 2 - c) ? cur : best));
    } else {
      u = used.filter((x) => x.t.y <= l.y + 1).pop() || used[0];
    }
    u.lines.push(l);
  });
  const NUM = /^(\d{1,2})\s*[-–.)]\s*(.*)$/;
  const REF = /^(dernier refrain|refrain final|refrain|coda|final|solo|chœur|choeur)\b\s*:?\s*(.*)$/i;
  // lignes -> blocs (couplet / refrain) : coupure sur interligne, numéro ou « Refrain »
  const toBlocks = (ls) => {
    const blocks = []; let cur = null, prev = null;
    ls.forEach((l) => {
      const gap = prev && l.y - prev.y2 > l.h * 0.55;
      if (!cur || gap || NUM.test(l.text) || REF.test(l.text)) { cur = { lines: [], y: l.y, bd: l.b }; blocks.push(cur); }
      cur.lines.push(l.text); prev = l;
    });
    return blocks;
  };
  const renderBlock = (bl) => {
    const first = bl.lines[0];
    let m;
    if ((m = REF.exec(first))) {
      const label = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() + ' :';
      const body = (m[2] ? [m[2]] : []).concat(bl.lines.slice(1)).map(esc).join('<br>');
      return '<div class="refrain"><div class="refrain-label">' + label + '</div>' + body + '</div>';
    }
    if ((m = NUM.exec(first))) {
      return '<div class="verse"><span class="verse-number">' + m[1] + '.</span>' + [m[2]].concat(bl.lines.slice(1)).map(esc).join('<br>') + '</div>';
    }
    return '<div class="verse nonum">' + bl.lines.map(esc).join('<br>') + '</div>';
  };
  const renderBody = (ls) => {
    if (!ls.length) return '';
    const bandIds = [...new Set(ls.map((l) => l.b))].sort((x, y) => x - y);
    // ordre de lecture d'origine (colonne par colonne), puis remise dans l'ordre des numéros de couplets
    let blocks = [];
    bandIds.forEach((id) => { blocks = blocks.concat(toBlocks(ls.filter((l) => l.b === id))); });
    // un couplet qui déborde en haut de la colonne suivante : ses dernières lignes rejoignent le couplet numéroté qui précède
    if (blocks.filter((bl) => NUM.test(bl.lines[0])).length >= 2) {
      for (let k = blocks.length - 1; k > 0; k--) {
        const bl = blocks[k], pv = blocks[k - 1];
        if (!NUM.test(bl.lines[0]) && !REF.test(bl.lines[0]) && bl.bd > pv.bd && NUM.test(pv.lines[0])) { pv.lines = pv.lines.concat(bl.lines); blocks.splice(k, 1); }
      }
    }
    blocks.forEach((bl, k) => { bl.k = k; const m = NUM.exec(bl.lines[0]); if (m) bl.key = +m[1]; });
    blocks.forEach((bl) => {
      if (bl.key !== undefined) return;
      const cands = blocks.filter((o) => o.key !== undefined && o.bd <= bl.bd && o.y <= bl.y + 1);
      const same = cands.filter((o) => o.bd === bl.bd);
      const above = (same.length ? same : cands).sort((p, q) => q.y - p.y || q.bd - p.bd)[0];
      bl.key = above ? above.key + 0.5 : 0;
    });
    const numbered = blocks.filter((bl) => NUM.test(bl.lines[0])).length;
    const nums = blocks.filter((bl) => NUM.test(bl.lines[0])).map((bl) => bl.key);
    if (numbered >= 2 && new Set(nums).size === nums.length) blocks.sort((p, q) => p.key - q.key || p.k - q.k);
    let head = '';
    if (bandIds.length > 1 && blocks.length > 1 && REF.test(blocks[0].lines[0])) head = renderBlock(blocks.shift());
    if (bandIds.length === 1) return head + blocks.map(renderBlock).join('');
    return head + '<div class="cols c' + Math.min(bandIds.length, 4) + '">' + blocks.map(renderBlock).join('') + '</div>';
  };
  const song = (u) => {
    u.lines.sort((a, b) => a.b - b.b || a.y - b.y || a.x - b.x);
    stats.titles++;
    return '<section class="song"><div class="song-head"><div class="song-title">' + esc(u.text) + '</div><div class="song-actions"></div></div>' + renderBody(u.lines) + '</section>';
  };
  if (sideBySide) html += '<div class="song-pair">' + used.map(song).join('') + '</div>';
  else html += used.map(song).join('');
  if (orphans.length) { orphans.sort((a, b) => a.b - b.b || a.y - b.y); html += '<section class="song plain">' + renderBody(orphans) + '</section>'; }
  out[n] = html;
  stats.pages++;
});

fs.writeFileSync(path.join(__dirname, 'out', 'pages.json'), JSON.stringify(out));
console.log(JSON.stringify(stats), 'pages ->', 'tools/out/pages.json');
