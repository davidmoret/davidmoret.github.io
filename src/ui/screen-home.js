// Écran Accueil : stats globales + séances favorites + dernières séances.
import { getDefinitions, getHistory } from '../data/store.js';
import { aggregate } from '../stats/aggregate.js';
import { escapeHtml } from './format.js';
import { notify, flushFlash } from './notify.js';
import { historyListHtml, bindHistoryList } from './history-list.js';
import { go } from './router.js';
import { Star, History, ChevronRight } from 'lucide';
import { appBar } from './app-bar.js';
import { statsTilesHtml } from './stats-tiles.js';
import { iconHtml } from './icon.js';
import { getLastBackupDate, shouldRemindBackup, daysSinceBackup, exportBackup, askPassphrase } from '../data/backup.js';
import { t } from './i18n/index.js';

// L'utilisateur a fermé le rappel de sauvegarde : on ne le réaffiche pas
// tant que le backup reste stale. Reset au prochain reload de l'app.
let backupDismissed = false;

export async function screenHome(_params, outlet) {
  const [defs, history, lastBackup] = await Promise.all([
    getDefinitions(), getHistory(), getLastBackupDate(),
  ]);
  const stats = aggregate(history);
  const favorites = defs.filter((d) => d.favorite).sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  const sorted = [...history].sort((a, b) => b.id.localeCompare(a.id));
  const recent = sorted.slice(0, 5);
  const remindBackup = shouldRemindBackup(lastBackup) && !backupDismissed;
  const days = lastBackup ? Math.floor(daysSinceBackup(lastBackup)) : null;

  outlet.innerHTML = `
    ${appBar({ title: t('app.brand'), brand: true, home: false })}
    <main class="screen">
      ${statsTilesHtml(stats, { interactive: true })}

      ${remindBackup ? '<div class="inline-notify" data-backup-notify></div>' : ''}

      <div class="section-head">
        <h2 class="section-head__title">${iconHtml(Star)} ${t('home.favorites')}</h2>
        <button class="section-head__link" data-add-session>${t('home.add')}</button>
      </div>

      <ul class="card-list">
        ${favorites.length
          ? favorites.map(cardHtml).join('')
          : `<li class="empty">${t('home.favoritesEmpty')}</li>`}
      </ul>

      ${recent.length ? `
        <div class="section-head section-head--spaced">
          <h2 class="section-head__title">${iconHtml(History)} ${t('home.recent')}</h2>
          ${sorted.length > 5 ? `<button class="section-head__link" data-all-history>${t('home.seePast')}</button>` : ''}
        </div>
        ${historyListHtml(recent)}
      ` : ''}
    </main>`;

  const statsHistoryBtn = outlet.querySelector('[data-stats-history]');
  if (statsHistoryBtn) statsHistoryBtn.addEventListener('click', () => go('/history'));
  const allBtn = outlet.querySelector('[data-all-history]');
  if (allBtn) allBtn.addEventListener('click', () => go('/history'));
  const addBtn = outlet.querySelector('[data-add-session]');
  if (addBtn) addBtn.addEventListener('click', () => go('/sessions'));
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
      ? t('home.backup.none')
      : t('home.backup.daysAgo', { n: days });
    notify('warning', label, t('home.backup.remind'), {
      persistent: true,
      container: notifyHost,
      onClose: () => { backupDismissed = true; },
      action: {
        label: t('home.backup.now'),
        onClick: async () => {
          const pass = await askPassphrase();
          if (!pass) return;
          try {
            await exportBackup(pass);
            backupDismissed = false;
            screenHome(_params, outlet);
            notify('success', t('home.backup.exported'));
          } catch (e) {
            console.error('Backup échoué :', e);
            notify('error', t('backup.exportFailed'), t('backup.retry'));
          }
        },
      },
    });
  }
}

function cardHtml(s) {
  const meta = t('sessions.sections', { n: s.sections.length });
  return `<li class="card" data-slug="${escapeHtml(s.slug)}" role="button" tabindex="0">
    <div class="card__body">
      <h3 class="card__title">${escapeHtml(s.title)}</h3>
      <p class="card__meta">${escapeHtml(meta)}</p>
      ${s.description ? `<p class="card__desc">${escapeHtml(s.description)}</p>` : ''}
    </div>
    <span class="card__go" aria-hidden="true">${iconHtml(ChevronRight)}</span>
  </li>`;
}
