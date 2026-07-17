import './styles/main.scss';
import { initTheme } from './ui/theme.js';
import { initLang } from './ui/i18n/index.js';
import { createRouter, go } from './ui/router.js';
import { openMenu } from './ui/menu.js';
import { screenHome } from './ui/screen-home.js';
import { screenSessions } from './ui/screen-sessions.js';
import { screenHistory } from './ui/screen-history.js';
import { screenDetail } from './ui/screen-detail.js';
import { screenLive } from './ui/screen-live.js';
import { screenSummary } from './ui/screen-summary.js';
import { screenProfile } from './ui/screen-profile.js';
import { screenPrefs } from './ui/screen-prefs.js';
import { screenData } from './ui/screen-data.js';
import { screenEditor } from './ui/screen-editor.js';
import { getDefinitions, putDefinition } from './data/store.js';
import { parseSession, slugify } from './data/session-parser.js';
import { handleOauthPopup } from './data/cloud/oauth-popup.js';
import { syncOnStartup } from './data/cloud/sync.js';

// Si cette fenêtre est la popup de retour OAuth, renvoyer le code au parent et
// se fermer sans booter l'app.
const isOauthPopup = handleOauthPopup();

// Séances d'exemple livrées avec l'app : semées dans IndexedDB au 1er lancement
// (on ne réécrit pas si des définitions existent déjà → n'écrase pas les imports).
async function seedSessions() {
  if ((await getDefinitions()).length) return;
  const files = import.meta.glob('/sessions/*.txt', { query: '?raw', import: 'default', eager: true });
  for (const [path, raw] of Object.entries(files)) {
    const slug = slugify(path.split('/').pop().replace(/\.txt$/, ''));
    await putDefinition(parseSession(raw, slug));
  }
}

const outlet = document.getElementById('app');

// Menu accessible depuis le header de tous les écrans (bouton ☰), sauf Live.
// Bouton accueil des écrans de détail → retour à la racine.
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-menu]')) openMenu();
  else if (e.target.closest('[data-home]')) go('/');
});

const router = createRouter([
  ['/', screenHome],
  ['/sessions', screenSessions],
  ['/history', screenHistory],
  ['/history/:slug', screenHistory],
  ['/session/:slug', screenDetail],
  ['/live/:slug', screenLive],
  ['/summary/:id', screenSummary],
  ['/profile', screenProfile],
  ['/prefs', screenPrefs],
  ['/data', screenData],
  ['/edit', screenEditor],
  ['/edit/:slug', screenEditor],
], outlet);

if (!isOauthPopup) {
  initTheme().catch((e) => console.error('Init thème échoué :', e));
  // Langue et séances d'exemple en parallèle, mais tous deux résolus AVANT le
  // premier rendu (Home lit getDefinitions() → le seed doit être terminé).
  Promise.all([
    initLang().catch((e) => console.error('Init langue échoué :', e)),
    seedSessions().catch((e) => console.error('Seed séances échoué :', e)),
  ]).finally(() => {
    if (!location.hash) location.hash = '/';
    router.start();
    // Sync cloud en arrière-plan : re-rend l'écran courant si un download a
    // remplacé les données locales.
    syncOnStartup()
      .then((downloaded) => { if (downloaded) window.dispatchEvent(new PopStateEvent('popstate')); })
      .catch((e) => console.error('Sync démarrage échouée :', e));
  });

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
  }
}
