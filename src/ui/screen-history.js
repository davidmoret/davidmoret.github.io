// Écran Historique complet : séances effectuées, ou celles d'une seule
// séance (route /history/:slug).
import { getHistory, getDefinition } from '../data/store.js';
import { aggregate } from '../stats/aggregate.js';
import { escapeHtml } from './format.js';
import { historyListGroupedHtml, bindHistoryList, historyForSession } from './history-list.js';
import { statsTilesHtml } from './stats-tiles.js';
import { appBar } from './app-bar.js';
import { t } from './i18n/index.js';

export async function screenHistory({ slug }, outlet) {
  const [history, def] = await Promise.all([getHistory(), slug ? getDefinition(slug) : null]);
  const sorted = [...history].sort((a, b) => b.id.localeCompare(a.id));
  const entries = slug ? historyForSession(sorted, { slug, title: def && def.title }) : sorted;
  const heading = slug
    ? (def ? escapeHtml(def.title) : escapeHtml(t('history.title')))
    : escapeHtml(t('history.count', { count: entries.length }));

  outlet.innerHTML = `
    ${appBar({ title: heading })}
    <main class="screen">
      ${entries.length ? statsTilesHtml(aggregate(entries)) : ''}
      ${entries.length
        ? historyListGroupedHtml(entries)
        : `<p class="empty">${t('history.empty')}</p>`}
    </main>`;

  // Bouton accueil géré globalement (data-home -> go('/')).
  bindHistoryList(outlet, () => screenHistory({ slug }, outlet));
}
