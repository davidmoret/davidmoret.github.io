// Écran Menu : accès Sessions / Profil / Gestion des données + version de l'app.
import { go } from './router.js';

export async function screenMenu(_params, outlet) {
  outlet.innerHTML = `
    <header class="app-bar app-bar--detail">
      <button class="app-bar__back" data-back aria-label="Retour">‹</button>
      <h1 class="app-bar__title">Menu</h1>
    </header>
    <main class="screen">
      <nav class="menu-list">
        <button class="btn btn--block" data-go="/sessions">Sessions</button>
        <button class="btn btn--block" data-go="/profile">Profil</button>
        <button class="btn btn--block" data-go="/data">Gestion des données</button>
      </nav>
      <footer class="app-version">${__APP_VERSION__}</footer>
    </main>`;

  outlet.querySelector('[data-back]').addEventListener('click', () => go('/'));
  outlet.querySelectorAll('[data-go]').forEach((btn) => {
    btn.addEventListener('click', () => go(btn.dataset.go));
  });
}
