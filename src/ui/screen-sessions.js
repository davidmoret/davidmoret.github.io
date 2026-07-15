// Écran Toutes les séances : liste l'intégralité des séances, import .txt,
// toggle favori (★) sur chaque séance, et bouton nouvelle séance.
import { getDefinitions, putDefinition, setFavorite } from '../data/store.js';
import { parseSession } from '../data/session-parser.js';
import { escapeHtml } from './format.js';
import { notify } from './notify.js';
import { go } from './router.js';
import { Star, ChevronRight, Plus, FileDown } from 'lucide';
import { appBar } from './app-bar.js';
import { iconHtml } from './icon.js';
import { t } from './i18n/index.js';

export async function screenSessions(_params, outlet) {
  const defs = (await getDefinitions()).sort((a, b) => a.title.localeCompare(b.title, 'fr'));

  outlet.innerHTML = `
    ${appBar({ title: t('sessions.title') })}
    <main class="screen">
      <div class="detail-actions">
        <div class="editor__row">
          <button class="btn btn--block" data-new>${iconHtml(Plus)} ${t('sessions.new')}</button>
          <label class="btn btn--block import-btn">
            ${iconHtml(FileDown)} ${t('sessions.import')}
            <input id="import" class="import-btn__input" type="file" accept=".txt,text/plain">
          </label>
        </div>
      </div>

      <ul class="card-list">
        ${defs.length
          ? defs.map(cardHtml).join('')
          : `<li class="empty">${t('sessions.empty')}</li>`}
      </ul>
    </main>`;

  // Bouton accueil géré globalement (data-home -> go('/')).
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
        putDefinition(session).then(() => {
          notify('success', t('sessions.imported', { title: session.title }));
          go(`/session/${session.slug}`);
        });
      } catch (e) {
        console.error('Import échoué :', e);
        notify('error', t('sessions.importFailed'), e.message);
      }
    };
    reader.readAsText(file);
  });
}

function cardHtml(s) {
  const meta = [s.type, t('sessions.sections', { n: s.sections.length })].filter(Boolean).join(' · ');
  const fav = !!s.favorite;
  return `<li class="card" data-slug="${escapeHtml(s.slug)}" role="button" tabindex="0">
    <button class="card__fav${fav ? ' is-active' : ''}" data-fav="${escapeHtml(s.slug)}"
      aria-pressed="${fav}" aria-label="${fav ? t('sessions.fav.remove') : t('sessions.fav.add')}">${iconHtml(Star)}</button>
    <div class="card__body">
      <h3 class="card__title">${escapeHtml(s.title)}</h3>
      <p class="card__meta">${escapeHtml(meta)}</p>
      ${s.description ? `<p class="card__desc">${escapeHtml(s.description)}</p>` : ''}
    </div>
    <span class="card__go" aria-hidden="true">${iconHtml(ChevronRight)}</span>
  </li>`;
}
