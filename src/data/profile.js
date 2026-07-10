// Profil utilisateur minimal (âge, FCmax, FCrepos) stocké dans IndexedDB.
// Optionnel : s'il n'existe pas, les cibles dynamiques max-N restent disponibles.

const DB_NAME = 'ram';
const STORE = 'profile';

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

function run(mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const os = tx.objectStore(STORE);
    const req = fn(os);
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
  }));
}

export const getProfile = () => run('readonly', (os) => os.get('me')).then((v) => v || null);
export const putProfile = (p) => run('readwrite', (os) => os.put(p, 'me'));

// FCmax estimée : valeur saisie ou 220 − âge.
export function hrMax(profile) {
  if (!profile) return null;
  if (profile.hrMax) return profile.hrMax;
  if (profile.age) return 220 - profile.age;
  return null;
}

// Karvonen : FC de réserve = FCmax − FCrepos.
// Retourne { reserve, hrMax } ou null.
export function karvonenBase(profile) {
  const max = hrMax(profile);
  if (!max || !profile.hrRest) return null;
  return { reserve: max - profile.hrRest, hrMax: max };
}
