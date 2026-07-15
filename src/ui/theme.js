// Préférence de thème : 'dark' | 'light' | 'auto' (défaut).
// Persistée dans le store `meta` (clé 'theme') via store.js (connexion unique).
// 'auto' suit prefers-color-scheme (réactif au changement système).

import { getMeta, setMeta } from '../data/store.js';

const META_KEY = 'theme';
const VALID = ['dark', 'light', 'auto'];

export function getThemePref() {
  return getMeta(META_KEY).then((v) => (VALID.includes(v) ? v : 'auto'));
}

export function setThemePref(pref) {
  return setMeta(META_KEY, pref);
}

// Résout 'auto' en dark/light selon le système.
function resolved(pref) {
  if (pref === 'light') return 'light';
  if (pref === 'dark') return 'dark';
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

const THEME_BAR = { dark: '#0e1116', light: '#f6f8fa' };

// Applique data-theme sur <html> + met à jour le meta theme-color (barre système).
// Retourne le thème résolu appliqué.
function apply(pref) {
  const r = resolved(pref);
  document.documentElement.dataset.theme = r;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = THEME_BAR[r];
  return r;
}

let mediaList = null;
let mediaListener = null;

// Au boot : applique la préférence + écoute le système si 'auto'.
export async function initTheme() {
  const pref = await getThemePref();
  apply(pref);
  if (pref === 'auto') watchSystem();
}

// Réapplique après changement manuel de préférence.
export async function changeTheme(pref) {
  if (mediaListener && mediaList) { mediaList.removeEventListener('change', mediaListener); mediaListener = null; }
  await setThemePref(pref);
  apply(pref);
  if (pref === 'auto') watchSystem();
}

function watchSystem() {
  mediaList = matchMedia('(prefers-color-scheme: light)');
  mediaListener = () => apply('auto');
  mediaList.addEventListener('change', mediaListener);
}
