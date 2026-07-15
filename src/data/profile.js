// Profil utilisateur minimal (âge, FCmax, FCrepos). Persistance déléguée à
// store.js (connexion IndexedDB unique) ; ici, uniquement la logique métier.
// Optionnel : s'il n'existe pas, les cibles dynamiques max-N restent disponibles.

export { getProfile, putProfile } from './store.js';

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
