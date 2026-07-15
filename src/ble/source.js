// Socle commun aux sources BLE (rameur FTMS, ceinture FC). Tout le cycle de
// vie — appairage manuel, reconnexion auto via getDevices(), écoute passive des
// pubs (watchAdvertisements), retries, déconnexion — est identique d'un capteur
// à l'autre. Seuls varient les UUID, la clé de mémorisation, le nom par défaut
// et le décodage de la trame. Chaque source concrète (rower.js, heart.js) n'est
// donc qu'un appel à createBleSource() avec sa config.
//
// États émis à l'abonné de statut : 'connecting' | 'connected' | 'reconnecting'
//   | 'disconnected' | 'failed'.
const MAX_RETRIES = 5;
const OPTIONAL_SERVICES = [0x180a, 0x180f]; // device info + battery

// config = { service, characteristic, storeKey, defaultName, decode }
//   decode(DataView) → objet de mise à jour partielle du bus (ou null/vide pour
//   ignorer la trame).
export function createBleSource(bus, config) {
  const { service, characteristic: charUuid, storeKey, defaultName, decode } = config;
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
      filters: [{ services: [service] }],
      optionalServices: OPTIONAL_SERVICES,
    });
    device.addEventListener('gattserverdisconnected', onDisconnected);
    await openGatt();
  }

  async function openGatt() {
    setStatus('connecting');
    const server = await device.gatt.connect();
    const svc = await server.getPrimaryService(service);
    characteristic = await svc.getCharacteristic(charUuid);
    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', onValue);
    try { localStorage.setItem(storeKey, device.id); } catch { /* stockage indispo */ }
    setStatus('connected', device.name || defaultName);
  }

  // Reconnexion auto sans sélecteur : l'appareil déjà autorisé est retrouvé via
  // getDevices(), puis on attend qu'il émette pour ouvrir le GATT. Renvoie true
  // si connecté. Silencieux (pas d'erreur) si rien de mémorisé ou hors de portée.
  async function autoConnect() {
    if (device && device.gatt && device.gatt.connected) return true;
    if (!navigator.bluetooth || !navigator.bluetooth.getDevices) return false;
    const savedId = (() => { try { return localStorage.getItem(storeKey); } catch { return null; } })();
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
      try { await openGatt(); stopScan(); } // connecté → plus besoin d'écouter
      catch { connecting = false; }         // réémettra, on garde l'écoute
    };
    device.addEventListener('advertisementreceived', onAd);
    ac.signal.addEventListener('abort', () => device.removeEventListener('advertisementreceived', onAd));
    device.watchAdvertisements({ signal: ac.signal }).catch(() => stopScan());
  }

  function stopScan() {
    if (scanAbort) { scanAbort.abort(); scanAbort = null; }
  }

  function onValue(ev) {
    const update = decode(ev.target.value);
    if (update && Object.keys(update).length) bus.update(update);
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

const delay = (ms) => new Promise((res) => setTimeout(res, ms));
