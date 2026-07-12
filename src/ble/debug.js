// Journal de debug BLE, activé en ajoutant ?bledebug à l'URL. Affiche un
// overlay en bas d'écran (pratique sur tablette, sans PC branché) et double
// dans la console. Inerte si le paramètre est absent → aucun impact en prod.
const ENABLED = typeof location !== 'undefined' && /[?&#]bledebug/.test(location.href);
let panel = null;

export function bleLog(...args) {
  if (!ENABLED) return;
  const line = args
    .map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === 'object' ? JSON.stringify(a) : String(a)))
    .join(' ');
  console.log('[ble]', line);
  ensurePanel();
  const row = document.createElement('div');
  row.textContent = `${new Date().toLocaleTimeString()} ${line}`;
  panel.appendChild(row);
  while (panel.childNodes.length > 50) panel.removeChild(panel.firstChild);
  panel.scrollTop = panel.scrollHeight;
}

function ensurePanel() {
  if (panel || typeof document === 'undefined') return;
  panel = document.createElement('div');
  panel.style.cssText =
    'position:fixed;left:0;right:0;bottom:0;max-height:42vh;overflow:auto;z-index:99999;' +
    'background:rgba(0,0,0,.88);color:#4ade80;font:11px/1.35 monospace;padding:4px 6px;white-space:pre-wrap;';
  document.body.appendChild(panel);
}
