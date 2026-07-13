// Écran Live : métrique « héro » + tuiles secondaires, chrono global + section,
// contrôles gros doigts, indicateur de zone FC. 4 modes (perf/cardio/complet/zen)
// changeables à la volée (cf. PROJET.md §6.1).
//
// Quand la section courante a une cible hr (retour au calme), l'UI bascule
// en mode récup : breath pacer + jauge FC + skip manuel.
import { getDefinition, putHistory } from '../data/store.js';
import { getProfile } from '../data/profile.js';
import { buildSummary } from '../stats/summary.js';
import { createMetricBus } from '../ble/normalizer.js';
import { createSimulator } from '../ble/simulator.js';
import { createRowerSource } from '../ble/rower.js';
import { createHeartSource } from '../ble/heart.js';
import { createSessionEngine } from '../engine/session-engine.js';
import { createRecorder } from '../engine/recorder.js';
import { fmtDuration, fmtPace, fmtDist, escapeHtml, prettyDeviceName } from './format.js';
import { initAudio, cue, beepShort, beepLong } from './feedback.js';
import { go } from './router.js';

const BLE_OK = typeof navigator !== 'undefined' && !!navigator.bluetooth;

const MODES = ['perf', 'cardio', 'complet', 'zen', 'cad'];

const LONG_PRESS_MS = 1500;

const LAYOUT = {
  perf:    { hero: 'pace', tiles: ['spm', 'hr', 'sdist'] },
  cardio:  { hero: 'hr',   tiles: ['pace', 'spm', 'dist'] },
  complet: { hero: null,   tiles: ['pace', 'hr', 'spm', 'power', 'dist', 'stime'] },
  zen:     { hero: 'stime', tiles: ['pace', 'hr', 'spm'] },
  cad:     { hero: 'spm',  tiles: ['power', 'hr', 'stime'] },
};

// Chrono de section : décompte si la section se clôt au temps (cible durée),
// sinon temps écoulé.
function sectionClock(s) {
  const t = s.section && s.section.target;
  if (t && t.type === 'duration') {
    return fmtDuration(Math.max(0, t.value - s.sectionMs / 1000));
  }
  return fmtDuration(s.sectionMs / 1000);
}

const METRIC = {
  pace:  (m) => ({ k: '/500m', v: fmtPace(m.pace) }),
  hr:    (m) => ({ k: 'fc', v: m.hr ?? '—', u: 'bpm' }),
  spm:   (m) => ({ k: 'cadence', v: m.spm ?? '—', u: 'spm' }),
  power: (m) => ({ k: 'puissance', v: m.power ?? '—', u: 'W' }),
  dist:  (m) => ({ k: 'distance', v: m.dist != null ? fmtDist(m.dist) : '—' }),
  sdist: (m, s) => ({ k: 'dist. section', v: fmtDist(s.sectionDist || 0) }),
  stime: (m, s) => ({ k: 'chrono section', v: sectionClock(s) }),
};

export async function screenLive({ slug }, outlet) {
  const session = await getDefinition(slug);
  if (!session) {
    outlet.innerHTML = '<main class="screen"><p class="empty">Séance introuvable.</p></main>';
    return {};
  }

  const profile = await getProfile();
  let mode = session.display;
  let demo = !BLE_OK;
  const bus = createMetricBus();
  const engine = createSessionEngine(session, profile);
  const sim = createSimulator(bus);
  const rower = createRowerSource(bus);
  const heart = createHeartSource(bus);
  const recorder = createRecorder(engine, bus);

  outlet.innerHTML = template();
  const els = {
    root: outlet.querySelector('.live'),
    global: outlet.querySelector('[data-global]'),
    counter: outlet.querySelector('[data-counter]'),
    sectionName: outlet.querySelector('[data-section-name]'),
    next: outlet.querySelector('[data-next]'),
    progress: outlet.querySelector('[data-progress]'),
    zone: outlet.querySelector('[data-zone]'),
    hero: outlet.querySelector('[data-hero]'),
    heroVal: outlet.querySelector('[data-hero-val]'),
    heroKey: outlet.querySelector('[data-hero-key]'),
    tiles: outlet.querySelector('[data-tiles]'),
    pause: outlet.querySelector('[data-pause]'),
    quit: outlet.querySelector('[data-quit]'),
    connectRower: outlet.querySelector('[data-connect-rower]'),
    connectHr: outlet.querySelector('[data-connect-hr]'),
    demo: outlet.querySelector('[data-demo]'),
    dotRower: outlet.querySelector('[data-dot-rower]'),
    dotHr: outlet.querySelector('[data-dot-hr]'),
    recovery: outlet.querySelector('[data-recovery]'),
    recoveryHrVal: outlet.querySelector('[data-recovery-hr]'),
    recoveryGaugeFill: outlet.querySelector('[data-recovery-gauge-fill]'),
    recoveryGaugeMark: outlet.querySelector('[data-recovery-gauge-mark]'),
    recoveryGaugeLabel: outlet.querySelector('[data-recovery-gauge-label]'),
    recoveryNoHr: outlet.querySelector('[data-recovery-no-hr]'),
    recoverySkip: outlet.querySelector('[data-recovery-skip]'),
  };

  let sessionStarted = false;
  let saved = false;
  let breathTimers = [];
  let lastCountdownSec = null;   // dernière seconde de décompte bipée
  let countdownArmed = false;    // décompte en cours → bip long à la fin

  function isHrSection() {
    const s = engine.snapshot().section;
    return s && s.target.type === 'hr';
  }

  function startBreathCycle() {
    stopBreathCycle();
    setBreathPhase('inhale');
  }

  function setBreathPhase(phase) {
    els.root.dataset.recoveryPhase = phase;
    const ms = phase === 'inhale' ? 4000 : 6000;
    const next = phase === 'inhale' ? 'exhale' : 'inhale';
    const id = setTimeout(() => setBreathPhase(next), ms);
    breathTimers.push(id);
  }

  function stopBreathCycle() {
    for (const id of breathTimers) clearTimeout(id);
    breathTimers = [];
    delete els.root.dataset.recoveryPhase;
  }

  function renderRecovery() {
    const m = bus.latest;
    const s = engine.snapshot();
    const threshold = s.hrThreshold;
    const hr = m.hr;
    const hasHr = hr != null;

    els.recoveryHrVal.textContent = hasHr ? hr : '—';
    els.recoveryHrVal.dataset.state = hasHr && threshold != null && hr <= threshold ? 'below' : 'above';
    els.recoveryNoHr.hidden = hasHr;

    const gaugeMax = (threshold || 180) + 40;
    if (threshold != null) {
      const pct = Math.min(100, Math.max(0, (threshold / gaugeMax) * 100));
      els.recoveryGaugeMark.style.left = `${pct}%`;
      els.recoveryGaugeLabel.style.left = `${pct}%`;
      els.recoveryGaugeLabel.textContent = threshold;
    }
    if (hasHr) {
      const hrPct = Math.min(100, Math.max(0, (hr / gaugeMax) * 100));
      els.recoveryGaugeFill.style.width = `${hrPct}%`;
      els.recoveryGaugeFill.style.background =
        threshold != null && hr <= threshold ? 'var(--c-accent)' : 'var(--c-err)';
    } else {
      els.recoveryGaugeFill.style.width = '0%';
    }
  }

  function updateRecoveryMode() {
    if (isHrSection()) {
      els.root.dataset.recovery = '';
      startBreathCycle();
    } else {
      delete els.root.dataset.recovery;
      stopBreathCycle();
    }
  }

  function render() {
    const m = bus.latest;
    const s = engine.snapshot();

    els.global.textContent = fmtDuration(s.globalMs / 1000);
    els.counter.textContent = `${Math.min(s.index + 1, s.total)}/${s.total}`;
    els.sectionName.textContent = s.section ? s.section.name : '—';
    els.next.textContent = s.status === 'finished' ? 'terminé'
      : s.next ? `→ ${s.next.name}` : 'dernière section';
    els.progress.style.transform = `scaleX(${s.progress || 0})`;

    if (isHrSection()) {
      renderRecovery();
      return;
    }

    const cfg = LAYOUT[mode];
    if (cfg.hero === null) {
      els.hero.hidden = true;
    } else {
      els.hero.hidden = false;
      const d = METRIC[cfg.hero](m, s);
      els.heroVal.innerHTML = `${escapeHtml(d.v)}${d.u ? `<span class="hero__u"> ${d.u}</span>` : ''}`;
      els.heroKey.textContent = d.k;
    }

    els.tiles.className = `tiles tiles--${cfg.tiles.length}`;
    els.tiles.innerHTML = cfg.tiles.map((key) => tileHtml(METRIC[key](m, s))).join('');

    applyZone(m.hr, s.section);
    maybeCountdownBeep(s);

    if (longPressActive) return;

    if (s.status === 'idle') els.pause.textContent = 'Démarrer';
    else if (s.status === 'running') els.pause.textContent = 'Pause';
    else if (s.status === 'paused') els.pause.textContent = 'Reprendre';
    else els.pause.textContent = 'Terminé';
    els.pause.disabled = s.status === 'finished';
  }

  // Décompte sonore quand la section se clôt au temps : bip court à −3/−2/−1 s,
  // countdownArmed → bip long au passage de section (géré dans engine.subscribe).
  function maybeCountdownBeep(s) {
    const t = s.section && s.section.target;
    if (engine.status !== 'running' || !t || t.type !== 'duration') { lastCountdownSec = null; return; }
    const sec = Math.ceil(t.value - s.sectionMs / 1000);
    if (sec >= 1 && sec <= 3 && sec !== lastCountdownSec) {
      lastCountdownSec = sec;
      countdownArmed = true;
      beepShort();
    }
  }

  function applyZone(hr, section) {
    const zone = section?.targetHrZone || session.targetHrZone;
    if (!zone || hr == null) { els.zone.hidden = true; return; }
    const [lo, hi] = zone;
    els.zone.hidden = false;
    const st = hr < lo ? 'low' : hr > hi ? 'high' : 'in';
    els.zone.dataset.state = st;
    els.zone.textContent = st === 'in' ? `zone ${lo}–${hi} ✓` : st === 'low' ? `sous ${lo}` : `au-dessus ${hi}`;
  }

  function setMode(next) {
    mode = next;
    els.root.dataset.mode = next;
    outlet.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('is-active', b.dataset.mode === next));
    render();
  }

  async function finishAndSave() {
    if (saved) return;
    saved = true;
    sim.stop();
    recorder.stop();
    stopBreathCycle();
    releaseWakeLock();
    const snap = engine.snapshot();
    if (engine.status !== 'finished') engine.finish();
    if (!recorder.samples.length) { go(`/session/${slug}`); return; }
    const entry = buildSummary(session, recorder.samples, snap.globalMs, recorder.sectionEntryTs);
    try { await putHistory(entry); go(`/summary/${encodeURIComponent(entry.id)}`); }
    catch (e) { console.error('Sauvegarde historique échouée :', e); go(`/session/${slug}`); }
  }

  // --- Appui long sur Pause → Terminer -----------------------------------
  let longPressTimer = null;
  let longPressActive = false;
  let longPressStart = 0;

  function startLongPress() {
    if (engine.status === 'idle' || engine.status === 'finished') return;
    longPressActive = true;
    longPressStart = Date.now();
    els.pause.textContent = 'Terminer';
    els.pause.classList.add('is-finishing');
    longPressTimer = setTimeout(() => {
      longPressActive = false;
      els.pause.classList.remove('is-finishing');
      els.pause.style.removeProperty('--hold-pct');
      finishAndSave();
    }, LONG_PRESS_MS);
  }

  function cancelLongPress() {
    if (!longPressActive) return;
    clearTimeout(longPressTimer);
    longPressActive = false;
    els.pause.classList.remove('is-finishing');
    els.pause.style.removeProperty('--hold-pct');
    render();
  }

  function updateLongPressProgress() {
    if (!longPressActive) return;
    const elapsed = Date.now() - longPressStart;
    const pct = Math.min(100, (elapsed / LONG_PRESS_MS) * 100);
    els.pause.style.setProperty('--hold-pct', `${pct}%`);
    requestAnimationFrame(updateLongPressProgress);
  }

  els.pause.addEventListener('pointerdown', (e) => {
    if (e.button && e.button !== 0) return;
    if (engine.status === 'running' || engine.status === 'paused') {
      startLongPress();
      requestAnimationFrame(updateLongPressProgress);
    }
  });
  els.pause.addEventListener('pointerup', cancelLongPress);
  els.pause.addEventListener('pointerleave', cancelLongPress);
  els.pause.addEventListener('pointercancel', cancelLongPress);

  els.pause.addEventListener('click', () => {
    if (longPressActive) { cancelLongPress(); return; }
    const st = engine.status;
    if (st === 'idle') {
      initAudio();
      engine.start();
      recorder.start();
      recorder.markSectionEntry(0, engine.snapshot().globalMs);
      acquireWakeLock();
      sessionStarted = true;
      if (demo) sim.start();
    }
    else if (st === 'running') { engine.pause(); recorder.pause(); releaseWakeLock(); if (demo) sim.stop(); }
    else if (st === 'paused') { engine.resume(); recorder.resume(); acquireWakeLock(); if (demo) sim.start(); }
  });

  els.recoverySkip.addEventListener('click', () => engine.next());

  els.quit.addEventListener('click', () => {
    if (sessionStarted && engine.status !== 'finished') {
      if (!confirm('Quitter la séance ? Les données seront sauvegardées.')) return;
      finishAndSave();
    } else {
      go(`/session/${slug}`);
    }
  });

  // --- Wake Lock ---------------------------------------------------------
  let wakeLock = null;
  async function acquireWakeLock() {
    if (!('wakeLock' in navigator) || wakeLock) return;
    try { wakeLock = await navigator.wakeLock.request('screen'); }
    catch { wakeLock = null; }
  }
  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }
  function onVisibility() {
    if (document.visibilityState === 'visible' && engine.status === 'running') acquireWakeLock();
  }
  document.addEventListener('visibilitychange', onVisibility);

  // --- Sources de données ------------------------------------------------
  function setDemo(on) {
    demo = on;
    els.demo.classList.toggle('is-active', on);
    if (on) sim.start(); else sim.stop();
  }

  function bindSource(source, btn, dot, label) {
    source.onStatus((state, detail) => {
      dot.dataset.state = state;
      btn.classList.toggle('is-active', state === 'connected');
      if (state === 'connected') { btn.textContent = prettyDeviceName(detail) || label; setDemo(false); }
      else if (state === 'reconnecting') btn.textContent = `repli… (${detail})`;
      else if (state === 'failed') btn.textContent = `${label} ✕`;
      else if (state === 'disconnected') btn.textContent = label;
      btn.prepend(dot);
    });
    btn.addEventListener('click', async () => {
      if (source.connected) { source.disconnect(); btn.textContent = label; btn.prepend(dot); return; }
      try { await source.connect(); }
      catch (e) {
        if (e && e.name === 'NotFoundError') return;
        console.error(`Connexion ${label} échouée :`, e);
        dot.dataset.state = 'failed';
      }
    });
  }

  if (BLE_OK) {
    bindSource(rower, els.connectRower, els.dotRower, 'Rameur');
    bindSource(heart, els.connectHr, els.dotHr, 'FC');
    // Reconnexion auto au matériel déjà appairé (sans sélecteur). Sort du démo
    // dès qu'une source répond ; le bouton manuel reste le filet.
    rower.autoConnect().catch(() => {});
    heart.autoConnect().catch(() => {});
  } else {
    els.connectRower.disabled = true;
    els.connectHr.disabled = true;
  }
  els.demo.addEventListener('click', () => setDemo(!demo));
  if (demo) setDemo(true);

  // --- Moteur / boucle ---------------------------------------------------
  const unsubBus = bus.subscribe((m) => {
    engine.pushDistance(m.dist);
    engine.pushHr(m.hr);
    render();
  });
  const unsubEngine = engine.subscribe((type) => {
    if (type === 'section-auto' || type === 'section-change') {
      if (type === 'section-auto' && countdownArmed) beepLong(); else cue();
      countdownArmed = false;
      lastCountdownSec = null;
      const snap = engine.snapshot();
      recorder.markSectionEntry(snap.index, snap.globalMs);
      sim.setRecoveryMode(isHrSection());
      updateRecoveryMode();
    }
    if (type === 'finished') { stopBreathCycle(); finishAndSave(); return; }
    render();
  });

  outlet.querySelector('[data-prev]').addEventListener('click', () => engine.prev());
  outlet.querySelector('[data-next]').addEventListener('click', () => engine.next());
  outlet.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

  setMode(mode);

  return {
    cleanup() {
      clearTimeout(longPressTimer);
      stopBreathCycle();
      unsubBus();
      unsubEngine();
      document.removeEventListener('visibilitychange', onVisibility);
      releaseWakeLock();
      sim.stop();
      recorder.stop();
      rower.disconnect();
      heart.disconnect();
      if (engine.status !== 'finished') engine.finish();
    },
  };
}

function tileHtml(d) {
  return `<div class="tile">
    <span class="tile__key">${d.k}</span>
    <span class="tile__val">${escapeHtml(d.v)}${d.u ? `<span class="tile__u"> ${d.u}</span>` : ''}</span>
  </div>`;
}

function template() {
  return `
  <div class="live" data-mode="perf">
    <div class="live__bar">
      <button class="live__quit" data-quit aria-label="Quitter">‹</button>
      <span class="live__global" data-global>0:00</span>
      <span class="live__counter" data-counter></span>
    </div>

    <div class="live__section">
      <span class="live__section-name" data-section-name>—</span>
      <span class="live__next" data-next></span>
    </div>
    <div class="live__progress"><span class="live__progress-fill" data-progress></span></div>
    <div class="live__zone" data-zone hidden></div>

    <div class="sources">
      <button class="sources__btn" data-connect-rower><span class="sources__dot" data-dot-rower></span>Rameur</button>
      <button class="sources__btn" data-connect-hr><span class="sources__dot" data-dot-hr></span>FC</button>
      <button class="sources__btn" data-demo>Démo</button>
    </div>

    <div class="hero" data-hero>
      <span class="hero__val" data-hero-val>—</span>
      <span class="hero__key" data-hero-key></span>
    </div>
    <div class="tiles" data-tiles></div>

    <div class="recovery" data-recovery>
      <div class="recovery__hr-val" data-recovery-hr>—</div>
      <div class="recovery__hr-label">bpm</div>
      <div class="recovery__gauge">
        <div class="recovery__gauge-fill" data-recovery-gauge-fill></div>
        <div class="recovery__gauge-mark" data-recovery-gauge-mark></div>
        <div class="recovery__gauge-label" data-recovery-gauge-label></div>
      </div>
      <div class="recovery__breath">
        <div class="recovery__breath-ring"></div>
        <div class="recovery__breath-text"></div>
      </div>
      <div class="recovery__no-hr" data-recovery-no-hr hidden>Connecte ta ceinture FC pour l'auto-fin</div>
      <button class="recovery__skip" data-recovery-skip>Terminer</button>
    </div>

    <div class="controls">
      <button class="controls__btn" data-prev aria-label="Section précédente">◀</button>
      <button class="controls__btn controls__btn--main" data-pause>Démarrer</button>
      <button class="controls__btn" data-next aria-label="Section suivante">▶</button>
    </div>

    <div class="modes">
      ${MODES.map((m) => `<button class="modes__btn" data-mode="${m}">${m}</button>`).join('')}
    </div>
  </div>`;
}
