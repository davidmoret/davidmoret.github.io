// Écran Toutes les séances : liste l'intégralité des séances, import .md,
// toggle favori (★) sur chaque séance, et bouton nouvelle séance.
import { getDefinitions, putDefinition, setFavorite } from '../data/store.js';
import { parseSession } from '../data/session-parser.js';
import { escapeHtml } from './format.js';
import { go } from './router.js';

export async function screenSessions(_params, outlet) {
  const defs = (await getDefinitions()).sort((a, b) => a.title.localeCompare(b.title, 'fr'));

  outlet.innerHTML = `
    <header class="app-bar app-bar--detail">
      <button class="app-bar__back" data-back aria-label="Retour">‹</button>
      <h1 class="app-bar__title">Toutes les séances</h1>
    </header>
    <main class="screen">
      <div class="section-head">
        <h2 class="section-head__title">${defs.length} séance${defs.length > 1 ? 's' : ''}</h2>
        <div class="section-head__actions">
          <button class="btn btn--ghost" data-new>+ Nouvelle</button>
          <label class="btn btn--ghost import-btn">
            Importer
            <input id="import" class="import-btn__input" type="file" accept=".md,.txt,.markdown,text/markdown,text/plain">
          </label>
        </div>
      </div>

      <ul class="card-list">
        ${defs.length
          ? defs.map(cardHtml).join('')
          : '<li class="empty">Aucune séance. Crée-en avec <strong>+ Nouvelle</strong> ou importe un <code>.md</code>.</li>'}
      </ul>
    </main>`;

  outlet.querySelector('[data-back]').addEventListener('click', () => go('/'));
  outlet.querySelector('[data-new]').addEventListener('click', () => go('/edit'));
  outlet.querySelectorAll('[data-slug]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-fav]')) return;
      go(`/session/${el.dataset.slug}`);
    });
  });
  outlet.querySelectorAll('[data-fav]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const on = btn.getAttribute('aria-pressed') === 'true';
      await setFavorite(btn.dataset.fav, !on);
      screenSessions(_params, outlet);
    });
  });

  const input = outlet.querySelector('#import');
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const session = parseSession(reader.result);
        putDefinition(session).then(() => go(`/session/${session.slug}`));
      } catch (e) {
        console.error('Import échoué :', e);
        alert(`Import échoué : ${e.message}`);
      }
    };
    reader.readAsText(file);
  });
}

function cardHtml(s) {
  const meta = [s.type, `${s.sections.length} sections`].filter(Boolean).join(' · ');
  const fav = !!s.favorite;
  return `<li class="card" data-slug="${escapeHtml(s.slug)}" role="button" tabindex="0">
    <button class="card__fav${fav ? ' is-active' : ''}" data-fav="${escapeHtml(s.slug)}"
      aria-pressed="${fav}" aria-label="${fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${fav ? '★' : '☆'}</button>
    <div class="card__body">
      <h3 class="card__title">${escapeHtml(s.title)}</h3>
      <p class="card__meta">${escapeHtml(meta)}</p>
      ${s.description ? `<p class="card__desc">${escapeHtml(s.description)}</p>` : ''}
    </div>
    <span class="card__go" aria-hidden="true">▶</span>
  </li>`;
}
