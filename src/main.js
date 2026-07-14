import './styles/main.scss';
import { createRouter } from './ui/router.js';
import { screenHome } from './ui/screen-home.js';
import { screenSessions } from './ui/screen-sessions.js';
import { screenHistory } from './ui/screen-history.js';
import { screenDetail } from './ui/screen-detail.js';
import { screenLive } from './ui/screen-live.js';
import { screenSummary } from './ui/screen-summary.js';
import { screenProfile } from './ui/screen-profile.js';
import { screenData } from './ui/screen-data.js';
import { screenEditor } from './ui/screen-editor.js';
import { getDefinitions, putDefinition } from './data/store.js';
import { parseSession, slugify } from './data/session-parser.js';

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
const router = createRouter([
  ['/', screenHome],
  ['/sessions', screenSessions],
  ['/history', screenHistory],
  ['/history/:slug', screenHistory],
  ['/session/:slug', screenDetail],
  ['/live/:slug', screenLive],
  ['/summary/:id', screenSummary],
  ['/profile', screenProfile],
  ['/data', screenData],
  ['/edit', screenEditor],
  ['/edit/:slug', screenEditor],
], outlet);

seedSessions()
  .catch((e) => console.error('Seed séances échoué :', e))
  .finally(() => {
    if (!location.hash) location.hash = '/';
    router.start();
  });

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}
