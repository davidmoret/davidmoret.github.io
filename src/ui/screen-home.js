// Écran Accueil : stats globales + listing des séances. Import .md + .json.
import { getDefinitions, getHistory, putDefinition, putHistory, deleteHistory } from '../data/store.js';
import { aggregate } from '../stats/aggregate.js';
import { parseSession } from '../data/session-parser.js';
import { fmtDuration, fmtDist, escapeHtml } from './format.js';
import { go } from './router.js';

export async function screenHome(_params, outlet) {
  const [defs, history] = await Promise.all([getDefinitions(), getHistory()]);
  const stats = aggregate(history);
  defs.sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  const recent = [...history].sort((a, b) => b.id.localeCompare(a.id)).slice(0, 5);

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
        <h2 class="section-head__title">Séances</h2>
        <div class="section-head__actions">
          <label class="btn btn--ghost import-btn">
            Importer
            <input id="import" class="import-btn__input" type="file" accept=".md,.txt,.markdown,.json,text/markdown,text/plain,application/json,*/*">
          </label>
        </div>
      </div>

      <ul class="card-list">
        ${defs.length
          ? defs.map(cardHtml).join('')
          : '<li class="empty">Aucune séance. Importe un <code>.md</code> ou dépose un fichier dans <code>sessions/</code>.</li>'}
      </ul>

      ${recent.length ? `
        <div class="section-head"><h2 class="section-head__title">Dernières séances</h2></div>
        <ul class="history">
          ${recent.map(historyHtml).join('')}
        </ul>` : ''}

      <footer class="app-version">${__APP_VERSION__}</footer>
    </main>`;

  outlet.querySelector('[data-profile]').addEventListener('click', () => go('/profile'));
  outlet.querySelectorAll('[data-slug]').forEach((el) => {
    el.addEventListener('click', () => go(`/session/${el.dataset.slug}`));
  });
  outlet.querySelectorAll('[data-history]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-history-delete]')) return;
      go(`/summary/${encodeURIComponent(el.dataset.history)}`);
    });
  });
  outlet.querySelectorAll('[data-history-delete]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm("Supprimer cette séance de l\u2019historique ?")) return;
      await deleteHistory(btn.dataset.historyDelete);
      screenHome(_params, outlet);
    });
  });

  const input = outlet.querySelector('#import');
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result;
        // .json = backup historique, .md = définition de séance
        if (file.name.endsWith('.json')) {
          const entry = JSON.parse(text);
          if (!entry.id || !entry.session_title) throw new Error('Format invalide');
          putHistory(entry).then(() => screenHome(_params, outlet));
        } else {
          const session = parseSession(text);
          putDefinition(session).then(() => go(`/session/${session.slug}`));
        }
      } catch (e) {
        console.error('Import échoué :', e);
        alert(`Import échoué : ${e.message}`);
      }
    };
    reader.readAsText(file);
  });
}

function statItem(value, key) {
  return `<div class="stats__item">
    <span class="stats__val">${escapeHtml(value)}</span>
    <span class="stats__key">${key}</span>
  </div>`;
}

function historyHtml(h) {
  const date = new Date(h.id).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  const meta = [fmtDist(h.distance_m), fmtDuration(h.duration_s), h.hr.avg ? `${h.hr.avg} bpm` : null]
    .filter(Boolean).join(' · ');
  return `<li class="history__item" data-history="${escapeHtml(h.id)}" role="button" tabindex="0">
    <div class="history__body">
      <span class="history__title">${escapeHtml(h.session_title)}</span>
      <span class="history__meta">${escapeHtml(date)} — ${escapeHtml(meta)}</span>
    </div>
    <button class="history__del" data-history-delete="${escapeHtml(h.id)}" aria-label="Supprimer">✕</button>
  </li>`;
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
