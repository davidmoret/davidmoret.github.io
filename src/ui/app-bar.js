// En-tête d'écran mutualisé (bouton retour + titre + action menu). Factorise le
// markup répété dans tous les écrans hors Live.
//
//   title : chaîne (échappée) OU { html } pour un titre déjà rendu (ex. icône).
//   back  : false → pas de bouton retour (+ style accueil, pas .app-bar--detail) ;
//           true → bouton retour standard (data-back) ;
//           { attr, label } → data-<attr> + aria-label personnalisés (ex. summary).
//   extra : HTML injecté entre le titre et le menu (ex. bouton Démarrer du détail).
//   menu  : bouton ☰ (data-menu). Vrai par défaut.
import { ArrowLeft, Menu } from 'lucide';
import { iconHtml } from './icon.js';
import { escapeHtml } from './format.js';

export function appBar({ title, back = true, extra = '', menu = true } = {}) {
  const detail = back !== false;
  const titleHtml = title && typeof title === 'object' ? title.html : escapeHtml(title ?? '');
  let backBtn = '';
  if (back !== false) {
    const { attr = 'back', label = 'Retour' } = back === true ? {} : back;
    backBtn = `<button class="app-bar__back" data-${attr} aria-label="${escapeHtml(label)}">${iconHtml(ArrowLeft)}</button>`;
  }
  const menuBtn = menu ? `<button class="app-bar__action" data-menu aria-label="Menu">${iconHtml(Menu)}</button>` : '';
  return `<header class="app-bar${detail ? ' app-bar--detail' : ''}">
      ${backBtn}
      <h1 class="app-bar__title">${titleHtml}</h1>
      ${extra}
      ${menuBtn}
    </header>`;
}
