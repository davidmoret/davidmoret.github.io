// Menu de navigation en overlay (drawer). Ouvert depuis le bouton ☰ de l'accueil.
// N'est pas une route : se superpose à l'écran courant et se ferme sans navigation.
import { go } from './router.js';
import { User, Layers, Database, Settings, ChevronRight, X } from 'lucide';
import { iconHtml } from './icon.js';

const ENTRIES = [
  { path: '/profile', label: 'Profil', icon: User },
  { path: '/sessions', label: 'Sessions', icon: Layers },
  { path: '/data', label: 'Gestion des données', icon: Database },
  { path: '/prefs', label: 'Préférences', icon: Settings },
];

export function openMenu() {
  const overlay = document.createElement('div');
  overlay.className = 'menu-overlay';
  overlay.innerHTML = `
    <nav class="menu-sheet" role="menu" aria-label="Menu">
      <button class="menu-sheet__close" aria-label="Fermer">${iconHtml(X)}</button>
      <ul class="menu-list">
        ${ENTRIES.map((e) => `
          <li>
            <button class="menu-item" data-go="${e.path}" role="menuitem">
              <span class="menu-item__icon">${iconHtml(e.icon)}</span>
              <span class="menu-item__label">${e.label}</span>
              <span class="menu-item__go" aria-hidden="true">${iconHtml(ChevronRight)}</span>
            </button>
          </li>`).join('')}
      </ul>
      <footer class="app-version">${__APP_VERSION__}</footer>
    </nav>`;
  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[aria-label="Fermer"]')) close();
  });
  overlay.querySelectorAll('[data-go]').forEach((btn) => {
    btn.addEventListener('click', () => { close(); go(btn.dataset.go); });
  });
  document.addEventListener('keydown', onKey);
}
