// Écran Profil utilisateur : âge, FCmax, FCrepos.
// Les valeurs dérivées (FCmax auto = 220 − âge, réserve = FCmax − FCrepos)
// s'affichent en continu dans le formulaire et sont persistées à l'enregistrement.
import { getProfile, putProfile } from '../data/profile.js';
import { escapeHtml } from './format.js';
import { appBar } from './app-bar.js';
import { t } from './i18n/index.js';

function maxPlaceholder(age) {
  return age ? t('profile.maxPlaceholderAuto', { n: 220 - age }) : t('profile.maxPlaceholder');
}

function effectiveMax(age, hrMax) {
  return hrMax || (age ? 220 - age : null);
}

function reserveHint(age, hrMax, hrRest) {
  const max = effectiveMax(age, hrMax);
  return (max && hrRest) ? t('profile.reserve', { n: max - hrRest }) : t('profile.reserveLocked');
}

export async function screenProfile(_params, outlet) {
  const profile = await getProfile() || {};

  outlet.innerHTML = `
    ${appBar({ title: t('profile.title') })}
    <main class="screen">
      <p class="lead">${t('profile.lead')}</p>

      <form class="profile-form" data-form>
        <label class="profile-field">
          <span class="profile-field__label">${t('profile.age')}</span>
          <input class="profile-field__input" type="number" name="age" min="10" max="99"
            value="${escapeHtml(String(profile.age ?? ''))}" placeholder="ex. 35" inputmode="numeric">
          <span class="profile-field__hint">${t('profile.ageHint')}</span>
        </label>

        <label class="profile-field">
          <span class="profile-field__label">${t('profile.hrMax')} <small>${t('profile.hrMaxHint')}</small></span>
          <input class="profile-field__input" type="number" name="hrMax" min="80" max="230"
            value="${escapeHtml(String(profile.hrMax ?? ''))}" placeholder="${maxPlaceholder(profile.age)}" inputmode="numeric">
        </label>

        <label class="profile-field">
          <span class="profile-field__label">${t('profile.hrRest')}</span>
          <input class="profile-field__input" type="number" name="hrRest" min="30" max="100"
            value="${escapeHtml(String(profile.hrRest ?? ''))}" placeholder="ex. 60" inputmode="numeric">
          <span class="profile-field__hint" data-reserve-hint>${reserveHint(profile.age, profile.hrMax, profile.hrRest)}</span>
        </label>

        <button class="btn btn--block" type="submit" data-submit disabled>${t('common.save')}</button>
      </form>
    </main>`;

  // Bouton accueil géré globalement (data-home -> go('/')).

  const form = outlet.querySelector('[data-form]');
  const ageEl = form.querySelector('[name=age]');
  const hrMaxEl = form.querySelector('[name=hrMax]');
  const hrRestEl = form.querySelector('[name=hrRest]');
  const reserveEl = form.querySelector('[data-reserve-hint]');
  const submitBtn = form.querySelector('[data-submit]');

  const initial = { age: ageEl.value, hrMax: hrMaxEl.value, hrRest: hrRestEl.value };

  function checkDirty() {
    const dirty = ageEl.value !== initial.age || hrMaxEl.value !== initial.hrMax || hrRestEl.value !== initial.hrRest;
    submitBtn.disabled = !dirty;
  }

  // Recalcul en continu des valeurs dérivées pendant la saisie.
  form.addEventListener('input', () => {
    const age = Number(ageEl.value) || null;
    const hrMax = Number(hrMaxEl.value) || null;
    const hrRest = Number(hrRestEl.value) || null;
    hrMaxEl.placeholder = maxPlaceholder(age);
    reserveEl.textContent = reserveHint(age, hrMax, hrRest);
    checkDirty();
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
