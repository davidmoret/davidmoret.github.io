// Source rameur — Merach / ChangYow via FTMS standard (service 0x1826,
// caractéristique Rower Data 0x2AD1). Le décodage a été validé par le spike
// Lot 0 (cf. tools/ble-spike.html). Tout le cycle de vie connexion/reconnexion
// est mutualisé dans createBleSource() ; ici on ne fournit que la config.
import { createBleSource } from './source.js';

const FTMS_SERVICE = 0x1826;
const ROWER_DATA = 0x2ad1;
// Clé de mémorisation de l'appareil (id opaque, propre à l'origine).
const STORE_KEY = 'ble.rower.deviceId';

const ROWER_FIELDS = ['spm', 'strokes', 'dist', 'pace', 'power'];

export function createRowerSource(bus) {
  return createBleSource(bus, {
    service: FTMS_SERVICE,
    characteristic: ROWER_DATA,
    storeKey: STORE_KEY,
    defaultName: 'rameur',
    decode(dv) {
      const r = parseRowerData(dv);
      const update = {};
      for (const k of ROWER_FIELDS) if (k in r) update[k] = r[k];
      // La FC du rameur (champ hr) est à 0 sur ce matériel → on l'ignore,
      // la FC vient du Polar (heart.js).
      return update;
    },
  });
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
