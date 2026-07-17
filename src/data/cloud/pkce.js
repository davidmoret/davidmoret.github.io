// Helpers PKCE (RFC 7636) pour OAuth2 en client public (pas de secret).

function base64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomBytes(len) {
  return crypto.getRandomValues(new Uint8Array(len));
}

// Verifier : chaîne aléatoire base64url de ~43 caractères.
export function makeVerifier() {
  return base64url(randomBytes(32));
}

// State anti-CSRF pour lier la requête d'autorisation à sa réponse.
export function makeState() {
  return base64url(randomBytes(16));
}

// Challenge = base64url(SHA-256(verifier)).
export async function makeChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}
