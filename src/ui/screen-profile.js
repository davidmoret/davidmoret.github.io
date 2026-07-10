// Écran Profil utilisateur : âge, FCmax, FCrepos.
// Optionnel mais débloque les cibles FC en % et Karvonen.
import { getProfile, putProfile } from '../data/profile.js';
import { escapeHtml } from './format.js';
import { go } from './router.js';

export async function screenProfile(_params, outlet) {
  const profile = await getProfile() || {};

  outlet.innerHTML = `
    <header class="app-bar app-bar--detail">
      <button class="app-bar__back" data-back aria-label="Retour">‹</button>
      <h1 class="app-bar__title">Profil</h1>
    </header>
    <main class="screen">
      <p class="lead">Optionnel. Débloque les cibles FC en % et Karvonen dans les séances.</p>

      <form class="profile-form" data-form>
        <label class="profile-field">
          <span class="profile-field__label">Âge</span>
          <input class="profile-field__input" type="number" name="age" min="10" max="99"
            value="${escapeHtml(String(profile.age ?? ''))}" placeholder="ex. 35" inputmode="numeric">
          <span class="profile-field__hint">FCmax = 220 − âge</span>
        </label>

        <label class="profile-field">
          <span class="profile-field__label">FC max <small>(si connue, prioritaire sur 220 − âge)</small></span>
          <input class="profile-field__input" type="number" name="hrMax" min="80" max="230"
            value="${escapeHtml(String(profile.hrMax ?? ''))}" placeholder="auto" inputmode="numeric">
        </label>

        <label class="profile-field">
          <span class="profile-field__label">FC repos</span>
          <input class="profile-field__input" type="number" name="hrRest" min="30" max="100"
            value="${escapeHtml(String(profile.hrRest ?? ''))}" placeholder="ex. 60" inputmode="numeric">
          <span class="profile-field__hint">Débloque les cibles Karvonen</span>
        </label>

        <button class="btn btn--primary btn--block" type="submit">Enregistrer</button>
      </form>

      <div class="profile-result" data-result hidden></div>
    </main>`;

  outlet.querySelector('[data-back]').addEventListener('click', () => go('/'));

  outlet.querySelector('[data-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const p = {};
    const age = fd.get('age');
    const hrMaxVal = fd.get('hrMax');
    const hrRestVal = fd.get('hrRest');
    if (age) p.age = Number(age);
    if (hrMaxVal) p.hrMax = Number(hrMaxVal);
    if (hrRestVal) p.hrRest = Number(hrRestVal);
    await putProfile(p);

    const result = outlet.querySelector('[data-result]');
    result.hidden = false;
    const max = p.hrMax || (p.age ? 220 - p.age : null);
    const parts = [];
    if (max) parts.push(`FCmax = ${max} bpm`);
    if (p.hrRest && max) parts.push(`Réserve = ${max - p.hrRest} bpm`);
    result.innerHTML = parts.length
      ? `<span class="profile-ok">✓ ${parts.join(' · ')}</span>`
      : '<span class="profile-ok">✓ Profil vidé</span>';
  });
}
