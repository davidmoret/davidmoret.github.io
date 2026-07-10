// Machine à états d'une séance : idle → running ⇄ paused → finished.
// Le cerveau : il ne sait ni d'où viennent les données ni comment elles
// s'affichent → testable avec des données simulées (cf. PROJET.md §3, §5).
//
// Événements émis à l'abonné : 'start' | 'tick' | 'pause' | 'resume'
//   | 'section-change' (manuel) | 'section-auto' (cible atteinte) | 'finished'.

import { hrMax, karvonenBase } from '../data/profile.js';

const UI_EMIT_MS = 100;
const HR_DEBOUNCE_MS = 3000;

export function createSessionEngine(session, profile = null) {
  const sections = session.sections;
  const listeners = new Set();
  const state = {
    status: 'idle',
    index: 0,
    globalMs: 0,
    sectionMs: 0,
    sectionDist: 0,
    distAtSectionStart: null,
    lastDist: null,
    currentHr: null,
    maxHr: 0,
    hrThreshold: null,
    hrBelowSince: null,
  };
  let ticker = null;
  let lastTs = 0;
  let lastEmit = 0;

  const section = () => sections[state.index] || null;

  function snapshot() {
    const s = section();
    return {
      status: state.status,
      index: state.index,
      total: sections.length,
      section: s,
      next: sections[state.index + 1] || null,
      globalMs: state.globalMs,
      sectionMs: state.sectionMs,
      sectionDist: state.sectionDist,
      progress: sectionProgress(s),
      hrThreshold: state.hrThreshold,
    };
  }

  function sectionProgress(s) {
    if (!s) return 0;
    if (s.target.type === 'duration') return clamp01(state.sectionMs / (s.target.value * 1000));
    if (s.target.type === 'distance') return clamp01(state.sectionDist / s.target.value);
    if (s.target.type === 'hr' && s.target.cap) return clamp01(state.sectionMs / (s.target.cap * 1000));
    return 0;
  }

  function emit(type) {
    const snap = snapshot();
    for (const fn of listeners) fn(type, snap);
  }

  function tick(ts) {
    if (state.status !== 'running') return;
    const dt = lastTs ? ts - lastTs : 0;
    lastTs = ts;
    state.globalMs += dt;
    state.sectionMs += dt;
    checkSectionEnd();
    if (state.status !== 'running') return;
    if (ts - lastEmit >= UI_EMIT_MS) { lastEmit = ts; emit('tick'); }
    ticker = requestAnimationFrame(tick);
  }

  function resolveHrThreshold(s) {
    if (s.target.mode === 'dynamic') return Math.max(0, state.maxHr - s.target.delta);
    if (s.target.mode === 'fixed') return s.target.value;
    if (s.target.mode === 'pct') {
      const max = hrMax(profile);
      return max ? Math.round(max * s.target.pct / 100) : null;
    }
    if (s.target.mode === 'karvonen') {
      const base = karvonenBase(profile);
      if (!base) return null;
      return Math.round(base.hrRest + base.reserve * s.target.pct / 100);
    }
    return null;
  }

  function checkSectionEnd() {
    const s = section();
    if (!s) return;

    // Cible durée
    if (s.target.type === 'duration' && state.sectionMs >= s.target.value * 1000) {
      advance(1, true); return;
    }

    // Cible distance
    if (s.target.type === 'distance' && state.sectionDist >= s.target.value) {
      advance(1, true); return;
    }

    // Cible FC : fin si FC ≤ seuil pendant HR_DEBOUNCE_MS continues
    if (s.target.type === 'hr') {
      const threshold = state.hrThreshold;
      const hr = state.currentHr;
      // Plafond de sécurité (cap durée)
      if (s.target.cap && state.sectionMs >= s.target.cap * 1000) {
        advance(1, true); return;
      }
      if (threshold != null && hr != null) {
        if (hr <= threshold) {
          if (state.hrBelowSince == null) state.hrBelowSince = state.globalMs;
          if (state.globalMs - state.hrBelowSince >= HR_DEBOUNCE_MS) {
            advance(1, true); return;
          }
        } else {
          state.hrBelowSince = null;
        }
      }
    }
  }

  function enterSection(i) {
    state.index = i;
    state.sectionMs = 0;
    state.distAtSectionStart = state.lastDist;
    state.sectionDist = 0;
    state.hrBelowSince = null;
    const s = section();
    if (s && s.target.type === 'hr') {
      state.hrThreshold = resolveHrThreshold(s);
    } else {
      state.hrThreshold = null;
    }
  }

  function advance(dir, auto = false) {
    const target = state.index + dir;
    if (target >= sections.length) { finish(); return; }
    if (target < 0) return;
    enterSection(target);
    emit(auto ? 'section-auto' : 'section-change');
  }

  function start() {
    if (state.status !== 'idle') return;
    state.status = 'running';
    enterSection(0);
    lastTs = 0;
    lastEmit = 0;
    emit('start');
    ticker = requestAnimationFrame(tick);
  }

  function pause() {
    if (state.status !== 'running') return;
    state.status = 'paused';
    cancelAnimationFrame(ticker);
    emit('pause');
  }

  function resume() {
    if (state.status !== 'paused') return;
    state.status = 'running';
    lastTs = 0;
    lastEmit = 0;
    emit('resume');
    ticker = requestAnimationFrame(tick);
  }

  function finish() {
    if (state.status === 'finished') return;
    state.status = 'finished';
    cancelAnimationFrame(ticker);
    emit('finished');
  }

  function pushDistance(distCumul) {
    if (distCumul == null) return;
    if (state.distAtSectionStart == null) state.distAtSectionStart = distCumul;
    state.lastDist = distCumul;
    state.sectionDist = Math.max(0, distCumul - state.distAtSectionStart);
    if (state.status === 'running') checkSectionEnd();
  }

  function pushHr(hr) {
    if (hr == null) return;
    state.currentHr = hr;
    if (hr > state.maxHr) state.maxHr = hr;
    if (state.status === 'running') checkSectionEnd();
  }

  return {
    start,
    pause,
    resume,
    finish,
    next: () => advance(1, false),
    prev: () => advance(-1, false),
    pushDistance,
    pushHr,
    snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get status() { return state.status; },
  };
}

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
