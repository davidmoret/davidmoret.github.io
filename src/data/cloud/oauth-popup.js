// Ouvre l'écran d'autorisation OAuth dans une popup et récupère le `code`
// sans quitter l'app (préserve l'état, adapté PWA). La popup revient sur
// REDIRECT_URI (index.html) ; main.js détecte `window.opener` et poste le
// code au parent via postMessage avant de se fermer (voir handleOauthPopup).

export function openOauthPopup(authUrl, expectedState) {
  return new Promise((resolve, reject) => {
    const w = 480;
    const h = 720;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    const popup = window.open(authUrl, 'ram-oauth', `width=${w},height=${h},left=${left},top=${top}`);
    if (!popup) {
      reject(new Error('popup-blocked'));
      return;
    }

    function cleanup() {
      window.removeEventListener('message', onMessage);
      clearInterval(timer);
    }

    function onMessage(e) {
      if (e.origin !== location.origin || e.data?.type !== 'oauth-callback') return;
      cleanup();
      try { popup.close(); } catch { /* déjà fermée */ }
      const { code, state, error } = e.data;
      if (error) reject(new Error(error));
      else if (state !== expectedState) reject(new Error('state-mismatch'));
      else resolve(code);
    }

    window.addEventListener('message', onMessage);

    // Détecte la fermeture manuelle de la popup (utilisateur annule).
    const timer = setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error('popup-closed'));
      }
    }, 500);
  });
}

// Appelé au tout début de main.js : si on est la popup OAuth, renvoie le code
// au parent et ferme. Retourne true dans ce cas (l'app ne doit pas booter).
export function handleOauthPopup() {
  if (!window.opener || window.opener === window) return false;
  const params = new URLSearchParams(location.search);
  if (!params.has('code') && !params.has('error')) return false;
  window.opener.postMessage(
    {
      type: 'oauth-callback',
      code: params.get('code'),
      state: params.get('state'),
      error: params.get('error'),
    },
    location.origin,
  );
  window.close();
  return true;
}
