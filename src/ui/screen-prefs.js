// Écran Préférences : thème (dark / light / auto) + langue (fr / en).
import { getThemePref, changeTheme } from './theme.js';
import { getLang, changeLang } from './i18n/index.js';
import { go, back } from './router.js';
import { appBar } from './app-bar.js';
import { t } from './i18n/index.js';

const THEME_OPTIONS = [
  { value: 'auto', labelKey: 'prefs.theme.auto', hintKey: 'prefs.theme.autoHint' },
  { value: 'dark', labelKey: 'prefs.theme.dark', hintKey: 'prefs.theme.darkHint' },
  { value: 'light', labelKey: 'prefs.theme.light', hintKey: 'prefs.theme.lightHint' },
];

const LANG_OPTIONS = [
  { value: 'fr', label: 'Français', hint: 'FR' },
  { value: 'en', label: 'English', hint: 'EN' },
];

export async function screenPrefs(_params, outlet) {
  const currentTheme = await getThemePref();
  const currentLang = getLang();

  outlet.innerHTML = `
    ${appBar({ title: t('prefs.title') })}
    <main class="screen">
      <div class="prefs">
        <h2 class="section-head__title">${t('prefs.theme')}</h2>
        <div class="prefs__options" data-theme-options>
          ${THEME_OPTIONS.map((o) => `
            <button class="prefs__opt ${o.value === currentTheme ? 'is-active' : ''}" data-theme="${o.value}">
              <span class="prefs__opt-label">${t(o.labelKey)}</span>
              <span class="prefs__opt-hint">${t(o.hintKey)}</span>
            </button>`).join('')}
        </div>
      </div>

      <div class="prefs">
        <h2 class="section-head__title">${t('prefs.lang')}</h2>
        <div class="prefs__options" data-lang-options>
          ${LANG_OPTIONS.map((o) => `
            <button class="prefs__opt ${o.value === currentLang ? 'is-active' : ''}" data-lang="${o.value}">
              <span class="prefs__opt-label">${o.label}</span>
              <span class="prefs__opt-hint">${o.hint}</span>
            </button>`).join('')}
        </div>
      </div>
    </main>`;

  outlet.querySelector('[data-back]').addEventListener('click', () => back());

  outlet.querySelectorAll('[data-theme]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await changeTheme(btn.dataset.theme);
      outlet.querySelectorAll('[data-theme]').forEach((b) => b.classList.toggle('is-active', b === btn));
    });
  });

  outlet.querySelectorAll('[data-lang]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await changeLang(btn.dataset.lang);
      screenPrefs(_params, outlet);
    });
  });
}
