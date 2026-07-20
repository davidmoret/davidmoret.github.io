// Math pure de la jauge FC du mode récupération (§6.2). Pas de DOM.
import { describe, it, expect } from 'vitest';
import { recoveryGauge } from '../src/ui/live/recovery.js';

describe('recoveryGauge', () => {
  it('gaugeMax = seuil + 40', () => {
    expect(recoveryGauge(150, 120).gaugeMax).toBe(160);
  });

  it('repli 180 si pas de seuil, mark null', () => {
    const g = recoveryGauge(150, null);
    expect(g.gaugeMax).toBe(220);
    expect(g.markPct).toBeNull();
  });

  it('below = true quand FC ≤ seuil', () => {
    expect(recoveryGauge(120, 120).below).toBe(true);
    expect(recoveryGauge(121, 120).below).toBe(false);
  });

  it('fillPct = 0 sans FC, borné à [0,100]', () => {
    expect(recoveryGauge(null, 120).fillPct).toBe(0);
    expect(recoveryGauge(999, 120).fillPct).toBe(100);
  });

  it('seuil NaN traité comme absent (pas de mark ni de repli parasite)', () => {
    const g = recoveryGauge(150, NaN);
    expect(g.gaugeMax).toBe(220); // repli 180 + 40
    expect(g.markPct).toBeNull();
    expect(g.below).toBe(false);
    expect(Number.isNaN(g.fillPct)).toBe(false);
  });

  it('positions cohérentes seuil vs FC sous le seuil', () => {
    const g = recoveryGauge(80, 120); // gaugeMax 160
    expect(g.markPct).toBeCloseTo(75, 5); // 120/160
    expect(g.fillPct).toBeCloseTo(50, 5); // 80/160
    expect(g.below).toBe(true);
  });
});
