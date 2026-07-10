// Source de données FACTICES (mode démo) : émet des métriques rameur + FC
// réalistes dans le bus, pour développer et tester sans capteur.
//
// Au Lot 3, ce module sera remplacé par heart.js + rower.js qui poussent
// dans le même bus, avec exactement le même contrat (cf. normalizer.js).
export function createSimulator(bus) {
  let raf = null;
  let running = false;
  let lastFrame = 0;
  let lastEmit = 0;
  let phase = 0;
  let dist = 0;
  let strokes = 0;
  let hr = 95;
  let recoveryMode = false;

  function frame(now) {
    if (!running) return;
    const dt = lastFrame ? (now - lastFrame) / 1000 : 0;
    lastFrame = now;

    if (recoveryMode) {
      phase += dt;
      // FC décroît exponentiellement vers ~65 bpm
      const target = 65;
      hr += (target - hr) * Math.min(1, dt * 0.08);
      // Rameur à l'arrêt — distance/cadence/puissance n'évoluent plus
      if (now - lastEmit >= 250) {
        lastEmit = now;
        bus.update({
          spm: 0,
          power: 0,
          hr: Math.round(hr),
        });
      }
    } else {
      phase += dt;
      const pace = 130 + 18 * Math.sin(phase / 14);
      const speed = 500 / pace;
      dist += speed * dt;
      const spm = 24 + 4 * Math.sin(phase / 14);
      strokes += (spm / 60) * dt;
      const power = Math.round(150 * (130 / pace) ** 3);
      const hrTarget = 118 + (145 - pace) * 1.4;
      hr += (hrTarget - hr) * Math.min(1, dt * 0.15);

      if (now - lastEmit >= 250) {
        lastEmit = now;
        bus.update({
          pace: Math.round(pace),
          spm: Math.round(spm),
          dist: Math.round(dist),
          strokes: Math.round(strokes),
          power,
          hr: Math.round(hr),
        });
      }
    }
    raf = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      lastFrame = 0;
      lastEmit = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = null;
    },
    setRecoveryMode(on) {
      recoveryMode = !!on;
    },
    get running() { return running; },
  };
}
