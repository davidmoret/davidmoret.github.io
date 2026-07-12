// Écran Accueil : stats globales + séances favorites + dernières séances.
import { getDefinitions, getHistory } from '../data/store.js';
import { aggregate } from '../stats/aggregate.js';
import { fmtDuration, fmtDist, escapeHtml } from './format.js';
import { historyListHtml, bindHistoryList } from './history-list.js';
import { go } from './router.js';

export async function screenHome(_params, outlet) {
  const [defs, history] = await Promise.all([getDefinitions(), getHistory()]);
  const stats = aggregate(history);
  const favorites = defs.filter((d) => d.favorite).sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  const sorted = [...history].sort((a, b) => b.id.localeCompare(a.id));
  const recent = sorted.slice(0, 5);

  outlet.innerHTML = `
    <header class="app-bar">
      <h1 class="app-bar__title">rame rame</h1>
      <button class="app-bar__action" data-profile aria-label="Profil">⚙</button>
    </header>
    <main class="screen">
      <section class="stats" aria-label="Statistiques globales">
        ${statItem(stats.count, 'séances')}
        ${statItem(fmtDist(stats.distance), 'distance')}
        ${statItem(fmtDuration(stats.duration), 'temps')}
        ${statItem(stats.hrAvg ?? '—', 'fc moy')}
      </section>

      <div class="section-head">
        <h2 class="section-head__title">Séances favorites</h2>
        <div class="section-head__actions">
          <button class="btn btn--ghost" data-add>+ Ajouter</button>
        </div>
      </div>

      <ul class="card-list">
        ${favorites.length
          ? favorites.map(cardHtml).join('')
          : '<li class="empty">Aucune séance favorite. Ajoute-en via <strong>+ Ajouter</strong>.</li>'}
      </ul>

      ${recent.length ? `
        <div class="section-head"><h2 class="section-head__title">Dernières séances</h2></div>
        ${historyListHtml(recent)}
        ${sorted.length > 5 ? '<button class="btn btn--ghost btn--block" data-all-history>Voir toutes les séances passées</button>' : ''}
      ` : ''}

      <footer class="app-version">${__APP_VERSION__}</footer>
    </main>`;

  outlet.querySelector('[data-profile]').addEventListener('click', () => go('/profile'));
  outlet.querySelector('[data-add]').addEventListener('click', () => go('/sessions'));
  const allBtn = outlet.querySelector('[data-all-history]');
  if (allBtn) allBtn.addEventListener('click', () => go('/history'));
  outlet.querySelectorAll('[data-slug]').forEach((el) => {
    el.addEventListener('click', () => go(`/session/${el.dataset.slug}`));
  });
  bindHistoryList(outlet, () => screenHome(_params, outlet));
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
    <span class="card__go" aria-hidden="true">▶</span>
  </li>`;
}
