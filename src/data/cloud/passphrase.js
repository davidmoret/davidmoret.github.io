// Passphrase mémorisée pour la sync silencieuse (choix utilisateur).
// Stockée en clair dans `meta` : le cloud reste chiffré, mais quiconque
// accède à l'appareil déverrouillé peut lire/déchiffrer les backups.
import { getMeta, setMeta } from '../store.js';
import { askPassphrase } from '../backup.js';

const KEY = 'cloud.passphrase';

export const getStoredPassphrase = () => getMeta(KEY);
export const rememberPassphrase = (pass) => setMeta(KEY, pass);
export const forgetPassphrase = () => setMeta(KEY, undefined);

// Retourne la passphrase mémorisée, ou la demande une fois puis la mémorise.
// `silent` : si aucune passphrase n'est mémorisée, ne pas afficher de modal
// (utilisé par la sync au démarrage) → retourne null.
export async function ensurePassphrase({ silent = false, label } = {}) {
  const stored = await getStoredPassphrase();
  if (stored) return stored;
  if (silent) return null;
  const pass = await askPassphrase(label);
  if (pass) await rememberPassphrase(pass);
  return pass;
}
