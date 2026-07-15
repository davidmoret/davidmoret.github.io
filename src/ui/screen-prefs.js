// Écran Préférences : thème (dark / light / auto).
import { getThemePref, changeTheme } from './theme.js';
import { go } from './router.js';
import { appBar } from './app-bar.js';

const OPTIONS = [
  { value: 'auto', label: 'Auto', hint: 'Système' },
  { value: 'dark', label: 'Sombre', hint: 'Forcé' },
  { value: 'light', label: 'Clair', hint: 'Forcé' },
];

export async function screenPrefs(_params, outlet) {
  const current = await getThemePref();

  outlet.innerHTML = `
    ${appBar({ title: 'Préférences' })}
    <main class="screen">
      <div class="prefs">
        <h2 class="section-head__title">Thème</h2>
        <div class="prefs__options" data-options>
          ${OPTIONS.map((o) => `
            <button class="prefs__opt ${o.value === current ? 'is-active' : ''}" data-theme="${o.value}">
              <span class="prefs__opt-label">${o.label}</span>
              <span class="prefs__opt-hint">${o.hint}</span>
            </button>`).join('')}
        </div>
      </div>
    </main>`;

  outlet.querySelector('[data-back]').addEventListener('click', () => go('/'));

  outlet.querySelectorAll('[data-theme]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await changeTheme(btn.dataset.theme);
      outlet.querySelectorAll('[data-theme]').forEach((b) => b.classList.toggle('is-active', b === btn));
    });
  });
}
