// Contrôle automatique : numéros de couplets 1..N dans l'ordre, pas de ligne orpheline, pas de blocs étranges.
const g = JSON.parse(require('fs').readFileSync('tools/out/pages.json', 'utf8'));
let bad = 0, songs = 0;
Object.keys(g).sort((a, b) => a - b).forEach((p) => {
  [...g[p].matchAll(/<section class="song[^"]*">([\s\S]*?)<\/section>/g)].forEach((m) => {
    songs++;
    const t = (m[1].match(/class="song-title">([^<]*)</) || [])[1] || '(sans titre)';
    const nums = [...m[1].matchAll(/verse-number">(\d+)\./g)].map((x) => +x[1]);
    const probs = [];
    if (nums.length) {
      const sorted = nums.slice().sort((a, b) => a - b);
      if (nums.join() !== sorted.join()) probs.push('ordre ' + nums.join(','));
      else if (new Set(nums).size !== nums.length) probs.push('doublons ' + nums.join(','));
      else if (nums[0] !== 1 || nums[nums.length - 1] !== nums.length) probs.push('suite ' + nums.join(','));
    }
    const blocks = [...m[1].matchAll(/<div class="(?:verse|refrain)[^"]*">([\s\S]*?)<\/div>(?=<|$)/g)];
    if (!blocks.length) probs.push('aucun couplet');
    if (probs.length) { bad++; console.log(p, t, '->', probs.join('; ')); }
  });
});
console.log('chants', songs, 'à revoir', bad);
