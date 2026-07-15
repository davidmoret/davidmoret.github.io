// Préférence de langue : 'fr' | 'en' (défaut 'fr').
// Persistée dans le store `meta` (clé 'lang') — même pattern que theme.js.
// `t(key, vars)` renvoie la chaîne traduite avec interpolation {var}.
// Le pluriel est géré via le suffixe '_plural' quand vars contient `count`.

import { getMeta, setMeta } from '../../data/store.js';
import { STRINGS } from './strings.js';

const META_KEY = 'lang';
const VALID = ['fr', 'en'];
const DEFAULT = 'fr';

let current = DEFAULT;

export function getLangPref() {
  return getMeta(META_KEY).then((v) => (VALID.includes(v) ? v : DEFAULT));
}

export function setLangPref(pref) {
  return setMeta(META_KEY, pref);
}

export function getLang() {
  return current;
}

// Traduit `key` dans la langue courante. `vars` interpolate {var}.
// Si vars.count est présent et ≥ 2, tente key_plural avant key.
export function t(key, vars = {}) {
  const dict = STRINGS[current] || STRINGS[DEFAULT];
  let str;
  if (vars.count != null && vars.count !== 1) {
    str = dict[`${key}_plural`] || dict[key];
  } else {
    str = dict[key];
  }
  if (str == null) str = (STRINGS[DEFAULT][key] ?? key);
  if (vars && typeof str === 'string') {
    str = str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : `{${k}}`));
  }
  return str;
}

// Au boot : charge la préférence et fixe la langue courante.
export async function initLang() {
  current = await getLangPref();
}

// Après changement manuel : persiste et notifie les écrans pour re-render.
export async function changeLang(pref) {
  if (!VALID.includes(pref)) return;
  await setLangPref(pref);
  current = pref;
  window.dispatchEvent(new CustomEvent('langchange'));
}
