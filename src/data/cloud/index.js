// Registre des fournisseurs de synchronisation cloud.
import { dropbox } from './dropbox.js';
import { gdrive } from './gdrive.js';

export const PROVIDERS = [dropbox, gdrive];

export const getProvider = (id) => PROVIDERS.find((p) => p.id === id);

// Fournisseurs configurés ET connectés (pour la sync au démarrage).
export async function connectedProviders() {
  const out = [];
  for (const p of PROVIDERS) {
    if (p.isConfigured() && (await p.isConnected())) out.push(p);
  }
  return out;
}
