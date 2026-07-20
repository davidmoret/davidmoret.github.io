// Mode récupération (retour au calme) : breath pacer 4s/6s + jauge FC.
// Bascule quand la section courante a une cible hr. Extrait de screen-live.js
// (chef d'orchestre) — cf. PROJET.md §14 et §6.2.

// Math pure de la jauge FC (testable, sans DOM) : positions en % + état.
// gaugeMax = seuil + 40 (marge au-dessus du seuil) ; repli 180 si pas de seuil.
export function recoveryGauge(hr, threshold) {
  const hasThreshold = Number.isFinite(threshold);
  const gaugeMax = (hasThreshold ? threshold : 180) + 40;
  const clampPct = (v) => Math.min(100, Math.max(0, v));
  return {
    gaugeMax,
    markPct: hasThreshold ? clampPct((threshold / gaugeMax) * 100) : null,
    fillPct: hr != null ? clampPct((hr / gaugeMax) * 100) : 0,
    below: hr != null && hasThreshold && hr <= threshold,
  };
}

export function createRecovery({ root, els, bus, engine }) {
  let breathTimers = [];

  function setBreathPhase(phase) {
    root.dataset.recoveryPhase = phase;
    const ms = phase === 'inhale' ? 4000 : 6000;
    const next = phase === 'inhale' ? 'exhale' : 'inhale';
    breathTimers.push(setTimeout(() => setBreathPhase(next), ms));
  }

  function startBreath() {
    stopBreath();
    setBreathPhase('inhale');
  }

  function stopBreath() {
    for (const id of breathTimers) clearTimeout(id);
    breathTimers = [];
    delete root.dataset.recoveryPhase;
  }

  function render() {
    const hr = bus.latest.hr;
    const threshold = engine.snapshot().hrThreshold;
    const hasHr = hr != null;
    const g = recoveryGauge(hr, threshold);

    els.recoveryHrVal.textContent = hasHr ? hr : '—';
    els.recoveryHrVal.dataset.state = hasHr && g.below ? 'below' : 'above';
    els.recoveryNoHr.hidden = hasHr;

    els.recoveryGaugeMark.hidden = g.markPct == null;
    els.recoveryGaugeLabel.hidden = g.markPct == null;
    if (g.markPct != null) {
      els.recoveryGaugeMark.style.left = `${g.markPct}%`;
      els.recoveryGaugeLabel.style.left = `${g.markPct}%`;
      els.recoveryGaugeLabel.textContent = threshold;
    }
    els.recoveryGaugeFill.style.width = `${g.fillPct}%`;
    if (hasHr) {
      els.recoveryGaugeFill.style.background = g.below ? 'var(--c-accent)' : 'var(--c-err)';
    }
  }

  // active = la section courante a une cible hr → bascule UI + breath pacer.
  function update(active) {
    if (active) {
      root.dataset.recovery = '';
      startBreath();
    } else {
      delete root.dataset.recovery;
      stopBreath();
    }
  }

  return { render, update, stop: stopBreath };
}
