// Export d'une séance jouée : .json → download dans Downloads/.
// Le fichier peut ensuite être uploadé vers Proton Drive via l'app Android.
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

// ── Session → Markdown ────────────────────────────────────────────────

export function sessionToMarkdown(s) {
  const lines = ['---'];
  lines.push(`title: ${s.title}`);
  if (s.type) lines.push(`type: ${s.type}`);
  if (s.description) lines.push(`description: ${s.description}`);
  if (s.targetHrZone) lines.push(`target_hr_zone: [${s.targetHrZone[0]}, ${s.targetHrZone[1]}]`);
  if (s.display && s.display !== 'perf') lines.push(`display: ${s.display}`);
  lines.push('---');

  for (const sec of s.sections) {
    lines.push('');
    lines.push(`## ${sec.name}`);
    if (sec.target.type === 'hr') {
      const hrVal = formatHrTarget(sec.target);
      lines.push(`- cible_fc: ${hrVal}`);
      if (sec.target.cap) lines.push(`- duree: ${fmtCap(sec.target.cap)}`);
    } else if (sec.target.type === 'duration') {
      lines.push(`- duree: ${fmtSec(sec.target.value)}`);
    } else if (sec.target.type === 'distance') {
      lines.push(`- distance: ${fmtDistMd(sec.target.value)}`);
    }
    if (sec.cadence) lines.push(`- cadence: ${sec.cadence}`);
    if (sec.note) lines.push(`- note: ${sec.note}`);
  }

  return lines.join('\n') + '\n';
}

function formatHrTarget(t) {
  if (t.mode === 'dynamic') return `max-${t.delta}`;
  if (t.mode === 'fixed') return String(t.value);
  if (t.mode === 'pct') return `${t.pct}%`;
  if (t.mode === 'karvonen') return `karvonen-${t.pct}%`;
  return '100';
}

function fmtSec(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function fmtCap(s) {
  return `${Math.floor(s / 60)}min`;
}

function fmtDistMd(m) {
  if (m >= 1000 && m % 1000 === 0) return `${m / 1000}km`;
  return `${m}m`;
}

// ── Partager un .md de définition de séance ───────────────────────────
// Chrome Android accepte text/plain pour les fichiers partagés, pas text/markdown.

export function canShareFiles() {
  if (!navigator.canShare) return false;
  const blob = new Blob(['test'], { type: 'text/plain' });
  const file = new File([blob], 'test.md', { type: 'text/plain' });
  return navigator.canShare({ files: [file] });
}

export async function shareSession(s) {
  const md = sessionToMarkdown(s);
  const filename = `${s.slug}.md`;
  const blob = new Blob([md], { type: 'text/plain' });
  const file = new File([blob], filename, { type: 'text/plain' });
  const shareData = { files: [file] };

  if (navigator.canShare?.(shareData)) {
    await navigator.share(shareData);
  } else {
    // Fallback texte brut
    await navigator.share({ title: s.title, text: md });
  }
}
