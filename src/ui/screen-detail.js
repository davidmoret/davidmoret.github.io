// Écran Détail : aperçu des sections + estimation, boutons Démarrer/Modifier/Supprimer,
// et historique de cette séance en bas.
import { getDefinition, deleteDefinition, getHistory } from '../data/store.js';
import { fmtDuration, fmtDist, escapeHtml } from './format.js';
import { historyListHtml, bindHistoryList, historyForSession } from './history-list.js';
import { go } from './router.js';

export async function screenDetail({ slug }, outlet) {
  const [s, history] = await Promise.all([getDefinition(slug), getHistory()]);
  if (!s) {
    outlet.innerHTML = '<main class="screen"><p class="empty">Séance introuvable.</p></main>';
    return;
  }

  const totalDur = s.sections.reduce((a, x) => a + (x.target.type === 'duration' ? x.target.value : 0), 0);
  const totalDist = s.sections.reduce((a, x) => a + (x.target.type === 'distance' ? x.target.value : 0), 0);
  const past = historyForSession(
    [...history].sort((a, b) => b.id.localeCompare(a.id)),
    { slug, title: s.title },
  );

  outlet.innerHTML = `
    <header class="app-bar app-bar--detail">
      <button class="app-bar__back" data-back aria-label="Retour">‹</button>
      <h1 class="app-bar__title">${escapeHtml(s.title)}</h1>
      <button class="app-bar__start btn btn--primary" data-start>Démarrer</button>
    </header>
    <main class="screen">
      ${s.description ? `<p class="lead">${escapeHtml(s.description)}</p>` : ''}
      <div class="chips">
        ${totalDur ? `<span class="chip">≈ ${fmtDuration(totalDur)}</span>` : ''}
        ${totalDist ? `<span class="chip">${fmtDist(totalDist)}</span>` : ''}
        <span class="chip">mode ${escapeHtml(s.display)}</span>
        ${s.targetHrZone ? `<span class="chip">FC ${s.targetHrZone[0]}–${s.targetHrZone[1]}</span>` : ''}
      </div>
      <ol class="steps">${s.sections.map(stepHtml).join('')}</ol>
      <div class="detail-actions">
        <button class="btn btn--block" data-edit>Modifier</button>
        <button class="btn btn--ghost btn--block" data-delete>Supprimer cette séance</button>
      </div>

      ${past.length ? `
        <div class="section-head"><h2 class="section-head__title">Historique de cette séance</h2></div>
        ${historyListHtml(past.slice(0, 5))}
        ${past.length > 5 ? '<button class="btn btn--ghost btn--block" data-all-history>Voir tout l\'historique</button>' : ''}
      ` : ''}
    </main>`;

  outlet.querySelector('[data-back]').addEventListener('click', () => go('/'));
  outlet.querySelector('[data-start]').addEventListener('click', () => go(`/live/${slug}`));
  outlet.querySelector('[data-edit]').addEventListener('click', () => go(`/edit/${slug}`));
  outlet.querySelector('[data-delete]').addEventListener('click', async () => {
    if (!confirm("Supprimer cette séance ?")) return;
    await deleteDefinition(slug);
    go('/');
  });
  const allBtn = outlet.querySelector('[data-all-history]');
  if (allBtn) allBtn.addEventListener('click', () => go(`/history/${slug}`));
  bindHistoryList(outlet, () => screenDetail({ slug }, outlet));
}

function stepHtml(x) {
  const target = x.target.type === 'duration' ? fmtDuration(x.target.value)
    : x.target.type === 'distance' ? fmtDist(x.target.value)
    : x.target.type === 'hr' ? fmtHrTarget(x.target)
    : 'manuelle';
  const extra = x.cadence ? `cadence ${x.cadence}` : '';
  const zone = x.targetHrZone ? `FC ${x.targetHrZone[0]}–${x.targetHrZone[1]}` : '';
  const extras = [extra, zone].filter(Boolean).join(' · ');
  return `<li class="step">
    <div class="step__main">
      <span class="step__name">${escapeHtml(x.name)}</span>
      ${extras ? `<span class="step__extra">${escapeHtml(extras)}</span>` : ''}
      ${x.note ? `<span class="step__note">${escapeHtml(x.note)}</span>` : ''}
    </div>
    <span class="step__target">${escapeHtml(target)}</span>
  </li>`;
}

function fmtHrTarget(t) {
  if (t.mode === 'dynamic') return `FC cible max−${t.delta}${t.cap ? ` (max ${fmtDuration(t.cap)})` : ''}`;
  if (t.mode === 'fixed') return `FC cible ${t.value} bpm${t.cap ? ` (max ${fmtDuration(t.cap)})` : ''}`;
  if (t.mode === 'pct') return `FC cible ${t.pct}%${t.cap ? ` (max ${fmtDuration(t.cap)})` : ''}`;
  if (t.mode === 'karvonen') return `FC cible Karvonen ${t.pct}%${t.cap ? ` (max ${fmtDuration(t.cap)})` : ''}`;
  return 'FC cible';
}
