// Construit l'entrée d'historique (résumé + timeline) d'une séance jouée,
// au format JSON de PROJET.md §7, à partir des échantillons du recorder.
// Calcule aussi le HRR (Heart Rate Recovery) si une section hr est présente.
import { fmtPace } from '../ui/format.js';
import { hrMax } from '../data/profile.js';

// Sous ce % de la FCmax à l'entrée en récup, la chute de FC n'est pas
// physiologiquement significative (cf. score de récupération parasympathique).
const HRR_MIN_INTENSITY = 0.70;

export function buildSummary(session, samples, globalMs, sectionEntryTs = {}, profile = null) {
  const duration_s = Math.round(globalMs / 1000);
  const distance_m = lastNonNull(samples, 'dist') ?? 0;

  const hrValues = pluck(samples, 'hr');
  const spmValues = pluck(samples, 'spm');
  const paceAvgSec = distance_m > 0 ? (duration_s / distance_m) * 500 : mean(pluck(samples, 'pace'));

  const hrr = computeHRR(session, samples, sectionEntryTs, profile);

  return {
    id: new Date().toISOString(),
    session_slug: session.slug,
    session_title: session.title,
    duration_s,
    distance_m: Math.round(distance_m),
    hr: {
      avg: hrValues.length ? Math.round(mean(hrValues)) : null,
      max: hrValues.length ? Math.max(...hrValues) : null,
    },
    pace_avg_500m: paceAvgSec ? fmtPace(paceAvgSec) : null,
    spm_avg: spmValues.length ? Math.round(mean(spmValues)) : null,
    sections: buildSections(session, samples),
    samples,
    hrr,
  };
}

// Heart Rate Recovery : chute de FC à +60s et +120s après l'entrée
// dans la première section de type hr.
function computeHRR(session, samples, sectionEntryTs, profile) {
  const hrSectionIdx = session.sections.findIndex((s) => s.target.type === 'hr');
  if (hrSectionIdx < 0) return null;
  const entrySec = sectionEntryTs[hrSectionIdx];
  if (entrySec == null) return null;

  // FC au moment d'entrée dans la section
  const hrAtEntry = hrAt(samples, entrySec);
  if (hrAtEntry == null) return null;

  const hr60 = hrAt(samples, entrySec + 60);
  const hr120 = hrAt(samples, entrySec + 120);

  // Fail-open : sans FCmax connue, on ne peut juger la significativité → on affiche.
  const max = profile ? hrMax(profile) : null;
  const significant = !max || hrAtEntry >= max * HRR_MIN_INTENSITY;

  return {
    hrStart: hrAtEntry,
    hrr60: hr60 != null ? hrAtEntry - hr60 : null,
    hrr120: hr120 != null ? hrAtEntry - hr120 : null,
    significant,
  };
}

function hrAt(samples, t) {
  // Trouve le sample le plus proche à t±2s
  let best = null;
  let bestDist = Infinity;
  for (const s of samples) {
    if (s.hr == null) continue;
    const d = Math.abs(s.t - t);
    if (d < bestDist) { bestDist = d; best = s.hr; }
  }
  return bestDist <= 2 ? best : null;
}

function buildSections(session, samples) {
  const bySection = new Map();
  for (const s of samples) {
    if (!bySection.has(s.section)) bySection.set(s.section, []);
    bySection.get(s.section).push(s);
  }
  const out = [];
  let prevDist = 0;
  for (const [idx, arr] of [...bySection.entries()].sort((a, b) => a[0] - b[0])) {
    const name = session.sections[idx]?.name ?? `Section ${idx + 1}`;
    const lastDist = lastNonNull(arr, 'dist');
    const distance_m = lastDist != null ? Math.max(0, Math.round(lastDist - prevDist)) : 0;
    if (lastDist != null) prevDist = lastDist;
    out.push({ name, duration_s: arr.length, distance_m });
  }
  return out;
}

function pluck(arr, key) {
  return arr.map((x) => x[key]).filter((v) => v != null);
}
function lastNonNull(arr, key) {
  for (let i = arr.length - 1; i >= 0; i -= 1) if (arr[i][key] != null) return arr[i][key];
  return null;
}
function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}
