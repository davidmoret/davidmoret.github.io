// Fournisseur Google Drive : Google Identity Services (token client).
// Pas de client secret possible en navigateur → pas de refresh token : le
// jeton (~1 h) est renouvelé silencieusement (prompt:'') tant que la session
// Google est active. Backup stocké dans le dossier caché `appDataFolder`.
/* global google */
import { GOOGLE, REMOTE_FILENAME, isConfigured } from './config.js';
import { getMeta, setMeta } from '../store.js';
import { getTokens, saveTokens, clearTokens, isExpired } from './tokens.js';

const ID = 'gdrive';
const CONNECTED_KEY = 'cloud.gdrive.connected';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

let tokenClient = null;

function loadGis() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('gis-load-failed'));
    document.head.appendChild(s);
  });
}

// Demande un jeton d'accès. prompt 'consent' = connexion initiale (UI),
// prompt '' = renouvellement silencieux.
async function requestToken(prompt) {
  await loadGis();
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE.clientId,
        scope: GOOGLE.scope,
        callback: () => {}, // remplacé à chaque appel ci-dessous
      });
    }
    tokenClient.callback = (resp) => {
      if (resp.error) reject(new Error(resp.error));
      else resolve(resp);
    };
    tokenClient.error_callback = (err) => reject(new Error(err.type || 'gis-error'));
    tokenClient.requestAccessToken({ prompt });
  });
}

async function store(resp) {
  await saveTokens(ID, { accessToken: resp.access_token, expiresIn: resp.expires_in });
}

// Jeton valide, renouvelé silencieusement si expiré. Null si silencieux impossible.
async function accessToken() {
  const tokens = await getTokens(ID);
  if (tokens && !isExpired(tokens)) return tokens.accessToken;
  const resp = await requestToken('');
  await store(resp);
  return resp.access_token;
}

const AUTHZ = (token) => ({ Authorization: `Bearer ${token}` });

// Métadonnées du backup existant dans appDataFolder (ou null).
async function findFile(token) {
  const url = `https://www.googleapis.com/drive/v3/files?${new URLSearchParams({
    spaces: 'appDataFolder',
    fields: 'files(id,name,modifiedTime)',
    pageSize: '10',
  })}`;
  const res = await fetch(url, { headers: AUTHZ(token) });
  if (!res.ok) throw new Error(`gdrive-list-${res.status}`);
  const json = await res.json();
  return json.files?.find((f) => f.name === REMOTE_FILENAME) ?? null;
}

export const gdrive = {
  id: ID,
  label: 'Google Drive',
  isConfigured: () => isConfigured(GOOGLE),

  async isConnected() {
    return Boolean(await getMeta(CONNECTED_KEY));
  },

  async authorize() {
    const resp = await requestToken('consent');
    await store(resp);
    await setMeta(CONNECTED_KEY, true);
  },

  async disconnect() {
    const tokens = await getTokens(ID);
    if (tokens?.accessToken && window.google?.accounts?.oauth2) {
      google.accounts.oauth2.revoke(tokens.accessToken, () => {});
    }
    await clearTokens(ID);
    await setMeta(CONNECTED_KEY, undefined);
  },

  async upload(bytes) {
    const token = await accessToken();
    const existing = await findFile(token);
    if (existing) {
      const res = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`,
        { method: 'PATCH', headers: { ...AUTHZ(token), 'Content-Type': 'application/octet-stream' }, body: bytes },
      );
      if (!res.ok) throw new Error(`gdrive-update-${res.status}`);
      return;
    }
    // Création multipart : métadonnées JSON + média binaire.
    const boundary = `ram${crypto.randomUUID()}`;
    const meta = { name: REMOTE_FILENAME, parents: ['appDataFolder'] };
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
      bytes,
      `\r\n--${boundary}--`,
    ]);
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { ...AUTHZ(token), 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    if (!res.ok) throw new Error(`gdrive-create-${res.status}`);
  },

  async download() {
    const token = await accessToken();
    const file = await findFile(token);
    if (!file) return null;
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
      headers: AUTHZ(token),
    });
    if (!res.ok) throw new Error(`gdrive-download-${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  },

  async remoteDate() {
    const token = await accessToken();
    const file = await findFile(token);
    return file?.modifiedTime ?? null;
  },
};
