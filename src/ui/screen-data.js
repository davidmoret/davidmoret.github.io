// Écran Gestion des données : sauvegarde (export chiffré), restauration (import)
// et synchronisation cloud (Dropbox / Google Drive) du backup global.
import { exportBackup, importBackup, askPassphrase, getLastBackupDate } from '../data/backup.js';
import { PROVIDERS, getProvider } from '../data/cloud/index.js';
import { syncProvider } from '../data/cloud/sync.js';
import { notify, setFlash } from './notify.js';
import { go } from './router.js';
import { Upload, Download, Cloud, RefreshCw } from 'lucide';
import { appBar } from './app-bar.js';
import { iconHtml } from './icon.js';
import { brandIconHtml, hasBrandIcon } from './brand-icons.js';
import { t, getLang } from './i18n/index.js';

function fmtBackupDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString(getLang(), { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function cloudStates() {
  return Promise.all(PROVIDERS.map(async (p) => ({
    id: p.id,
    label: p.label,
    configured: p.isConfigured(),
    connected: p.isConfigured() ? await p.isConnected() : false,
  })));
}

function providerRow(s) {
  if (!s.configured) {
    return `<button class="btn btn--block" disabled>${s.label} — ${t('cloud.notConfigured')}</button>`;
  }
  const action = s.connected ? t('cloud.disconnect') : t('cloud.connect');
  const icon = hasBrandIcon(s.id) ? brandIconHtml(s.id) : iconHtml(Cloud);
  return `<button class="btn btn--block" data-cloud-toggle="${s.id}">${icon} ${s.label} — ${action}</button>`;
}

export async function screenData(_params, outlet) {
  const [lastBackup, states] = await Promise.all([
    getLastBackupDate(),
    cloudStates(),
  ]);
  const anyConnected = states.some((s) => s.connected);

  outlet.innerHTML = `
    ${appBar({ title: t('data.title') })}
    <main class="screen">
      <div class="history__month-band">${t('data.backup')}</div>
      <p class="lead">${lastBackup ? t('data.lastBackup', { date: fmtBackupDate(lastBackup) }) + ' ' + t('data.encrypted') : t('data.noBackup') + ' ' + t('data.encrypted')}</p>
      <div class="backup-actions">
        <button class="btn btn--block" data-export-backup>${iconHtml(Upload)} ${t('data.export')}</button>
        <label class="btn btn--block import-btn">
          ${iconHtml(Download)} ${t('data.restore')}
          <input class="import-btn__input" type="file" accept=".rambak" data-import-backup>
        </label>
      </div>

      <div class="history__month-band history__month-band--cloud">${t('cloud.title')}</div>
      <p class="lead">${t('cloud.intro')}</p>
      <div class="backup-actions">
        ${states.map(providerRow).join('')}
        ${anyConnected ? `<button class="btn btn--block btn--primary" data-cloud-sync>${iconHtml(RefreshCw)} ${t('cloud.syncNow')}</button>` : ''}
      </div>
    </main>`;

  // Bouton accueil géré globalement (data-home -> go('/')).

  // Export backup
  outlet.querySelector('[data-export-backup]').addEventListener('click', async () => {
    const pass = await askPassphrase();
    if (!pass) return;
    try {
      await exportBackup(pass);
      screenData(_params, outlet);
      notify('success', t('data.exported'));
    } catch (e) {
      console.error('Export échoué :', e);
      notify('error', t('data.exportFailed'), t('data.exportFailedHint'));
    }
  });

  // Import backup
  outlet.querySelector('[data-import-backup]').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const pass = await askPassphrase(t('data.passphrase.decrypt'));
    if (!pass) { e.target.value = ''; return; }
    try {
      await importBackup(file, pass);
      setFlash('success', t('data.restored'));
      go('/');
    } catch (e) {
      console.error('Import échoué :', e);
      notify('error', t('data.restoreFailed'), t('data.restoreFailedHint'));
      e.target.value = '';
    }
  });

  // Connexion / déconnexion d'un fournisseur cloud
  outlet.querySelectorAll('[data-cloud-toggle]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const provider = getProvider(btn.dataset.cloudToggle);
      const connected = await provider.isConnected();
      try {
        if (connected) {
          await provider.disconnect();
          notify('success', t('cloud.disconnected', { provider: provider.label }));
        } else {
          await provider.authorize();
        }
        screenData(_params, outlet);
      } catch (e) {
        console.error('Cloud toggle échoué :', e);
        notify('error', t('cloud.connectFailed'));
      }
    });
  });

  // Synchronisation manuelle (tous les fournisseurs connectés)
  outlet.querySelector('[data-cloud-sync]')?.addEventListener('click', async () => {
    for (const s of states.filter((x) => x.connected)) {
      const provider = getProvider(s.id);
      try {
        const { status } = await syncProvider(provider, { silent: false });
        if (status !== 'skipped') notify('success', t(`cloud.${status === 'up-to-date' ? 'upToDate' : status}`, { provider: provider.label }));
      } catch (e) {
        console.error('Sync manuelle échouée :', e);
        notify('error', t('cloud.syncFailed'), provider.label);
      }
    }
    screenData(_params, outlet);
  });
}
