// Écran Live : métrique « héro » + tuiles secondaires, chrono global + section,
// contrôles gros doigts, indicateur de zone FC. 4 modes (cardio/perf/cad/zen)
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
import { Heart, Gauge, Activity, Leaf, LogOut, ChevronLeft, ChevronRight, Play, Pause, Check } from 'lucide';
import { icon, iconHtml } from './icon.js';
import { DISPLAY_MODES } from '../data/display-modes.js';
import { confirmDialog } from './modal.js';
import { go } from './router.js';
import { t } from './i18n/index.js';
import { createWakeLock } from './live/wake-lock.js';
import { createRecovery } from './live/recovery.js';

const BLE_OK = typeof navigator !== 'undefined' && !!navigator.bluetooth;
const isLocal = import.meta.env.DEV;
// Mode démo proposé quand aucun capteur BLE n'est possible (iOS / Safari) ou en
// dev : sans lui l'écran Live serait inutilisable sur ces plateformes.
const DEMO_AVAILABLE = isLocal || !BLE_OK;

// Ordre du sélecteur de modes = source unique (data/display-modes.js). Chaque
// valeur doit avoir une entrée LAYOUT + MODE_META ci-dessous.
const MODES = DISPLAY_MODES.map((m) => m.value);

const LAYOUT = {
  perf:    { hero: 'pace', tiles: ['spm', 'hr', 'sdist'] },
  cardio:  { hero: 'hr',   tiles: ['pace', 'spm', 'dist'] },
  zen:     { hero: 'stime', tiles: ['pace', 'hr', 'spm'] },
  cad:     { hero: 'spm',  tiles: ['power', 'hr', 'stime'] },
};


// Métadonnées visuelles des modes (§13.4) : couleur + icône Lucide + label.
const MODE_META = {
  cardio: { color: "var(--c-err)", icon: Heart, labelKey: 'mode.cardio' },
  perf:   { color: "var(--c-accent-2)", icon: Gauge, labelKey: 'mode.perf' },
  cad:    { color: "var(--c-warn)", icon: Activity, labelKey: 'mode.cad' },
  zen:    { color: "var(--c-zen)", icon: Leaf, labelKey: 'mode.zen' },
};
// Chrono de section : décompte si la section se clôt au temps (cible durée),
// sinon temps écoulé.
function sectionClock(s) {
  const tt = s.section && s.section.target;
  if (tt && tt.type === 'duration') {
    return fmtDuration(Math.max(0, tt.value - s.sectionMs / 1000));
  }
  return fmtDuration(s.sectionMs / 1000);
}

const METRIC = {
  pace:  (m) => ({ k: t('metric.pace'), v: fmtPace(m.pace) }),
  hr:    (m) => ({ k: t('metric.hr'), v: m.hr ?? '—', u: 'bpm' }),
  spm:   (m) => ({ k: t('metric.spm'), v: m.spm ?? '—', u: 'spm' }),
  power: (m) => ({ k: t('metric.power'), v: m.power ?? '—', u: 'W' }),
  dist:  (m) => ({ k: t('metric.dist'), v: m.dist != null ? fmtDist(m.dist) : '—' }),
  sdist: (m, s) => ({ k: t('metric.sectionDist'), v: fmtDist(s.sectionDist || 0) }),
  stime: (m, s) => ({ k: t('metric.sectionTime'), v: sectionClock(s) }),
};

export async function screenLive({ slug }, outlet) {
  const session = await getDefinition(slug);
  if (!session) {
    outlet.innerHTML = `<main class="screen"><p class="empty">${t('common.notFound.session')}</p></main>`;
    return {};
  }

  const profile = await getProfile();
  let mode = (session.sections[0] && session.sections[0].display) || session.display || MODES[0];
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
    counterCur: outlet.querySelector('[data-counter-cur]'),
    counterTot: outlet.querySelector('[data-counter-tot]'),
    sectionName: outlet.querySelector('[data-section-name]'),
    sectionCadence: outlet.querySelector('[data-section-cadence]'),
    sectionHr: outlet.querySelector('[data-section-hr]'),
    sectionNote: outlet.querySelector('[data-section-note]'),
    next: outlet.querySelector('[data-next-label]'),
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
  let lastCountdownSec = null;   // dernière seconde de décompte bipée
  let countdownArmed = false;    // décompte en cours → bip long à la fin

  const wakeLock = createWakeLock(() => engine.status === 'running');
  const recovery = createRecovery({ root: els.root, els, bus, engine });

  function isHrSection() {
    const s = engine.snapshot().section;
    return s && s.target.type === 'hr';
  }

  function render() {
    const m = bus.latest;
    const s = engine.snapshot();

    els.global.textContent = fmtDuration(s.globalMs / 1000);
    els.counterCur.textContent = Math.min(s.index + 1, s.total);
    els.counterTot.textContent = s.total;
    els.sectionName.textContent = s.section ? s.section.name : '—';
    if (s.section && s.section.cadence) {
      els.sectionCadence.textContent = `${t('detail.cadence')} ${s.section.cadence}`;
      els.sectionCadence.hidden = false;
    } else {
      els.sectionCadence.hidden = true;
    }
    if (s.section && s.section.targetHrZone) {
      els.sectionHr.textContent = t('detail.targetHr', { lo: s.section.targetHrZone[0], hi: s.section.targetHrZone[1] });
      els.sectionHr.hidden = false;
    } else {
      els.sectionHr.hidden = true;
    }
    if (s.section && s.section.note) {
      els.sectionNote.textContent = s.section.note;
      els.sectionNote.hidden = false;
    } else {
      els.sectionNote.hidden = true;
    }
    if (s.status === 'finished') {
      els.next.textContent = t('live.done');
    } else if (s.next) {
      els.next.textContent = t('live.next', { name: s.next.name });
    } else {
      els.next.textContent = '';
    }
    els.progress.style.transform = `scaleX(${s.progress || 0})`;

    // Toujours mettre à jour le bouton principal, quelle que soit la section.
    if (s.status === 'idle') setPauseBtn(Play, t('live.start'));
    else if (s.status === 'running') setPauseBtn(Pause, t('live.pause'));
    else if (s.status === 'paused') setPauseBtn(Play, t('live.resume'));
    else setPauseBtn(Check, t('live.finish'));
    els.pause.disabled = s.status === 'finished';

    if (isHrSection()) {
      recovery.render();
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
  }

  // Décompte sonore quand la section se clôt au temps : bip court à −3/−2/−1 s,
  // countdownArmed → bip long au passage de section (géré dans engine.subscribe).
  function maybeCountdownBeep(s) {
    const tt = s.section && s.section.target;
    if (engine.status !== 'running' || !tt || tt.type !== 'duration') { lastCountdownSec = null; return; }
    const sec = Math.ceil(tt.value - s.sectionMs / 1000);
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
    els.zone.textContent = st === 'in' ? t('live.zone.in', { lo, hi }) : st === 'low' ? t('live.zone.low', { lo }) : t('live.zone.high', { hi });
  }

  function setMode(next) {
    mode = next;
    els.root.dataset.mode = next;
    els.root.style.setProperty('--mode-c', MODE_META[next].color);
    outlet.querySelectorAll('.modes__btn').forEach((b) => {
      const active = b.dataset.mode === next;
      b.classList.toggle('is-active', active);
      b.style.setProperty('--mode-c', active ? MODE_META[b.dataset.mode].color : 'var(--c-muted)');
      b.style.color = active ? MODE_META[b.dataset.mode].color : 'var(--c-muted)';
      const host = b.querySelector('[data-mode-icon]');
      host.innerHTML = '';
      host.appendChild(icon(MODE_META[b.dataset.mode].icon, { 'aria-hidden': 'true' }));
    });
    render();
  }

  // À l'entrée d'une section, on applique son `display:` s'il est défini, sinon
  // on revient au mode global de la séance. Un changement de mode manuel tient
  // donc jusqu'à la section suivante, puis la séance reprend la main.
  function applySectionDisplay(section) {
    const target = (section && section.display) || session.display || MODES[0];
    if (target !== mode) setMode(target);
  }

  async function finishAndSave() {
    if (saved) return;
    saved = true;
    sim.stop();
    recorder.stop();
    recovery.stop();
    wakeLock.release();
    const snap = engine.snapshot();
    if (engine.status !== 'finished') engine.finish();
    if (!recorder.samples.length) { go(`/session/${slug}`); return; }
    const entry = buildSummary(session, recorder.samples, snap.globalMs, recorder.sectionEntryTs, profile);
    try { await putHistory(entry); go(`/summary/${encodeURIComponent(entry.id)}`); }
    catch (e) { console.error('Sauvegarde historique échouée :', e); go(`/session/${slug}`); }
  }

  // Bouton principal : icône seule (Play/Pause/Check) + libellé accessible.
  function setPauseBtn(node, label) {
    els.pause.innerHTML = iconHtml(node);
    els.pause.setAttribute('aria-label', label);
  }

  els.pause.addEventListener('click', () => {
    const st = engine.status;
    if (st === 'idle') {
      initAudio();
      engine.start();
      recorder.start();
      recorder.markSectionEntry(0, engine.snapshot().globalMs);
      wakeLock.acquire();
      sessionStarted = true;
      if (demo) sim.start();
    }
    else if (st === 'running') { engine.pause(); recorder.pause(); wakeLock.release(); if (demo) sim.stop(); }
    else if (st === 'paused') { engine.resume(); recorder.resume(); wakeLock.acquire(); if (demo) sim.start(); }
  });

  els.recoverySkip.addEventListener('click', () => engine.next());

  els.quit.addEventListener('click', async () => {
    if (sessionStarted && engine.status !== 'finished') {
      if (!await confirmDialog(t('live.quitConfirm'), { confirmLabel: t('live.quit') })) return;
      finishAndSave();
    } else {
      go(`/session/${slug}`);
    }
  });

  // --- Sources de données ------------------------------------------------
  function setDemo(on) {
    demo = on;
    if (els.demo) els.demo.classList.toggle('is-active', on);
    if (on) sim.start(); else sim.stop();
  }

  function bindSource(source, btn, dot, label) {
    source.onStatus((state, detail) => {
      dot.dataset.state = state;
      btn.classList.toggle('is-active', state === 'connected');
      if (state === 'connected') { btn.textContent = prettyDeviceName(detail) || label; setDemo(false); }
      else if (state === 'reconnecting') btn.textContent = t('live.reconnecting', { detail });
      else if (state === 'failed') btn.textContent = t('live.failed', { label });
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
    bindSource(rower, els.connectRower, els.dotRower, t('live.rower'));
    bindSource(heart, els.connectHr, els.dotHr, t('live.hr'));
    // Reconnexion auto au matériel déjà appairé (sans sélecteur). Sort du démo
    // dès qu'une source répond ; le bouton manuel reste le filet.
    rower.autoConnect().catch(() => {});
    heart.autoConnect().catch(() => {});
  } else {
    els.connectRower.disabled = true;
    els.connectHr.disabled = true;
  }
  if (els.demo) els.demo.addEventListener('click', () => setDemo(!demo));
  if (demo) setDemo(true);

  // --- Moteur / boucle ---------------------------------------------------
  const unsubBus = bus.subscribe((m) => {
    engine.pushDistance(m.dist);
    engine.pushHr(m.hr);
    // En course, le tick 10 Hz de l'engine pilote déjà le rendu : inutile de
    // reconstruire le DOM à chaque paquet BLE (rameur > 1 Hz). Hors course
    // (idle / pause / récup avant démarrage), aucun tick → on rend ici pour
    // refléter les métriques entrantes.
    if (engine.status !== 'running') render();
  });
  const unsubEngine = engine.subscribe((type) => {
    if (type === 'section-auto' || type === 'section-change') {
      if (type === 'section-auto' && countdownArmed) beepLong(); else cue();
      countdownArmed = false;
      lastCountdownSec = null;
      const snap = engine.snapshot();
      recorder.markSectionEntry(snap.index, snap.globalMs);
      applySectionDisplay(snap.section);
      sim.setRecoveryMode(isHrSection());
      recovery.update(isHrSection());
    }
    if (type === 'finished') { recovery.stop(); finishAndSave(); return; }
    render();
  });

  outlet.querySelector('[data-prev]').addEventListener('click', () => engine.prev());
  outlet.querySelector('[data-next]').addEventListener('click', () => engine.next());
  outlet.querySelectorAll('.modes__btn').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

  setMode(mode);

  return {
    cleanup() {
      recovery.stop();
      unsubBus();
      unsubEngine();
      wakeLock.dispose();
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
      <button class="live__quit" data-quit aria-label="${t('live.quit')}">${iconHtml(LogOut)}</button>
      <span class="live__global" data-global>0:00</span>
      <span class="live__counter" data-counter><span class="live__counter-cur" data-counter-cur></span><span class="live__counter-sep">/</span><span class="live__counter-tot" data-counter-tot></span></span>
    </div>

    <div class="live__section">
      <div class="live__section-head">
        <span class="live__section-name" data-section-name>—</span>
        <span class="live__section-cadence" data-section-cadence hidden></span>
        <span class="live__section-hr" data-section-hr hidden></span>
        <span class="live__section-note" data-section-note hidden></span>
      </div>
      <span class="live__next" data-next-label></span>
    </div>
    <div class="live__progress"><span class="live__progress-fill" data-progress></span></div>
    <div class="live__zone" data-zone hidden></div>

    <div class="sources">
      <button class="sources__btn" data-connect-rower><span class="sources__dot" data-dot-rower></span>${t('live.rower')}</button>
      <button class="sources__btn" data-connect-hr><span class="sources__dot" data-dot-hr></span>${t('live.hr')}</button>
      ${DEMO_AVAILABLE ? `<button class="sources__btn" data-demo>${t('live.demo')}</button>` : ''}
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
      <div class="recovery__no-hr" data-recovery-no-hr hidden>${t('live.recovery.connect')}</div>
      <button class="recovery__skip" data-recovery-skip>${t('live.recovery.skip')}</button>
    </div>

    <div class="controls">
      <button class="controls__btn" data-prev aria-label="${t('live.prevSection')}">${iconHtml(ChevronLeft)}</button>
      <button class="controls__btn controls__btn--main" data-pause aria-label="${t('live.start')}">${iconHtml(Play)}</button>
      <button class="controls__btn" data-next aria-label="${t('live.nextSection')}">${iconHtml(ChevronRight)}</button>
    </div>

    <div class="modes">
      ${MODES.map((m) => `<button class="modes__btn" data-mode="${m}" data-color="${MODE_META[m].color}"><span class="modes__icon" data-mode-icon="${m}"></span><span class="modes__label">${t(MODE_META[m].labelKey)}</span></button>`).join('')}
    </div>
  </div>`;
}
