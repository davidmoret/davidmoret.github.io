// Rendu + câblage d'une liste d'entrées d'historique, partagé entre l'accueil,
// l'écran historique complet et le détail d'une séance.
import { fmtDuration, fmtDist, escapeHtml } from './format.js';
import { deleteHistory } from '../data/store.js';
import { confirmDialog } from './modal.js';
import { go } from './router.js';
import { t, getLang } from './i18n/index.js';

// Filtre l'historique d'une séance (par slug, avec repli titre pour les
// anciennes entrées sans session_slug).
export function historyForSession(history, { slug, title }) {
  return history.filter((h) => (h.session_slug ? h.session_slug === slug : h.session_title === title));
}

export function historyItemHtml(h) {
  const date = new Date(h.id).toLocaleDateString(getLang(), { day: '2-digit', month: 'short' });
  const meta = [fmtDist(h.distance_m), fmtDuration(h.duration_s), h.hr && h.hr.avg ? `${h.hr.avg} bpm` : null]
    .filter(Boolean).join(' · ');
  return `<li class="history__item" data-history="${escapeHtml(h.id)}" role="button" tabindex="0">
    <div class="history__body">
      <span class="history__title">${escapeHtml(h.session_title)}</span>
      <span class="history__meta">${escapeHtml(date)} — ${escapeHtml(meta)}</span>
    </div>
    <button class="history__del" data-history-delete="${escapeHtml(h.id)}" aria-label="${t('common.delete')}">✕</button>
  </li>`;
}

export function historyListHtml(entries) {
  return `<ul class="history">${entries.map(historyItemHtml).join('')}</ul>`;
}

// Variante avec en-têtes de mois. `entries` doit être triée du plus récent au
// plus ancien. En-tête "JANVIER" pour l'année courante, "JANVIER 2024" sinon.
export function historyListGroupedHtml(entries) {
  const lang = getLang();
  const currentYear = new Date().getFullYear();

  // Regroupe les entrées par mois pour produire groupes + bandeaux séparés
  const groups = [];
  let lastKey = null;
  for (const h of entries) {
    const d = new Date(h.id);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (key !== lastKey) {
      lastKey = key;
      const month = d.toLocaleDateString(lang, { month: 'long' });
      const label = d.getFullYear() === currentYear
        ? month.toUpperCase()
        : `${month.toUpperCase()} ${d.getFullYear()}`;
      groups.push({ label, items: [] });
    }
    groups[groups.length - 1].items.push(h);
  }

  const groupsHtml = groups.map(({ label, items }) => `
    <div class="history__month-band">${escapeHtml(label)}</div>
    <ul class="history">${items.map(historyItemHtml).join('')}</ul>
  `).join('');

  return `<div class="history-grouped">${groupsHtml}</div>`;
}

// Câble ouverture (clic sur l'item) + suppression (clic sur ✕) pour tous les
// items présents dans `outlet`. `onChange` est rappelé après une suppression.
export function bindHistoryList(outlet, onChange) {
  outlet.querySelectorAll('[data-history]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-history-delete]')) return;
      go(`/summary/${encodeURIComponent(el.dataset.history)}`);
    });
  });
  outlet.querySelectorAll('[data-history-delete]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!await confirmDialog(t('history.deleteConfirm'), { confirmLabel: t('common.delete'), danger: true })) return;
      await deleteHistory(btn.dataset.historyDelete);
      if (onChange) onChange();
    });
  });
}
