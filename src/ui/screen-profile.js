// Écran Profil utilisateur : âge, FCmax, FCrepos.
// Les valeurs dérivées (FCmax auto = 220 − âge, réserve = FCmax − FCrepos)
// s'affichent en continu dans le formulaire et sont persistées à l'enregistrement.
import { getProfile, putProfile } from '../data/profile.js';
import { escapeHtml } from './format.js';
import { back } from './router.js';
import { ArrowLeft, Menu } from 'lucide';
import { iconHtml } from './icon.js';

function maxPlaceholder(age) {
  return age ? `auto (${220 - age})` : 'auto';
}

function effectiveMax(age, hrMax) {
  return hrMax || (age ? 220 - age : null);
}

function reserveHint(age, hrMax, hrRest) {
  const max = effectiveMax(age, hrMax);
  return (max && hrRest) ? `Réserve = ${max - hrRest} bpm` : 'Débloque les cibles Karvonen';
}

export async function screenProfile(_params, outlet) {
  const profile = await getProfile() || {};

  outlet.innerHTML = `
    <header class="app-bar app-bar--detail">
      <button class="app-bar__back" data-back aria-label="Retour">${iconHtml(ArrowLeft)}</button>
      <h1 class="app-bar__title">Profil</h1>
      <button class="app-bar__action" data-menu aria-label="Menu">${iconHtml(Menu)}</button>
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
            value="${escapeHtml(String(profile.hrMax ?? ''))}" placeholder="${maxPlaceholder(profile.age)}" inputmode="numeric">
        </label>

        <label class="profile-field">
          <span class="profile-field__label">FC repos</span>
          <input class="profile-field__input" type="number" name="hrRest" min="30" max="100"
            value="${escapeHtml(String(profile.hrRest ?? ''))}" placeholder="ex. 60" inputmode="numeric">
          <span class="profile-field__hint" data-reserve-hint>${reserveHint(profile.age, profile.hrMax, profile.hrRest)}</span>
        </label>

        <button class="btn btn--primary btn--block" type="submit">Enregistrer</button>
      </form>
    </main>`;

  outlet.querySelector('[data-back]').addEventListener('click', () => back());

  const form = outlet.querySelector('[data-form]');
  const ageEl = form.querySelector('[name=age]');
  const hrMaxEl = form.querySelector('[name=hrMax]');
  const hrRestEl = form.querySelector('[name=hrRest]');
  const reserveEl = form.querySelector('[data-reserve-hint]');

  // Recalcul en continu des valeurs dérivées pendant la saisie.
  form.addEventListener('input', () => {
    const age = Number(ageEl.value) || null;
    const hrMax = Number(hrMaxEl.value) || null;
    const hrRest = Number(hrRestEl.value) || null;
    hrMaxEl.placeholder = maxPlaceholder(age);
    reserveEl.textContent = reserveHint(age, hrMax, hrRest);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const p = {};
    if (ageEl.value) p.age = Number(ageEl.value);
    if (hrMaxEl.value) p.hrMax = Number(hrMaxEl.value);
    if (hrRestEl.value) p.hrRest = Number(hrRestEl.value);
    await putProfile(p);
    // Re-render : les valeurs dérivées reflètent le profil persisté.
    screenProfile(_params, outlet);
  });
}
