// Export d'une séance jouée : .json → Web Share API (choix de l'app cible).
// Fallback : téléchargement dans Downloads.
import { fmtDuration, fmtDist } from '../ui/format.js';

export function buildJson(entry) {
  return JSON.stringify(entry, null, 2);
}

function baseName(entry) {
  return `ram-${entry.id.slice(0, 19).replace(/[:T]/g, '-')}`;
}

export async function shareSummary(entry) {
  const json = buildJson(entry);

  if (navigator.share) {
    try {
      await navigator.share({
        title: entry.session_title,
        text: json,
      });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      alert(`share text failed: ${e?.name} — ${e?.message}\nshare exists: ${!!navigator.share}`);
    }
  } else {
    alert('navigator.share does not exist');
  }
  downloadFile(json, baseName(entry));
}

function downloadFile(json, base) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${base}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
