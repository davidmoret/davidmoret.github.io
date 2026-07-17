// Caractérisation : round-trip Markdown → Session → Markdown → Session.
// Verrouille le comportement parse↔format avant la factorisation (§14).
import { describe, it, expect } from 'vitest';
import { parseSession } from '../src/data/session-parser.js';
import { sessionToMarkdown } from '../src/data/export.js';

const SAMPLE = `---
title: Pyramide 500m
type: intervalles
description: Échauffement + pyramide + retour au calme
display: cardio
target_hr_zone: [120, 150]
---

## Échauffement
- duree: 5:00
- note: cadence libre

## Intervalle 1
- distance: 500m
- cadence: 24-26 spm
- target_hr_zone: [130, 160]

## Bloc long
- distance: 1.5km

## Palier %
- cible_fc: 55%

## Karvonen
- cible_fc: karvonen-50%

## Retour au calme
- cible_fc: max-40
- duree: 1:30
- note: respire
`;

// Réduit une section à ses champs sérialisés (comparables round-trip).
function shape(sec) {
  return {
    name: sec.name,
    target: sec.target,
    targetHrZone: sec.targetHrZone,
    cadence: sec.cadence,
    display: sec.display,
    note: sec.note,
  };
}

describe('round-trip séance', () => {
  it('parse → markdown → parse conserve les cibles et métadonnées', () => {
    const a = parseSession(SAMPLE, 'pyramide-500m');
    const b = parseSession(sessionToMarkdown(a), 'pyramide-500m');

    expect(b.title).toBe(a.title);
    expect(b.type).toBe(a.type);
    expect(b.description).toBe(a.description);
    expect(b.display).toBe(a.display);
    expect(b.targetHrZone).toEqual(a.targetHrZone);
    expect(b.sections.map(shape)).toEqual(a.sections.map(shape));
  });

  it('cibles hr : dynamic / fixed / pct / karvonen conservées', () => {
    const md = `---
title: T
---

## D
- cible_fc: max-40

## F
- cible_fc: 100

## P
- cible_fc: 55%

## K
- cible_fc: karvonen-50%
`;
    const s = parseSession(md).sections.map((x) => x.target);
    expect(s[0]).toMatchObject({ type: 'hr', mode: 'dynamic', delta: 40 });
    expect(s[1]).toMatchObject({ type: 'hr', mode: 'fixed', value: 100 });
    expect(s[2]).toMatchObject({ type: 'hr', mode: 'pct', pct: 55 });
    expect(s[3]).toMatchObject({ type: 'hr', mode: 'karvonen', pct: 50 });
    // round-trip
    const back = parseSession(sessionToMarkdown(parseSession(md))).sections.map((x) => x.target);
    expect(back).toEqual(s);
  });

  it('durée (m:ss) et cap hr : mm:ss non arrondi à la minute', () => {
    const md = `---
title: T
---

## R
- cible_fc: max-40
- duree: 1:30
`;
    const s = parseSession(md);
    expect(s.sections[0].target.cap).toBe(90);
    // le cap doit ressortir en 1:30, pas "1min"
    expect(sessionToMarkdown(s)).toContain('duree: 1:30');
  });

  it('distance : km → mètres, re-sérialisée en m si non multiple de 1000', () => {
    const md = `---
title: T
---

## Bloc
- distance: 1.5km

## Rond
- distance: 2km
`;
    const s = parseSession(md);
    expect(s.sections[0].target).toEqual({ type: 'distance', value: 1500 });
    expect(s.sections[1].target).toEqual({ type: 'distance', value: 2000 });
    const md2 = sessionToMarkdown(s);
    expect(md2).toContain('distance: 1500m'); // 1.5km → 1500m (équivalent)
    expect(md2).toContain('distance: 2km'); // multiple de 1000 → km
    // valeurs stables au re-parse
    expect(parseSession(md2).sections.map((x) => x.target.value)).toEqual([1500, 2000]);
  });
});
