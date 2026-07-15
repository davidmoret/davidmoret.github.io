// Persistance runtime (IndexedDB).
//   definitions : séances importées (parsées depuis le .md), clé = slug.
//   history     : une entrée JSON par séance jouée (résumé + timeline), clé = id.
//   profile     : profil utilisateur (âge, FCmax, FCrepos), clé = 'me'.
//   meta        : clé-valeur (dernière date de backup, etc.), clé = string.

const DB_NAME = 'ram';
const DB_VERSION = 3;

// Connexion mémorisée : une seule ouverture pour toute la session (au lieu d'une
// par opération). Le cache est invalidé si la connexion se ferme (onclose) ou si
// une autre origine demande une montée de version (onversionchange).
let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('definitions')) db.createObjectStore('definitions', { keyPath: 'slug' });
      if (!db.objectStoreNames.contains('history')) db.createObjectStore('history', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('profile')) db.createObjectStore('profile');
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => { dbPromise = null; };
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}

function run(store, mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export const putDefinition = (def) => run('definitions', 'readwrite', (os) => os.put(def));
export const getDefinitions = () => run('definitions', 'readonly', (os) => os.getAll());
export const getDefinition = (slug) => run('definitions', 'readonly', (os) => os.get(slug));
export const deleteDefinition = (slug) => run('definitions', 'readwrite', (os) => os.delete(slug));

// Bascule le flag favori d'une séance (stocké sur la définition, clé = slug).
export const setFavorite = (slug, favorite) => run('definitions', 'readwrite', (os) => {
  const req = os.get(slug);
  req.onsuccess = () => {
    const def = req.result;
    if (def) { def.favorite = !!favorite; os.put(def); }
  };
});

export const putHistory = (entry) => run('history', 'readwrite', (os) => os.put(entry));
export const getHistory = () => run('history', 'readonly', (os) => os.getAll());
export const getHistoryEntry = (id) => run('history', 'readonly', (os) => os.get(id));
export const deleteHistory = (id) => run('history', 'readwrite', (os) => os.delete(id));

// Store clé-valeur `meta` (dernière date de backup/import, thème, etc.).
export const getMeta = (key) => run('meta', 'readonly', (os) => os.get(key));
export const setMeta = (key, value) => run('meta', 'readwrite', (os) => os.put(value, key));

// Profil utilisateur (clé hors-ligne 'me'). Renvoie null si absent.
export const getProfile = () => run('profile', 'readonly', (os) => os.get('me')).then((v) => v || null);
export const putProfile = (p) => run('profile', 'readwrite', (os) => os.put(p, 'me'));
