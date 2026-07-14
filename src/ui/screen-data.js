// Écran Gestion des données : sauvegarde (export chiffré) et restauration (import) du backup global.
import { exportBackup, importBackup, askPassphrase, getLastBackupDate, getLastImportDate } from '../data/backup.js';
import { notify, setFlash } from './notify.js';
import { go } from './router.js';

function fmtBackupDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export async function screenData(_params, outlet) {
  const [lastBackup, lastImport] = await Promise.all([getLastBackupDate(), getLastImportDate()]);

  outlet.innerHTML = `
    <header class="app-bar app-bar--detail">
      <button class="app-bar__back" data-back aria-label="Retour">‹</button>
      <h1 class="app-bar__title">Gestion des données</h1>
      <button class="app-bar__action" data-menu aria-label="Menu">☰</button>
    </header>
    <main class="screen">
      <div class="section-head">
        <h2 class="section-head__title">Sauvegarde</h2>
      </div>
      <p class="lead">${lastBackup ? 'Dernière sauvegarde le ' + fmtBackupDate(lastBackup) + '.' : 'Aucune sauvegarde effectuée.'} Les données sont chiffrées avec ta passphrase.</p>
      <div class="backup-actions">
        <button class="btn btn--block" data-export-backup>📤 Exporter un backup</button>
        <label class="btn btn--block import-btn">
          📥 Restaurer un backup
          <input class="import-btn__input" type="file" accept=".rambak" data-import-backup>
        </label>
      </div>
      ${lastImport ? `<p class="lead">Dernière restauration le ${fmtBackupDate(lastImport)}.</p>` : ''}
    </main>`;

  outlet.querySelector('[data-back]').addEventListener('click', () => go('/'));

  // Export backup
  outlet.querySelector('[data-export-backup]').addEventListener('click', async () => {
    const pass = await askPassphrase();
    if (!pass) return;
    try {
      await exportBackup(pass);
      screenData(_params, outlet);
      notify('success', 'Sauvegarde exportée');
    } catch (e) {
      console.error('Export échoué :', e);
      notify('error', 'Export échoué', 'Réessaie.');
    }
  });

  // Import backup
  outlet.querySelector('[data-import-backup]').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const pass = await askPassphrase('Saisis la passphrase du backup');
    if (!pass) { e.target.value = ''; return; }
    try {
      await importBackup(file, pass);
      setFlash('success', 'Sauvegarde restaurée');
      go('/');
    } catch (e) {
      console.error('Import échoué :', e);
      notify('error', 'Restauration échouée', 'Vérifie la passphrase et le fichier.');
      e.target.value = '';
    }
  });
}
