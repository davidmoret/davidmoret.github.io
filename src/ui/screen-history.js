// Écran Historique complet : séances passées, ou celles d'une seule
// séance (route /history/:slug).
import { getHistory, getDefinition } from '../data/store.js';
import { escapeHtml } from './format.js';
import { historyListHtml, bindHistoryList, historyForSession } from './history-list.js';
import { go } from './router.js';
import { History } from 'lucide';
import { appBar } from './app-bar.js';
import { iconHtml } from './icon.js';

export async function screenHistory({ slug }, outlet) {
  const [history, def] = await Promise.all([getHistory(), slug ? getDefinition(slug) : null]);
  const sorted = [...history].sort((a, b) => b.id.localeCompare(a.id));
  const entries = slug ? historyForSession(sorted, { slug, title: def && def.title }) : sorted;
  const heading = slug ? (def ? def.title : 'Séance') : 'Séances passées';
  const back = slug ? `/session/${slug}` : '/';

  outlet.innerHTML = `
    ${appBar({ title: { html: slug ? escapeHtml(heading) : `${iconHtml(History)} ${escapeHtml(heading)}` } })}
    <main class="screen">
      <div class="section-head"><h2 class="section-head__title">${entries.length} séance${entries.length > 1 ? 's' : ''}</h2></div>
      ${entries.length
        ? historyListHtml(entries)
        : '<p class="empty">Aucune séance enregistrée.</p>'}
    </main>`;

  outlet.querySelector('[data-back]').addEventListener('click', () => go(back));
  bindHistoryList(outlet, () => screenHistory({ slug }, outlet));
}
