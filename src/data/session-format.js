// Source unique de vérité pour la (dé)sérialisation des champs de séance.
// Chaque champ = une paire parse (Markdown → valeur) / format (valeur → Markdown).
// `session-parser.js` importe les `parse*`, `export.js` les `format*` : plus de
// double vérité pour durée / distance / cible FC / zone (cf. PROJET.md §14).

// ── Durée ─────────────────────────────────────────────────────────────
// "m:ss" / "mm:ss" → secondes ; "Nmin" / "Ns" tolérés.
export function parseDuration(v) {
  if (!v) return null;
  const clock = String(v).match(/^(\d+):(\d{1,2})$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const unit = String(v).match(/^(\d+)\s*(min|s)?$/i);
  if (unit) return unit[2] && unit[2].toLowerCase() === 'min' ? Number(unit[1]) * 60 : Number(unit[1]);
  return null;
}

// secondes → "m:ss" (jamais arrondi à la minute).
export function formatDuration(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// ── Distance ──────────────────────────────────────────────────────────
// "500m" / "1.5km" → mètres.
export function parseDistance(v) {
  if (!v) return null;
  const km = String(v).match(/^([\d.]+)\s*km$/i);
  if (km) return Math.round(parseFloat(km[1]) * 1000);
  const m = String(v).match(/^([\d.]+)\s*m$/i);
  if (m) return Math.round(parseFloat(m[1]));
  return null;
}

// mètres → "Nkm" si multiple de 1000, sinon "Nm".
export function formatDistance(m) {
  if (m >= 1000 && m % 1000 === 0) return `${m / 1000}km`;
  return `${m}m`;
}

// ── Cible FC ──────────────────────────────────────────────────────────
// "max-40"        → { mode: 'dynamic', delta: 40 }
// "100"           → { mode: 'fixed', value: 100 }
// "55%"           → { mode: 'pct', pct: 55 }
// "karvonen-50%"  → { mode: 'karvonen', pct: 50 }
export function parseHrTarget(v) {
  if (!v) return null;
  const karvonen = String(v).match(/^karvonen-(\d+)%$/i);
  if (karvonen) return { mode: 'karvonen', pct: Number(karvonen[1]) };
  const pct = String(v).match(/^(\d+)%$/);
  if (pct) return { mode: 'pct', pct: Number(pct[1]) };
  const dyn = String(v).match(/^max-(\d+)$/i);
  if (dyn) return { mode: 'dynamic', delta: Number(dyn[1]) };
  const num = Number(v);
  if (!isNaN(num) && num > 0) return { mode: 'fixed', value: num };
  return null;
}

export function formatHrTarget(t) {
  if (t.mode === 'dynamic') return `max-${t.delta}`;
  if (t.mode === 'fixed') return String(t.value);
  if (t.mode === 'pct') return `${t.pct}%`;
  if (t.mode === 'karvonen') return `karvonen-${t.pct}%`;
  return '100';
}

// ── Zone FC ───────────────────────────────────────────────────────────
// "[130, 160]" (ou toute paire de nombres) → [lo, hi].
export function parseZone(v) {
  if (!v) return null;
  const nums = String(v).match(/\d+/g);
  return nums && nums.length >= 2 ? [Number(nums[0]), Number(nums[1])] : null;
}

export function formatZone(z) {
  return `[${z[0]}, ${z[1]}]`;
}
