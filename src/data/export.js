// Export d'une séance jouée : .json (résumé complet) → Web Share API
// (choix de l'app cible : Proton Drive, Files, etc.).
// Fallback : téléchargement dans Downloads.
import { fmtDuration, fmtDist } from '../ui/format.js';

export function buildJson(entry) {
  return JSON.stringify(entry, null, 2);
}

function baseName(entry) {
  return `ram-${entry.id.slice(0, 19).replace(/[:T]/g, '-')}`;
}

export async function shareSummary(entry) {
  const base = baseName(entry);
  // text/plain est mieux supporté par canShare/share que application/json
  const file = new File([buildJson(entry)], `${base}.json`, { type: 'text/plain' });

  if (navigator.share) {
    try {
      if (navigator.canShare && !navigator.canShare({ files: [file] })) {
        throw new Error('canShare false');
      }
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
