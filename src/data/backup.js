// Backup chiffré de tout IndexedDB (definitions + history + profile).
// Chiffrement : AES-256-GCM, clé dérivée d'une passphrase via PBKDF2.
// Export : Web Share API (Android) ou download fallback.

import { openDb } from './store.js';

const BACKUP_DAYS = 7;
const PBKDF2_ITER = 600_000;
const SALT_LEN = 16;
const IV_LEN = 12;
const META_KEY = 'lastBackupDate';

// ── Meta (lastBackupDate) ─────────────────────────────────────────────

export async function getLastBackupDate() {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction('meta', 'readonly');
    const req = tx.objectStore('meta').get(META_KEY);
    tx.oncomplete = () => resolve(req.result ?? null);
    tx.onerror = () => resolve(null);
  });
}

async function setLastBackupDate(date = new Date()) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put(date.toISOString(), META_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

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
  // format: [salt | iv | ciphertext]
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

// ── Export ────────────────────────────────────────────────────────────

export async function exportBackup(passphrase) {
  const data = await dumpAll();
  const encrypted = await encrypt(data, passphrase);
  const blob = new Blob([encrypted], { type: 'application/octet-stream' });
  const date = new Date().toISOString().slice(0, 10);
  const filename = `ram-backup-${date}.rambak`;

  // Web Share API (Android)
  if (navigator.share && navigator.canShare?.({ files: [blob] })) {
    const file = new File([blob], filename, { type: 'application/octet-stream' });
    await navigator.share({ files: [file] });
  } else {
    // Fallback : download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  await setLastBackupDate();
}

// ── Import ────────────────────────────────────────────────────────────

export async function importBackup(file, passphrase) {
  const buf = new Uint8Array(await file.arrayBuffer());
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
      for (const item of items) os.put(item);
    }
  });
  await setLastBackupDate();
}
