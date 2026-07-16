// En-tête d'écran mutualisé (bouton accueil + titre + action menu). Factorise
// le markup répété dans tous les écrans hors Live.
//
//   title : chaîne (échappée) OU { html } pour un titre déjà rendu (ex. icône).
//   brand : true → titre rendu avec la classe .brand (Ubuntu Bold, logo wordmark).
//   home  : false → pas de bouton accueil (+ style accueil, pas .app-bar--detail) ;
//           true (défaut) → bouton accueil (data-home) géré globalement dans main.js.
//   extra : HTML injecté entre le titre et le menu (ex. bouton Démarrer du détail).
//   menu  : bouton ☰ (data-menu). Vrai par défaut.
//
// Le retour natif Android (geste/bouton système → history.back) est géré par le
// routeur via popstate ; le bouton accueil est le repli explicite.
import { Home, Menu } from 'lucide';
import { iconHtml } from './icon.js';
import { escapeHtml } from './format.js';
import { t } from './i18n/index.js';

export function appBar({ title, brand = false, home = true, extra = '', menu = true } = {}) {
  const detail = home !== false;
  const titleHtml = title && typeof title === 'object' ? title.html : escapeHtml(title ?? '');
  const titleClass = brand ? 'app-bar__title brand' : 'app-bar__title';
  const homeBtn = home !== false
    ? `<button class="app-bar__home" data-home aria-label="${escapeHtml(t('common.home'))}">${iconHtml(Home)}</button>`
    : '';
  const menuBtn = menu ? `<button class="app-bar__action" data-menu aria-label="${t('common.menu')}">${iconHtml(Menu)}</button>` : '';
  return `<header class="app-bar${detail ? ' app-bar--detail' : ''}">
      ${homeBtn}
      <div class="app-bar__center${brand ? ' brand' : ''}">
        <h1 class="${titleClass}">${titleHtml}</h1>
        ${extra}
      </div>
      ${menuBtn}
    </header>`;
}
