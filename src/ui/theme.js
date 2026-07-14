// Préférence de thème : 'dark' | 'light' | 'auto' (défaut).
// Persistée dans IndexedDB store `meta` (clé 'theme').
// 'auto' suit prefers-color-scheme (réactif au changement système).

const DB_NAME = 'ram';
const STORE = 'meta';
const META_KEY = 'theme';
const VALID = ['dark', 'light', 'auto'];

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readMeta(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
}

async function writeMeta(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function getThemePref() {
  return readMeta(META_KEY).then((v) => (VALID.includes(v) ? v : 'auto'));
}

export function setThemePref(pref) {
  return writeMeta(META_KEY, pref);
}

// Résout 'auto' en dark/light selon le système.
function resolved(pref) {
  if (pref === 'light') return 'light';
  if (pref === 'dark') return 'dark';
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

const THEME_BAR = { dark: '#0e1116', light: '#f6f8fa' };

// Applique data-theme sur <html> + met à jour le meta theme-color (barre système).
// Retourne le thème résolu appliqué.
function apply(pref) {
  const r = resolved(pref);
  document.documentElement.dataset.theme = r;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = THEME_BAR[r];
  return r;
}

let mediaList = null;
let mediaListener = null;

// Au boot : applique la préférence + écoute le système si 'auto'.
export async function initTheme() {
  const pref = await getThemePref();
  apply(pref);
  if (pref === 'auto') watchSystem();
}

// Réapplique après changement manuel de préférence.
export async function changeTheme(pref) {
  if (mediaListener && mediaList) { mediaList.removeEventListener('change', mediaListener); mediaListener = null; }
  await setThemePref(pref);
  apply(pref);
  if (pref === 'auto') watchSystem();
}

function watchSystem() {
  mediaList = matchMedia('(prefers-color-scheme: light)');
  mediaListener = () => apply('auto');
  mediaList.addEventListener('change', mediaListener);
}
