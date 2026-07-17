// Persistance des jetons OAuth par fournisseur, dans le store `meta`.
// Forme : { accessToken, refreshToken?, expiresAt } (expiresAt = ms epoch).
import { getMeta, setMeta } from '../store.js';

const key = (provider) => `cloud.tokens.${provider}`;

export const getTokens = (provider) => getMeta(key(provider));

export function saveTokens(provider, { accessToken, refreshToken, expiresIn }) {
  const expiresAt = Date.now() + (expiresIn ?? 3600) * 1000;
  // Conserve le refresh token existant si le renouvellement n'en fournit pas.
  return getTokens(provider).then((prev) =>
    setMeta(key(provider), {
      accessToken,
      refreshToken: refreshToken ?? prev?.refreshToken ?? null,
      expiresAt,
    }),
  );
}

export const clearTokens = (provider) => setMeta(key(provider), undefined);

// Marge de 60 s pour éviter d'utiliser un jeton qui expire pendant l'appel.
export const isExpired = (tokens) => !tokens || Date.now() > tokens.expiresAt - 60_000;
