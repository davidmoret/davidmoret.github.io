// Helpers d'affichage partagés.

// Secondes → "h:mm:ss" ou "m:ss".
export function fmtDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

// Allure (secondes / 500 m) → "m:ss".
export function fmtPace(paceSeconds) {
  if (paceSeconds == null || paceSeconds <= 0 || paceSeconds >= 3600) return '—:—';
  const s = Math.round(paceSeconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Mètres → "1.23 km" ou "456 m".
export function fmtDist(meters) {
  if (meters == null) return '—';
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
}

// Nom d'appareil BLE sans l'identifiant en suffixe :
// "Polar Sense 1C1021AB" → "Polar Sense". On ne retire qu'un bloc hexadécimal
// (≥ 4 caractères) précédé d'un espace/tiret, pour préserver les modèles type
// "Polar H10". Si le nom n'est que l'id, on garde l'original.
export function prettyDeviceName(name) {
  if (!name) return name;
  return name.replace(/[\s_-]+[0-9A-Fa-f:]{4,}$/, '').trim() || name;
}

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Toast temporaire : affiche un message qui disparaît après ~2.5 s.
export function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

// Flash : message à afficher au prochain rendu d'un écran (après une
// navigation). Évite qu'un toast créé avant un rendu async ne s'efface
// avant d'être visible.
let pendingFlash = null;
export function setFlash(msg) { pendingFlash = msg; }
export function consumeFlash() {
  const m = pendingFlash;
  pendingFlash = null;
  return m;
}
