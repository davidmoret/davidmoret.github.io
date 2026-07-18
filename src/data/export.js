// Partage d'une séance (définition) en fichier texte lisible via Web Share API.
// Pas d'export d'historique ici : la sauvegarde/restauration passe par le backup global.

import { formatDuration, formatDistance, formatHrTarget, formatZone } from './session-format.js';

// ── Séance → texte ────────────────────────────────────────────────────

export function sessionToMarkdown(s) {
  const lines = ['---'];
  lines.push(`slug: ${s.slug}`);
  lines.push(`title: ${s.title}`);
  if (s.description) lines.push(`description: ${s.description}`);
  if (s.targetHrZone) lines.push(`target_hr_zone: ${formatZone(s.targetHrZone)}`);
  if (s.display && s.display !== 'perf') lines.push(`display: ${s.display}`);
  lines.push('---');

  for (const sec of s.sections) {
    lines.push('');
    lines.push(`## ${sec.name}`);
    if (sec.target.type === 'hr') {
      lines.push(`- cible_fc: ${formatHrTarget(sec.target)}`);
      if (sec.target.cap) lines.push(`- duree: ${formatDuration(sec.target.cap)}`);
    } else if (sec.target.type === 'duration') {
      lines.push(`- duree: ${formatDuration(sec.target.value)}`);
    } else if (sec.target.type === 'distance') {
      lines.push(`- distance: ${formatDistance(sec.target.value)}`);
    }
    if (sec.targetHrZone) lines.push(`- target_hr_zone: ${formatZone(sec.targetHrZone)}`);
    if (sec.cadence) lines.push(`- cadence: ${sec.cadence}`);
    if (sec.display) lines.push(`- display: ${sec.display}`);
    if (sec.note) lines.push(`- note: ${sec.note}`);
  }

  return lines.join('\n') + '\n';
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
