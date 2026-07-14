// Menu de navigation en overlay (drawer). Ouvert depuis le bouton ☰ de l'accueil.
// N'est pas une route : se superpose à l'écran courant et se ferme sans navigation.
import { go } from './router.js';

export function openMenu() {
  const overlay = document.createElement('div');
  overlay.className = 'menu-overlay';
  overlay.innerHTML = `
    <nav class="menu-sheet" role="menu" aria-label="Menu">
      <button class="btn btn--block" data-go="/profile">Profil</button>
      <button class="btn btn--block" data-go="/sessions">Sessions</button>
      <button class="btn btn--block" data-go="/data">Gestion des données</button>
      <button class="btn btn--block" data-go="/prefs">Préférences</button>
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
    if (e.target === overlay) close();
  });
  overlay.querySelectorAll('[data-go]').forEach((btn) => {
    btn.addEventListener('click', () => { close(); go(btn.dataset.go); });
  });
  document.addEventListener('keydown', onKey);
}
