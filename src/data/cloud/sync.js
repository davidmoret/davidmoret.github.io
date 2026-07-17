// Moteur de synchronisation : compare la date de backup locale à la date du
// fichier distant (last-write-wins). Le push est lié à la date de backup
// locale, qui n'avance que sur « Sauvegarde manuelle » ou après une sync →
// pas d'upload gratuit à chaque ouverture.
import { buildBackupBlob, restoreFromBuffer, getLastBackupDate, markBackupDate } from '../backup.js';
import { ensurePassphrase } from './passphrase.js';
import { connectedProviders } from './index.js';
import { t } from '../../ui/i18n/index.js';

const ms = (iso) => (iso ? new Date(iso).getTime() : 0);

// Synchronise un fournisseur. `silent` : ne pas demander la passphrase par
// modal (démarrage) → renvoie { status: 'skipped' } si aucune n'est mémorisée.
export async function syncProvider(provider, { silent = false } = {}) {
  const pass = await ensurePassphrase({ silent, label: t('cloud.passphrase') });
  if (!pass) return { status: 'skipped' };

  const [localIso, remoteIso] = await Promise.all([getLastBackupDate(), provider.remoteDate()]);

  // Distant plus récent → on récupère et on aligne la date locale.
  if (remoteIso && ms(remoteIso) > ms(localIso)) {
    const bytes = await provider.download();
    if (bytes) {
      await restoreFromBuffer(bytes, pass);
      await markBackupDate(remoteIso);
      return { status: 'downloaded' };
    }
  }

  // Local plus récent (ou pas de fichier distant) → on pousse.
  if (!remoteIso || ms(localIso) > ms(remoteIso)) {
    const bytes = await buildBackupBlob(pass);
    await provider.upload(bytes);
    await markBackupDate(new Date().toISOString());
    return { status: 'uploaded' };
  }

  return { status: 'up-to-date' };
}

// Sync silencieuse de tous les fournisseurs connectés, au démarrage de l'app.
// Retourne true si au moins un download a modifié les données locales (→ le
// caller re-rend l'écran courant).
export async function syncOnStartup() {
  const providers = await connectedProviders();
  let downloaded = false;
  for (const p of providers) {
    try {
      const { status } = await syncProvider(p, { silent: true });
      if (status === 'downloaded') downloaded = true;
    } catch (e) {
      console.error(`Sync ${p.id} échouée :`, e);
    }
  }
  return downloaded;
}
