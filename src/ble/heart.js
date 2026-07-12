// Source cardio — capteur FC BLE standard (Polar Verity Sense). Service Heart
// Rate 0x180D, caractéristique Heart Rate Measurement 0x2A37. Pousse { hr }
// dans le bus normalisé. Validé par le spike Lot 0.
import { bleLog } from './debug.js';

const HR_SERVICE = 0x180d;
const HR_MEASUREMENT = 0x2a37;
const MAX_RETRIES = 5;
// Clé de mémorisation de l'appareil (id opaque, propre à l'origine).
const STORE_KEY = 'ble.heart.deviceId';

export function createHeartSource(bus) {
  let device = null;
  let characteristic = null;
  let manualDisconnect = false;
  let scanAbort = null;
  const statusListeners = new Set();
  const setStatus = (state, detail) => { for (const fn of statusListeners) fn(state, detail); };

  async function connect() {
    manualDisconnect = false;
    stopScan(); // l'appairage manuel prend la main sur l'écoute auto
    device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [HR_SERVICE] }],
      optionalServices: [0x180f, 0x180a],
    });
    device.addEventListener('gattserverdisconnected', onDisconnected);
    await openGatt();
  }

  async function openGatt() {
    setStatus('connecting');
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(HR_SERVICE);
    characteristic = await service.getCharacteristic(HR_MEASUREMENT);
    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', onValue);
    try { localStorage.setItem(STORE_KEY, device.id); } catch { /* stockage indispo */ }
    setStatus('connected', device.name || 'capteur FC');
  }

  // Reconnexion auto sans sélecteur : l'appareil déjà autorisé est retrouvé via
  // getDevices(), puis on attend qu'il émette pour ouvrir le GATT. Renvoie true
  // si connecté. Silencieux (pas d'erreur) si rien de mémorisé ou hors de portée.
  async function autoConnect() {
    bleLog('FC autoConnect: start');
    if (device && device.gatt && device.gatt.connected) { bleLog('FC déjà connecté'); return true; }
    if (!navigator.bluetooth || !navigator.bluetooth.getDevices) { bleLog('FC getDevices non supporté'); return false; }
    const savedId = (() => { try { return localStorage.getItem(STORE_KEY); } catch { return null; } })();
    bleLog('FC savedId', savedId);
    if (!savedId) return false;

    let devices;
    try { devices = await navigator.bluetooth.getDevices(); }
    catch (e) { bleLog('FC getDevices erreur', e); return false; }
    bleLog('FC getDevices →', devices.length, devices.map((d) => `${d.name || '?'}:${d.id}`));
    const known = devices.find((d) => d.id === savedId);
    if (!known) { bleLog('FC appareil absent de getDevices'); return false; }

    device = known;
    manualDisconnect = false;
    device.addEventListener('gattserverdisconnected', onDisconnected);

    bleLog('FC watchAdvertisements dispo ?', !!device.watchAdvertisements);
    if (!device.watchAdvertisements) {
      // Pas de scan de pub dispo : tentative directe (OK si déjà à portée).
      try { await openGatt(); return true; }
      catch (e) { bleLog('FC openGatt direct échec', e); setStatus('disconnected'); return false; }
    }
    watchForDevice();
    return true;
  }

  // Écoute passive et permanente : dès que l'appareil mémorisé émet sa pub, on
  // ouvre le GATT — quel que soit le moment où il est allumé. Reste discret
  // (pas de statut) tant qu'il n'a pas répondu. Coupée par disconnect().
  function watchForDevice() {
    if (scanAbort) return; // un seul scan à la fois
    const ac = new AbortController();
    scanAbort = ac;
    let connecting = false;
    const onAd = async () => {
      if (connecting || (device.gatt && device.gatt.connected)) return;
      connecting = true;
      bleLog('FC pub reçue → openGatt');
      try { await openGatt(); stopScan(); } // connecté → plus besoin d'écouter
      catch (e) { bleLog('FC openGatt échec', e); connecting = false; } // réémettra
    };
    device.addEventListener('advertisementreceived', onAd);
    ac.signal.addEventListener('abort', () => device.removeEventListener('advertisementreceived', onAd));
    bleLog('FC watchAdvertisements: scan démarré');
    device.watchAdvertisements({ signal: ac.signal }).catch((e) => { bleLog('FC watchAdvertisements erreur', e); stopScan(); });
  }

  function stopScan() {
    if (scanAbort) { scanAbort.abort(); scanAbort = null; }
  }

  function onValue(ev) {
    const { hr } = parseHeartRate(ev.target.value);
    if (hr != null) bus.update({ hr });
  }

  async function onDisconnected() {
    setStatus('disconnected');
    if (manualDisconnect || !device) return;
    for (let i = 0; i < MAX_RETRIES && !manualDisconnect; i += 1) {
      setStatus('reconnecting', i + 1);
      try { await openGatt(); return; }
      catch { await delay(1000 * (i + 1)); }
    }
    if (!manualDisconnect) setStatus('failed');
  }

  function disconnect() {
    manualDisconnect = true;
    stopScan();
    if (device && device.gatt.connected) device.gatt.disconnect();
  }

  return {
    connect,
    autoConnect,
    disconnect,
    onStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); },
    get connected() { return !!(device && device.gatt.connected); },
  };
}

// Heart Rate Measurement (0x2A37) : flags 8 bits puis FC (uint8 ou uint16).
export function parseHeartRate(dv) {
  const flags = dv.getUint8(0);
  let o = 1;
  const hr = (flags & 0x01) ? dv.getUint16(o, true) : dv.getUint8(o);
  return { hr };
}

const delay = (ms) => new Promise((res) => setTimeout(res, ms));
