// Fournisseur Dropbox : OAuth2 PKCE (popup) + refresh token → reconnexion
// silencieuse durable. Backup déposé dans le dossier d'app (accès « App folder »).
import { DROPBOX, REDIRECT_URI, REMOTE_FILENAME, isConfigured } from './config.js';
import { makeVerifier, makeChallenge, makeState } from './pkce.js';
import { openOauthPopup } from './oauth-popup.js';
import { getTokens, saveTokens, clearTokens, isExpired } from './tokens.js';

const ID = 'dropbox';
const PATH = `/${REMOTE_FILENAME}`;

async function exchange(body) {
  const res = await fetch(DROPBOX.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: DROPBOX.clientId, ...body }),
  });
  if (!res.ok) throw new Error(`dropbox-token-${res.status}`);
  const json = await res.json();
  await saveTokens(ID, {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in,
  });
}

// Jeton d'accès valide (rafraîchi si expiré). Null si non connecté / échec.
async function accessToken() {
  const tokens = await getTokens(ID);
  if (!tokens) return null;
  if (!isExpired(tokens)) return tokens.accessToken;
  if (!tokens.refreshToken) return null;
  await exchange({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken });
  return (await getTokens(ID)).accessToken;
}

// Endpoint « content » (upload/download) : arg en en-tête, binaire en body.
function contentApi(url, { arg, body, token }) {
  return fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Dropbox-API-Arg': JSON.stringify(arg),
      ...(body ? { 'Content-Type': 'application/octet-stream' } : {}),
    },
    body,
  });
}

// Endpoint « RPC » (metadata) : arg en JSON dans le body.
function rpcApi(url, { arg, token }) {
  return fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(arg),
  });
}

export const dropbox = {
  id: ID,
  label: 'Dropbox',
  isConfigured: () => isConfigured(DROPBOX),

  async isConnected() {
    return Boolean(await getTokens(ID));
  },

  async authorize() {
    const verifier = makeVerifier();
    const state = makeState();
    const challenge = await makeChallenge(verifier);
    const authUrl = `${DROPBOX.authUrl}?${new URLSearchParams({
      client_id: DROPBOX.clientId,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      token_access_type: 'offline',
      state,
    })}`;
    const code = await openOauthPopup(authUrl, state);
    await exchange({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT_URI,
    });
  },

  async disconnect() {
    await clearTokens(ID);
  },

  async upload(bytes) {
    const token = await accessToken();
    const res = await contentApi('https://content.dropboxapi.com/2/files/upload', {
      token,
      arg: { path: PATH, mode: 'overwrite', mute: true },
      body: bytes,
    });
    if (!res.ok) throw new Error(`dropbox-upload-${res.status}`);
  },

  async download() {
    const token = await accessToken();
    const res = await contentApi('https://content.dropboxapi.com/2/files/download', {
      token,
      arg: { path: PATH },
    });
    if (res.status === 409) return null; // fichier absent
    if (!res.ok) throw new Error(`dropbox-download-${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  },

  async remoteDate() {
    const token = await accessToken();
    const res = await rpcApi('https://api.dropboxapi.com/2/files/get_metadata', {
      token,
      arg: { path: PATH },
    });
    if (res.status === 409) return null;
    if (!res.ok) throw new Error(`dropbox-meta-${res.status}`);
    const json = await res.json();
    return json.server_modified ?? null;
  },
};
