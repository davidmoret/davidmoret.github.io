// Source cardio — capteur FC BLE standard (Polar Verity Sense). Service Heart
// Rate 0x180D, caractéristique Heart Rate Measurement 0x2A37. Pousse { hr }
// dans le bus normalisé. Validé par le spike Lot 0. Le cycle de vie
// connexion/reconnexion est mutualisé dans createBleSource().
import { createBleSource } from './source.js';

const HR_SERVICE = 0x180d;
const HR_MEASUREMENT = 0x2a37;
// Clé de mémorisation de l'appareil (id opaque, propre à l'origine).
const STORE_KEY = 'ble.heart.deviceId';

export function createHeartSource(bus) {
  return createBleSource(bus, {
    service: HR_SERVICE,
    characteristic: HR_MEASUREMENT,
    storeKey: STORE_KEY,
    defaultName: 'capteur FC',
    decode(dv) {
      const { hr } = parseHeartRate(dv);
      return hr != null ? { hr } : null;
    },
  });
}

// Heart Rate Measurement (0x2A37) : flags 8 bits puis FC (uint8 ou uint16).
export function parseHeartRate(dv) {
  const flags = dv.getUint8(0);
  let o = 1;
  const hr = (flags & 0x01) ? dv.getUint16(o, true) : dv.getUint8(o);
  return { hr };
}
