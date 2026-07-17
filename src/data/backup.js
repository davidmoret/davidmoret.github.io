// Backup chiffré de tout IndexedDB (definitions + history + profile).
// Chiffrement : AES-256-GCM, clé dérivée d'une passphrase via PBKDF2.
// Export : showSaveFilePicker (desktop) → Web Share API (Android) → download fallback.

import { openDb, getMeta, setMeta } from './store.js';
import { t } from '../ui/i18n/index.js';

const BACKUP_DAYS = 7;
const PBKDF2_ITER = 600_000;
const SALT_LEN = 16;
const IV_LEN = 12;
const META_KEY = 'lastBackupDate';
const META_IMPORT_KEY = 'lastImportDate';

// ── Meta (lastBackupDate) ─────────────────────────────────────────────

export async function getLastBackupDate() {
  return (await getMeta(META_KEY)) ?? null;
}

const setLastBackupDate = (date = new Date()) => setMeta(META_KEY, date.toISOString());

// Aligne la date de backup locale sur une valeur connue (ex. après un download
// cloud : la donnée locale correspond désormais au fichier distant).
export const markBackupDate = (iso) => setMeta(META_KEY, iso);

export async function getLastImportDate() {
  return (await getMeta(META_IMPORT_KEY)) ?? null;
}

const setLastImportDate = (date = new Date()) => setMeta(META_IMPORT_KEY, date.toISOString());

export function daysSinceBackup(lastDate) {
  if (!lastDate) return Infinity;
  return (Date.now() - new Date(lastDate).getTime()) / 86_400_000;
}

export function shouldRemindBackup(lastDate) {
  return daysSinceBackup(lastDate) >= BACKUP_DAYS;
}

// ── Dump / restore brut ───────────────────────────────────────────────

async function dumpAll() {
  const db = await openDb();
  const stores = ['definitions', 'history', 'profile'];
  const data = {};
  await new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readonly');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    for (const name of stores) {
      const req = tx.objectStore(name).getAll();
      req.onsuccess = () => { data[name] = req.result; };
    }
  });
  return data;
}

// ── Chiffrement / déchiffrement ───────────────────────────────────────

async function deriveKey(passphrase, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encrypt(data, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key = await deriveKey(passphrase, salt);
  const plain = new TextEncoder().encode(JSON.stringify(data));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  const buf = new Uint8Array(salt.length + iv.length + cipher.byteLength);
  buf.set(salt, 0);
  buf.set(iv, salt.length);
  buf.set(new Uint8Array(cipher), salt.length + iv.length);
  return buf;
}

async function decrypt(buf, passphrase) {
  const salt = buf.slice(0, SALT_LEN);
  const iv = buf.slice(SALT_LEN, SALT_LEN + IV_LEN);
  const cipher = buf.slice(SALT_LEN + IV_LEN);
  const key = await deriveKey(passphrase, salt);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return JSON.parse(new TextDecoder().decode(plain));
}

// ── Blob chiffré réutilisable (fichier local + sync cloud) ────────────

// Sérialise tout IndexedDB en un blob chiffré prêt à écrire (fichier ou cloud).
export async function buildBackupBlob(passphrase) {
  const data = await dumpAll();
  return encrypt(data, passphrase);
}

// Restaure IndexedDB depuis un buffer chiffré (import fichier ou download cloud).
export async function restoreFromBuffer(buf, passphrase) {
  const data = await decrypt(buf, passphrase);
  const db = await openDb();
  const stores = ['definitions', 'history', 'profile'];
  await new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    for (const name of stores) {
      const os = tx.objectStore(name);
      const items = data[name];
      if (!Array.isArray(items)) continue;
      // Le store `profile` a une clé hors-ligne ('me') : put() exige la clé explicite.
      const outOfLine = !os.keyPath;
      for (const item of items) {
        if (outOfLine) os.put(item, 'me');
        else os.put(item);
      }
    }
  });
  await setLastImportDate();
}

// ── Export ────────────────────────────────────────────────────────────

export async function exportBackup(passphrase) {
  const encrypted = await buildBackupBlob(passphrase);
  const blob = new Blob([encrypted], { type: 'application/octet-stream' });
  const date = new Date().toISOString().slice(0, 10);
  const filename = `ram-backup-${date}.rambak`;

  // 1. File System Access API (desktop : l'utilisateur choisit l'emplacement)
  if (window.showSaveFilePicker) {
    try {
      const handle = await showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'Backup RAM', accept: { 'application/octet-stream': ['.rambak'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      await setLastBackupDate();
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // utilisateur a annulé
    }
  }

  // 2. Web Share API (Android : share sheet vers Proton Drive, etc.)
  const shareFile = new File([blob], filename, { type: 'application/octet-stream' });
  if (navigator.share && navigator.canShare?.({ files: [shareFile] })) {
    try {
      await navigator.share({ files: [shareFile] });
      await setLastBackupDate();
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }

  // 3. Fallback : download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  await setLastBackupDate();
}

// ── Import ────────────────────────────────────────────────────────────

export async function importBackup(file, passphrase) {
  const buf = new Uint8Array(await file.arrayBuffer());
  await restoreFromBuffer(buf, passphrase);
}

// ── Modal passphrase ──────────────────────────────────────────────────
// Remplace prompt() pour préserver la chaîne d'activation utilisateur
// (nécessaire pour showSaveFilePicker et navigator.share).

export function askPassphrase(label) {
  const question = label || t('data.passphrase.encrypt');
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <p class="modal__label">${question}</p>
        <input class="modal__input" type="password" autocomplete="off" placeholder="${t('data.passphrase.placeholder')}">
        <div class="modal__actions">
          <button class="btn" data-cancel>${t('common.cancel')}</button>
          <button class="btn btn--primary" data-ok>${t('common.ok')}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('.modal__input');
    input.focus();

    function close(value) {
      overlay.remove();
      resolve(value);
    }

    overlay.querySelector('[data-cancel]').addEventListener('click', () => close(null));
    overlay.querySelector('[data-ok]').addEventListener('click', () => {
      const v = input.value.trim();
      close(v || null);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const v = input.value.trim();
        close(v || null);
      }
      if (e.key === 'Escape') close(null);
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });
  });
}
