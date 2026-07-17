// Wake Lock : garde l'écran allumé pendant la séance (contrainte UX rameur).
// Réacquiert le lock au retour d'onglet si la séance est toujours active.
// Extrait de screen-live.js (chef d'orchestre) — cf. PROJET.md §14.

export function createWakeLock(isActive) {
  let wakeLock = null;

  async function acquire() {
    if (!('wakeLock' in navigator) || wakeLock) return;
    try { wakeLock = await navigator.wakeLock.request('screen'); }
    catch { wakeLock = null; }
  }

  function release() {
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }

  function onVisibility() {
    if (document.visibilityState === 'visible' && isActive()) acquire();
  }
  document.addEventListener('visibilitychange', onVisibility);

  function dispose() {
    document.removeEventListener('visibilitychange', onVisibility);
    release();
  }

  return { acquire, release, dispose };
}
