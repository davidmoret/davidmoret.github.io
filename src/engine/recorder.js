// Échantillonne la timeline à 1 Hz (métriques + section courante) pendant la
// séance. La timeline sert au graphe post-séance, aux stats et au calcul HRR.
// L'horodatage `t` suit le chrono ACTIF de l'engine (pauses exclues).
//
// Qualité de mesure : plutôt qu'un snapshot instantané, chaque échantillon 1 Hz
// est la MOYENNE des valeurs reçues pendant la seconde (métriques de débit :
// fc/spm/puissance/allure) → lisse le bruit et exploite les sources > 1 Hz.
// La distance (cumulée) prend la dernière valeur. Une métrique sans mise à jour
// depuis STALE_MS est enregistrée à null (pas de valeur « figée » à l'arrêt).
export function createRecorder(engine, bus) {
  const samples = [];
  let timer = null;
  let running = false;

  // Timestamps d'entrée dans chaque section (pour HRR)
  const sectionEntryTs = {};

  const RATE = ['hr', 'spm', 'power', 'pace'];
  const STALE_MS = 3000;
  const acc = {};
  const lastSeen = {};
  const resetAcc = () => { for (const k of RATE) acc[k] = { sum: 0, n: 0 }; };
  resetAcc();

  // Accumule chaque paquet reçu pendant la seconde en cours (moyenne + fraîcheur).
  const unsub = bus.subscribe((m) => {
    if (!running) return;
    const now = performance.now();
    for (const k of RATE) {
      if (m[k] != null) { acc[k].sum += m[k]; acc[k].n += 1; lastSeen[k] = now; }
    }
    if (m.dist != null) lastSeen.dist = now;
  });

  const isFresh = (k) => lastSeen[k] != null && performance.now() - lastSeen[k] <= STALE_MS;

  // Moyenne de la seconde ; à défaut, dernière valeur si encore fraîche ; sinon null.
  function rate(k) {
    if (acc[k].n) return Math.round(acc[k].sum / acc[k].n);
    return isFresh(k) ? bus.latest[k] : null;
  }

  function sample() {
    const snap = engine.snapshot();
    samples.push({
      t: Math.round(snap.globalMs / 1000),
      section: snap.index,
      hr: rate('hr'),
      spm: rate('spm'),
      w: rate('power'),
      dist: isFresh('dist') ? bus.latest.dist : null,
      pace: rate('pace'),
    });
    resetAcc();
  }

  return {
    start() { samples.length = 0; resetAcc(); running = true; timer = setInterval(sample, 1000); },
    pause() { clearInterval(timer); timer = null; running = false; },
    resume() { if (!timer) { running = true; timer = setInterval(sample, 1000); } },
    stop() { clearInterval(timer); timer = null; running = false; unsub(); },
    get samples() { return samples; },
    markSectionEntry(index, globalMs) { sectionEntryTs[index] = Math.round(globalMs / 1000); },
    get sectionEntryTs() { return sectionEntryTs; },
  };
}
