// Tuiles récap (nb séances, distance, durée, fc moy) partagées entre la home
// et l'écran historique.
//
//   interactive: true  → <button> (home, clic vers /history)
//   interactive: false → <div> (écran historique, affichage seul)
import { escapeHtml } from './format.js';
import { t } from './i18n/index.js';

export function statsTilesHtml(stats, { interactive = false } = {}) {
  const tag = interactive ? 'button' : 'div';
  const attrs = interactive ? ' data-stats-history' : '';
  return `<${tag} class="stats"${attrs}${interactive ? ' aria-label="' + escapeHtml(t('stats.sessions')) + '"' : ''}>
    ${statItem(stats.count, t('stats.sessions'))}
    ${statItem(distStatHtml(stats.distance), t('stats.distance'))}
    ${statItem(durStatHtml(stats.duration), t('stats.duration'))}
    ${statItem(stats.hrAvg ?? '—', t('stats.hrAvg'))}
  </${tag}>`;
}

function statItem(value, key) {
  return `<div class="stats__item">
    <span class="stats__val">${value}</span>
    <span class="stats__key">${key}</span>
  </div>`;
}

// Distance : valeur tronquée à 1 décimale + unité "km"/"m" en plus petit et fin.
function distStatHtml(meters) {
  if (meters == null) return escapeHtml('—');
  if (meters < 1000) return `${Math.round(meters)}<span class="unit"> m</span>`;
  const km = Math.floor(meters / 100) / 10; // troncature 1 décimale
  return `${km}<span class="unit"> km</span>`;
}

// Durée : "21min" si <1h, sinon "2h45". Unité en plus petit et fin via .unit.
function durStatHtml(totalSeconds) {
  if (totalSeconds == null) return escapeHtml('—');
  const h = Math.floor(totalSeconds / 3600);
  if (h >= 1) return `${h}<span class="unit">h</span>${Math.floor((totalSeconds % 3600) / 60)}`;
  return `${Math.floor(totalSeconds / 60)}<span class="unit">min</span>`;
}
