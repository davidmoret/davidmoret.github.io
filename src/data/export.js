// Export d'une séance jouée : .json (résumé complet) → Web Share API
// (je choisis Proton Drive dans le menu Android).
// Fallback hors mobile : téléchargement.
import { fmtDuration, fmtDist } from '../ui/format.js';

export function buildJson(entry) {
  return JSON.stringify(entry, null, 2);
}

function baseName(entry) {
  return `ram-${entry.id.slice(0, 19).replace(/[:T]/g, '-')}`;
}

export async function shareSummary(entry) {
  const base = baseName(entry);
  const file = new File([buildJson(entry)], `${base}.json`, { type: 'application/json' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: entry.session_title });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }
  downloadFile(file);
}

function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
