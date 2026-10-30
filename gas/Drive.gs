/**
 * Export des paroles dans Google Drive (aucun lien externe : tout vit dans Drive) :
 *  - un fichier Markdown par chant (« 071 - Et le premier c'est un marin.md ») dans « <dossier> / chants » ;
 *  - la feuille « Carnet de chants – référence des chants » dans <dossier>, avec pour chaque chant la page,
 *    le titre, le type (chant / texte), le lien vers le carnet, le lien vers son fichier .md et la vidéo.
 * Dossier : propriété du script DRIVE_FOLDER_ID. À lancer à la main depuis l'éditeur : exporterChantsDansDrive().
 * Relançable : les fichiers et la feuille sont mis à jour, pas dupliqués.
 */
var FEUILLE_REFERENCE_ = 'Carnet de chants – référence des chants';

function exporterChantsDansDrive() {
  var root = DriveApp.getFolderById(cfg_('DRIVE_FOLDER_ID'));
  var it = root.getFoldersByName('chants');
  var dir = it.hasNext() ? it.next() : root.createFolder('chants');
  var existing = {}, files = dir.getFiles();
  while (files.hasNext()) { var f = files.next(); existing[f.getName()] = f; }

  var created = 0, updated = 0, rows = [];
  var appUrl = ScriptApp.getService().getUrl();
  CHANTS_MD.forEach(function (e) {
    var file = existing[e[0]];
    if (file) { file.setContent(e[1]); updated++; }
    else { file = dir.createFile(e[0], e[1], 'text/markdown'); created++; }
    var page = parseInt(e[0].slice(0, 3), 10);
    var title = (e[1].match(/^# (.*)$/m) || [])[1] || e[0];
    var isText = /Type : texte/.test(e[1]);
    var vid = (e[1].match(/watch\?v=([\w-]{11})/) || [])[1] || '';
    rows.push([page, title, isText ? 'Texte' : 'Chant',
      '=HYPERLINK("' + appUrl + '?p=' + page + '","Ouvrir")',
      '=HYPERLINK("' + file.getUrl() + '","Voir le .md")',
      vid ? '=HYPERLINK("https://youtu.be/' + vid + '","Écouter")' : '', vid]);
  });

  // Feuille de référence (créée une fois, puis mise à jour)
  var sheets = root.getFilesByName(FEUILLE_REFERENCE_), ss;
  while (sheets.hasNext()) { var cand = sheets.next(); if (cand.getMimeType() === MimeType.GOOGLE_SHEETS) { ss = SpreadsheetApp.openById(cand.getId()); break; } }
  if (!ss) {
    ss = SpreadsheetApp.create(FEUILLE_REFERENCE_);
    var made = DriveApp.getFileById(ss.getId());
    root.addFile(made);
    DriveApp.getRootFolder().removeFile(made);
  }
  var sh = ss.getSheets()[0];
  if (sh.getFilter()) sh.getFilter().remove();
  sh.clear();
  var head = [['Page', 'Titre', 'Type', 'Carnet en ligne', 'Fichier .md', 'Vidéo YouTube', 'Id YouTube']];
  sh.getRange(1, 1, 1, 7).setValues(head).setFontWeight('bold').setBackground('#183059').setFontColor('#ffffff');
  sh.getRange(2, 1, rows.length, 7).setValues(rows);   // les chaînes commençant par « = » deviennent des formules (HYPERLINK)
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, 7);
  sh.getRange(1, 1, rows.length + 1, 7).createFilter();

  var msg = created + ' fichiers créés, ' + updated + ' mis à jour dans « ' + root.getName() + ' / chants » ; feuille « ' + FEUILLE_REFERENCE_ + ' » mise à jour.';
  Logger.log(msg);
  return msg;
}
