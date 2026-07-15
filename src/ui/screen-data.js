// Écran Gestion des données : sauvegarde (export chiffré) et restauration (import) du backup global.
import { exportBackup, importBackup, askPassphrase, getLastBackupDate, getLastImportDate } from '../data/backup.js';
import { notify, setFlash } from './notify.js';
import { go, back } from './router.js';
import { FileDown, ArchiveRestore } from 'lucide';
import { appBar } from './app-bar.js';
import { iconHtml } from './icon.js';
import { t, getLang } from './i18n/index.js';

function fmtBackupDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString(getLang(), { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export async function screenData(_params, outlet) {
  const [lastBackup, lastImport] = await Promise.all([getLastBackupDate(), getLastImportDate()]);

  outlet.innerHTML = `
    ${appBar({ title: t('data.title') })}
    <main class="screen">
      <div class="section-head">
        <h2 class="section-head__title">${t('data.backup')}</h2>
      </div>
      <p class="lead">${lastBackup ? t('data.lastBackup', { date: fmtBackupDate(lastBackup) }) + ' ' + t('data.encrypted') : t('data.noBackup') + ' ' + t('data.encrypted')}</p>
      <div class="backup-actions">
        <button class="btn btn--block" data-export-backup>${iconHtml(FileDown)} ${t('data.export')}</button>
        <label class="btn btn--block import-btn">
          ${iconHtml(ArchiveRestore)} ${t('data.restore')}
          <input class="import-btn__input" type="file" accept=".rambak" data-import-backup>
        </label>
      </div>
      ${lastImport ? `<p class="lead">${t('data.lastImport', { date: fmtBackupDate(lastImport) })}</p>` : ''}
    </main>`;

  outlet.querySelector('[data-back]').addEventListener('click', () => back());

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
}
