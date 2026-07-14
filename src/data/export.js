// Partage d'une séance (définition) en fichier texte lisible via Web Share API.
// Pas d'export d'historique ici : la sauvegarde/restauration passe par le backup global.

// ── Séance → texte ────────────────────────────────────────────────────

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
    if (sec.targetHrZone) lines.push(`- target_hr_zone: [${sec.targetHrZone[0]}, ${sec.targetHrZone[1]}]`);
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

// ── Partager un fichier séance ────────────────────────────────────────

export function canShareFiles() {
  if (!navigator.canShare) return false;
  const blob = new Blob(['test'], { type: 'text/plain' });
  const file = new File([blob], 'test.txt', { type: 'text/plain' });
  return navigator.canShare({ files: [file] });
}

export async function shareSession(s) {
  const md = sessionToMarkdown(s);
  const blob = new Blob([md], { type: 'text/plain' });
  const file = new File([blob], `${s.slug}.txt`, { type: 'text/plain' });
  await navigator.share({ files: [file] });
}
