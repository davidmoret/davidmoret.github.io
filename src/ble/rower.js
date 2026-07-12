// Source rameur — Merach / ChangYow via FTMS standard (service 0x1826,
// caractéristique Rower Data 0x2AD1). Le décodage a été validé par le spike
// Lot 0 (cf. tools/ble-spike.html). Pousse les métriques dans le bus normalisé.
//
// États émis à l'abonné de statut : 'connecting' | 'connected' | 'reconnecting'
//   | 'disconnected' | 'failed'.
import { bleLog } from './debug.js';

const FTMS_SERVICE = 0x1826;
const ROWER_DATA = 0x2ad1;
const MAX_RETRIES = 5;
// Clé de mémorisation de l'appareil (id opaque, propre à l'origine).
const STORE_KEY = 'ble.rower.deviceId';

export function createRowerSource(bus) {
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
      filters: [{ services: [FTMS_SERVICE] }],
      optionalServices: [0x180a, 0x180f],
    });
    device.addEventListener('gattserverdisconnected', onDisconnected);
    await openGatt();
  }

  async function openGatt() {
    setStatus('connecting');
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(FTMS_SERVICE);
    characteristic = await service.getCharacteristic(ROWER_DATA);
    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', onValue);
    try { localStorage.setItem(STORE_KEY, device.id); } catch { /* stockage indispo */ }
    setStatus('connected', device.name || 'rameur');
    navigator.bluetooth.getDevices?.().then((d) => bleLog('rameur sonde getDevices post-co →', d.length)).catch(() => {});
  }

  // Reconnexion auto sans sélecteur : l'appareil déjà autorisé est retrouvé via
  // getDevices(), puis on attend qu'il émette pour ouvrir le GATT. Renvoie true
  // si connecté. Silencieux (pas d'erreur) si rien de mémorisé ou hors de portée.
  async function autoConnect() {
    bleLog('rameur autoConnect: start');
    if (device && device.gatt && device.gatt.connected) { bleLog('rameur déjà connecté'); return true; }
    if (!navigator.bluetooth || !navigator.bluetooth.getDevices) { bleLog('rameur getDevices non supporté'); return false; }
    const savedId = (() => { try { return localStorage.getItem(STORE_KEY); } catch { return null; } })();
    bleLog('rameur savedId', savedId);
    if (!savedId) return false;

    let devices;
    try { devices = await navigator.bluetooth.getDevices(); }
    catch (e) { bleLog('rameur getDevices erreur', e); return false; }
    bleLog('rameur getDevices →', devices.length, devices.map((d) => `${d.name || '?'}:${d.id}`));
    const known = devices.find((d) => d.id === savedId);
    if (!known) { bleLog('rameur appareil absent de getDevices'); return false; }

    device = known;
    manualDisconnect = false;
    device.addEventListener('gattserverdisconnected', onDisconnected);

    bleLog('rameur watchAdvertisements dispo ?', !!device.watchAdvertisements);
    if (!device.watchAdvertisements) {
      // Pas de scan de pub dispo : tentative directe (OK si déjà à portée).
      try { await openGatt(); return true; }
      catch (e) { bleLog('rameur openGatt direct échec', e); setStatus('disconnected'); return false; }
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
      bleLog('rameur pub reçue → openGatt');
      try { await openGatt(); stopScan(); } // connecté → plus besoin d'écouter
      catch (e) { bleLog('rameur openGatt échec', e); connecting = false; } // réémettra
    };
    device.addEventListener('advertisementreceived', onAd);
    ac.signal.addEventListener('abort', () => device.removeEventListener('advertisementreceived', onAd));
    bleLog('rameur watchAdvertisements: scan démarré');
    device.watchAdvertisements({ signal: ac.signal }).catch((e) => { bleLog('rameur watchAdvertisements erreur', e); stopScan(); });
  }

  function stopScan() {
    if (scanAbort) { scanAbort.abort(); scanAbort = null; }
  }

  function onValue(ev) {
    const r = parseRowerData(ev.target.value);
    const update = {};
    for (const k of ['spm', 'strokes', 'dist', 'pace', 'power']) {
      if (k in r) update[k] = r[k];
    }
    // La FC du rameur (champ hr) est à 0 sur ce matériel → on l'ignore,
    // la FC vient du Polar (heart.js).
    bus.update(update);
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

// FTMS Rower Data (0x2AD1) : flags 16 bits LE puis champs conditionnels.
export function parseRowerData(dv) {
  let o = 0;
  const flags = dv.getUint16(o, true); o += 2;
  const has = (b) => (flags & (1 << b)) !== 0;
  const r = {};
  if (!has(0)) { r.spm = dv.getUint8(o) / 2; o += 1; r.strokes = dv.getUint16(o, true); o += 2; }
  if (has(1)) { r.spmAvg = dv.getUint8(o) / 2; o += 1; }
  if (has(2)) { r.dist = dv.getUint8(o) | (dv.getUint8(o + 1) << 8) | (dv.getUint8(o + 2) << 16); o += 3; }
  if (has(3)) { r.pace = dv.getUint16(o, true); o += 2; }
  if (has(4)) { r.paceAvg = dv.getUint16(o, true); o += 2; }
  if (has(5)) { r.power = dv.getInt16(o, true); o += 2; }
  if (has(6)) { r.powerAvg = dv.getInt16(o, true); o += 2; }
  if (has(7)) { r.resistance = dv.getInt16(o, true); o += 2; }
  if (has(8)) { r.energyTotal = dv.getUint16(o, true); o += 2; r.energyHour = dv.getUint16(o, true); o += 2; r.energyMin = dv.getUint8(o); o += 1; }
  if (has(9)) { r.hr = dv.getUint8(o); o += 1; }
  if (has(10)) { o += 1; }
  if (has(11)) { r.elapsed = dv.getUint16(o, true); o += 2; }
  if (has(12)) { r.remaining = dv.getUint16(o, true); o += 2; }
  return r;
}

const delay = (ms) => new Promise((res) => setTimeout(res, ms));
