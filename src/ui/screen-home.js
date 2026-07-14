// Écran Accueil : stats globales + séances favorites + dernières séances.
import { getDefinitions, getHistory } from '../data/store.js';
import { aggregate } from '../stats/aggregate.js';
import { fmtDuration, fmtDist, escapeHtml } from './format.js';
import { notify, flushFlash } from './notify.js';
import { historyListHtml, bindHistoryList } from './history-list.js';
import { go } from './router.js';
import { Menu, ChevronRight } from 'lucide';
import { iconHtml } from './icon.js';
import { getLastBackupDate, shouldRemindBackup, daysSinceBackup, exportBackup, askPassphrase } from '../data/backup.js';

export async function screenHome(_params, outlet) {
  const [defs, history, lastBackup] = await Promise.all([
    getDefinitions(), getHistory(), getLastBackupDate(),
  ]);
  const stats = aggregate(history);
  const favorites = defs.filter((d) => d.favorite).sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  const sorted = [...history].sort((a, b) => b.id.localeCompare(a.id));
  const recent = sorted.slice(0, 5);
  const remindBackup = shouldRemindBackup(lastBackup);
  const days = lastBackup ? Math.floor(daysSinceBackup(lastBackup)) : null;

  outlet.innerHTML = `
    <header class="app-bar">
      <h1 class="app-bar__title">rame rame</h1>
      <button class="app-bar__action" data-menu aria-label="Menu">${iconHtml(Menu)}</button>
    </header>
    <main class="screen">
      <section class="stats" aria-label="Statistiques globales">
        ${statItem(stats.count, 'séances')}
        ${statItem(fmtDist(stats.distance), 'distance')}
        ${statItem(fmtDuration(stats.duration), 'temps')}
        ${statItem(stats.hrAvg ?? '—', 'fc moy')}
      </section>

      ${remindBackup ? '<div class="inline-notify" data-backup-notify></div>' : ''}

      <div class="section-head">
        <h2 class="section-head__title">Séances favorites</h2>
      </div>

      <ul class="card-list">
        ${favorites.length
          ? favorites.map(cardHtml).join('')
          : '<li class="empty">Aucune séance favorite. Ajoutes-en via <strong>Menu → Sessions</strong>.</li>'}
      </ul>

      ${recent.length ? `
        <div class="section-head"><h2 class="section-head__title">Dernières séances</h2></div>
        ${historyListHtml(recent)}
        ${sorted.length > 5 ? '<button class="btn btn--ghost btn--block" data-all-history>Voir toutes les séances passées</button>' : ''}
      ` : ''}
    </main>`;

  const allBtn = outlet.querySelector('[data-all-history]');
  if (allBtn) allBtn.addEventListener('click', () => go('/history'));
  outlet.querySelectorAll('[data-slug]').forEach((el) => {
    el.addEventListener('click', () => go(`/session/${el.dataset.slug}`));
  });
  bindHistoryList(outlet, () => screenHome(_params, outlet));

  // Notif de confirmation après navigation (ex. restauration d'un backup).
  flushFlash();

  // Rappel de sauvegarde : notif warning persistante dans le flux.
  const notifyHost = outlet.querySelector('[data-backup-notify]');
  if (notifyHost) {
    const label = days === null
      ? 'Aucune sauvegarde'
      : `Dernière sauvegarde il y a ${days} j`;
    notify('warning', label, 'Pense à sauvegarder tes données.', {
      persistent: true,
      container: notifyHost,
      action: {
        label: 'Sauvegarder maintenant',
        onClick: async () => {
          const pass = await askPassphrase();
          if (!pass) return;
          try {
            await exportBackup(pass);
            screenHome(_params, outlet);
            notify('success', 'Sauvegarde exportée');
          } catch (e) {
            console.error('Backup échoué :', e);
            notify('error', 'Backup échoué', 'Réessaie.');
          }
        },
      },
    });
  }
}

function statItem(value, key) {
  return `<div class="stats__item">
    <span class="stats__val">${escapeHtml(value)}</span>
    <span class="stats__key">${key}</span>
  </div>`;
}

function cardHtml(s) {
  const meta = [s.type, `${s.sections.length} sections`].filter(Boolean).join(' · ');
  return `<li class="card" data-slug="${escapeHtml(s.slug)}" role="button" tabindex="0">
    <div class="card__body">
      <h3 class="card__title">${escapeHtml(s.title)}</h3>
      <p class="card__meta">${escapeHtml(meta)}</p>
      ${s.description ? `<p class="card__desc">${escapeHtml(s.description)}</p>` : ''}
    </div>
    <span class="card__go" aria-hidden="true">${iconHtml(ChevronRight)}</span>
  </li>`;
}
