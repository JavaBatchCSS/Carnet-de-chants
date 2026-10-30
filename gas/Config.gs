/**
 * Configuration du carnet : TOUS les liens et réglages vivent dans les « Propriétés du script »
 * (éditeur Apps Script > Paramètres du projet > Propriétés du script). Rien n'est à modifier dans le code.
 *
 *  SITE_NAV_BASE    adresse du déploiement de la barre d'onglets (…/exec)
 *  SITE_NAV_TAB     clé de l'onglet de ce carnet dans la barre
 *  SITE_NAV_DOMAIN  domaine Google Workspace (sonde de connexion)
 *  SITE_NAV_KEY     clé partagée avec la barre (CLE_API_NAV) — secrète
 *  ADMIN_EMAILS     administrateurs supplémentaires (séparés par des virgules)
 *  YT_HOST          hôte du lecteur YouTube intégré
 *  PLAYER_SOURCE   source de lecture : youtube (officiel) ou piped (audio sans publicité) — réglé dans l'admin
 *  PIPED_INSTANCES instances Piped (séparées par des virgules), essayées dans l'ordre
 *  INVIDIOUS_INSTANCES  instances Invidious (alternative à Piped), séparées par des virgules
 *  TEXT_PAGES       pages de texte (prières) sans chant, donc sans bouton d'écoute
 *  DRIVE_FOLDER_ID  dossier Drive où exporterChantsDansDrive() écrit les fichiers .md
 *  NAV_FALLBACK     barre de secours (JSON) si la barre est injoignable
 *
 * Au premier chargement, les propriétés absentes sont créées avec les valeurs par défaut ci-dessous
 * (la clé SITE_NAV_KEY est reprise de NavConfig.gs si ce fichier existe, puis ce fichier peut être supprimé).
 */
var CONFIG_VERSION_ = '5';   // à incrémenter quand un réglage est ajouté : les propriétés manquantes sont alors créées
var CONFIG_DEFAULTS_ = {
  SITE_NAV_BASE: '',
  SITE_NAV_TAB: 'documentation',
  SITE_NAV_DOMAIN: 'fsggb.fr',
  SITE_NAV_KEY: '',
  ADMIN_EMAILS: '',
  YT_HOST: 'https://www.youtube-nocookie.com',
  PLAYER_SOURCE: 'youtube',
  PIPED_INSTANCES: 'https://pipedapi.kavin.rocks,https://pipedapi.tokhmi.xyz,https://piped-api.garudalinux.org,https://pipedapi.smarthome-zone.net,https://pipedapi.in.projectsegfau.lt',
  INVIDIOUS_INSTANCES: 'https://yt.chocolatemoo53.com',
  TEXT_PAGES: '1,2,3,4,6',
  DRIVE_FOLDER_ID: '1y3poCIsbJG3JMaJh3vVgJpQHHlRIGqqD',
  NAV_FALLBACK: JSON.stringify([
    { cle: 'accueil', libelle: 'Accueil', url: 'https://sites.google.com/fsggb.fr/principal/', groupe: 'gauche', icone: 'maison' },
    { cle: 'archives', libelle: 'Archives', url: 'https://sites.google.com/fsggb.fr/archives', groupe: 'gauche', icone: 'archive' },
    { cle: 'documentation', libelle: 'Documentation', url: 'https://sites.google.com/fsggb.fr/documentation', groupe: 'gauche', icone: 'doc' },
    { cle: 'ecole', libelle: 'Site de l’école', url: 'https://www.saintjosephdescarmes.com/', groupe: 'droite', icone: 'externe' },
    { cle: 'federation', libelle: 'Site de la Fédération', url: 'https://www.fsggb.fr/', groupe: 'droite', icone: 'externe' }
  ])
};

/** Valeur d'un réglage : propriété du script, sinon valeur par défaut. */
function cfg_(name) {
  var v = null;
  try { v = PropertiesService.getScriptProperties().getProperty(name); } catch (e) { /* propriétés indisponibles */ }
  return (v !== null && v !== '') ? v : (CONFIG_DEFAULTS_[name] || '');
}

/** Crée les propriétés manquantes (une seule fois). À lancer à la main depuis l'éditeur si besoin : initConfig(). */
function initConfig() {
  var sp = PropertiesService.getScriptProperties();
  var have = sp.getProperties(), add = {};
  var legacy = {};
  try { legacy.SITE_NAV_BASE = SITE_NAV_BASE; legacy.SITE_NAV_TAB = SITE_NAV_TAB; legacy.SITE_NAV_KEY = SITE_NAV_KEY; } catch (e) { /* NavConfig.gs absent */ }
  Object.keys(CONFIG_DEFAULTS_).forEach(function (k) {
    if (have[k] === undefined) { var v = legacy[k] || CONFIG_DEFAULTS_[k]; if (v !== '' || k === 'ADMIN_EMAILS') add[k] = v; }
  });
  if (Object.keys(add).length) sp.setProperties(add, false);
  return Object.keys(sp.getProperties()).filter(function (k) { return k.indexOf('aud_') !== 0; });
}

function ensureConfig_() {
  try {
    var sp = PropertiesService.getScriptProperties();
    if (sp.getProperty('CONFIG_VERSION') !== CONFIG_VERSION_) { initConfig(); sp.setProperty('CONFIG_VERSION', CONFIG_VERSION_); }
  } catch (e) { /* non bloquant */ }
}

/** Réglages utiles au navigateur (jamais de secret). */
function clientConfig_() {
  var tabs = [];
  try { tabs = JSON.parse(cfg_('NAV_FALLBACK')); } catch (e) { /* barre de secours vide */ }
  return { textPages: cfg_('TEXT_PAGES').split(/[\s,;]+/).filter(Boolean).map(Number), ytHost: cfg_('YT_HOST'), playerSource: playerSource_(), navTab: cfg_('SITE_NAV_TAB'), navFallback: tabs };
}
