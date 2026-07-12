// Repères sensoriels au changement de section : vibration + court bip.
// L'AudioContext doit être créé/réveillé depuis un geste utilisateur
// (appel à initAudio() au clic « Démarrer »).
let ctx = null;

export function initAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!ctx && AC) ctx = new AC();
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function cue() {
  if (navigator.vibrate) navigator.vibrate(120);
  beep();
}

// Décompte de fin de section (cible durée) : bip court à −3/−2/−1 s.
export function beepShort() {
  beep(880, 0.15);
}

// Fin de section atteinte après un décompte : bip long + vibration franche.
export function beepLong() {
  if (navigator.vibrate) navigator.vibrate(300);
  beep(660, 0.55);
}

function beep(freq = 880, dur = 0.25) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ctx.destination);
  const t = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.start(t);
  osc.stop(t + dur + 0.01);
}
