// Export d'une séance jouée : .json → download dans Downloads/.
// Le fichier peut ensuite être uploadé vers Proton Drive via l'app Android.
// Import .json supporté pour restaurer depuis un backup.
import { fmtDuration, fmtDist } from '../ui/format.js';

export function buildJson(entry) {
  return JSON.stringify(entry, null, 2);
}

function baseName(entry) {
  return `ram-${entry.id.slice(0, 19).replace(/[:T]/g, '-')}`;
}

export function shareSummary(entry) {
  const json = buildJson(entry);
  const base = baseName(entry);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${base}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
