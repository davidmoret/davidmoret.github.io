// Source cardio — capteur FC BLE standard (Polar Verity Sense). Service Heart
// Rate 0x180D, caractéristique Heart Rate Measurement 0x2A37. Pousse { hr }
// dans le bus normalisé. Validé par le spike Lot 0.
const HR_SERVICE = 0x180d;
const HR_MEASUREMENT = 0x2a37;
const MAX_RETRIES = 5;
// Clé de mémorisation de l'appareil (id opaque, propre à l'origine) et durée
// max d'attente d'une pub BLE avant d'abandonner l'auto-connexion en silence.
const STORE_KEY = 'ble.heart.deviceId';
const AUTO_TIMEOUT_MS = 15000;

export function createHeartSource(bus) {
  let device = null;
  let characteristic = null;
  let manualDisconnect = false;
  const statusListeners = new Set();
  const setStatus = (state, detail) => { for (const fn of statusListeners) fn(state, detail); };

  async function connect() {
    manualDisconnect = false;
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
    if (device && device.gatt && device.gatt.connected) return true;
    if (!navigator.bluetooth || !navigator.bluetooth.getDevices) return false;
    const savedId = (() => { try { return localStorage.getItem(STORE_KEY); } catch { return null; } })();
    if (!savedId) return false;

    let known;
    try { known = (await navigator.bluetooth.getDevices()).find((d) => d.id === savedId); }
    catch { return false; }
    if (!known) return false;

    device = known;
    manualDisconnect = false;
    device.addEventListener('gattserverdisconnected', onDisconnected);

    if (!device.watchAdvertisements) {
      // Pas de scan de pub dispo : tentative directe (OK si déjà à portée).
      try { await openGatt(); return true; }
      catch { setStatus('disconnected'); return false; }
    }
    return waitForAdvertisement();
  }

  function waitForAdvertisement() {
    const ac = new AbortController();
    setStatus('reconnecting', 'auto');
    return new Promise((resolve) => {
      const cleanup = () => { clearTimeout(timer); device.removeEventListener('advertisementreceived', onAd); };
      const timer = setTimeout(() => { cleanup(); ac.abort(); setStatus('disconnected'); resolve(false); }, AUTO_TIMEOUT_MS);
      const onAd = async () => {
        cleanup();
        ac.abort(); // stoppe le scan avant d'ouvrir le GATT
        try { await openGatt(); resolve(true); }
        catch { setStatus('disconnected'); resolve(false); }
      };
      device.addEventListener('advertisementreceived', onAd);
      device.watchAdvertisements({ signal: ac.signal }).catch(() => { cleanup(); setStatus('disconnected'); resolve(false); });
    });
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
