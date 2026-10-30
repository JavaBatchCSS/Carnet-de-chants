// Affiche le texte d'une page reconstruite (aperçu rapide) : node tools/show.js 8 44 71
const g = require('./out/pages.json');
process.argv.slice(2).forEach((p) => {
  console.log('=== page ' + p);
  console.log(g[p].replace(/<div class="cols[^>]*>/g, '\n[COLONNES]').replace(/<br>/g, ' / ').replace(/<span class="verse-number">/g, '').replace(/<div class="(verse|refrain)[^>]*>/g, '\n').replace(/<[^>]+>/g, ''));
});
