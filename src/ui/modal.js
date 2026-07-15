// Modales maison (overlay `.modal`), en remplacement des confirm()/prompt()
// natifs qui cassent le rendu PWA. Cohérent avec askPassphrase() de backup.js.
import { escapeHtml } from './format.js';
import { t } from './i18n/index.js';

// Confirmation → Promise<boolean>. `danger` colore le bouton de validation en
// rouge (actions destructives : suppression).
export function confirmDialog(message, opts = {}) {
  const { confirmLabel, cancelLabel, danger = false } = opts;
  const cLabel = confirmLabel || t('common.confirm');
  const cxLabel = cancelLabel || t('common.cancel');
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <p class="modal__label">${escapeHtml(message)}</p>
        <div class="modal__actions">
          <button class="btn" data-cancel>${escapeHtml(cxLabel)}</button>
          <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-ok>${escapeHtml(cLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-ok]').focus();

    function onKey(e) {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    }

    function close(value) {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(value);
    }

    overlay.querySelector('[data-cancel]').addEventListener('click', () => close(false));
    overlay.querySelector('[data-ok]').addEventListener('click', () => close(true));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    document.addEventListener('keydown', onKey);
  });
}
