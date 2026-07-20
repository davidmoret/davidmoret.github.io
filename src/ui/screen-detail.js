// Écran Détail : aperçu des sections + estimation, boutons Démarrer/Modifier/Partager/Supprimer,
// et historique de cette séance en bas.
import { getDefinition, deleteDefinition, getHistory } from '../data/store.js';
import { shareSession, canShareFiles } from '../data/export.js';
import { fmtDuration, fmtDist, escapeHtml } from './format.js';
import { historyListHtml, bindHistoryList, historyForSession } from './history-list.js';
import { go } from './router.js';
import { confirmDialog } from './modal.js';
import { appBar } from './app-bar.js';
import { Pencil, Share2, Trash, History, Play } from 'lucide';
import { iconHtml } from './icon.js';
import { t } from './i18n/index.js';

export async function screenDetail({ slug }, outlet) {
  const [s, history] = await Promise.all([getDefinition(slug), getHistory()]);
  if (!s) {
    outlet.innerHTML = `<main class="screen"><p class="empty">${t('common.notFound.session')}</p></main>`;
    return;
  }

  const totalDur = s.sections.reduce((a, x) => a + (x.target.type === 'duration' ? x.target.value : 0), 0);
  const totalDist = s.sections.reduce((a, x) => a + (x.target.type === 'distance' ? x.target.value : 0), 0);
  const past = historyForSession(
    [...history].sort((a, b) => b.id.localeCompare(a.id)),
    { slug, title: s.title },
  );
  const canShare = canShareFiles();

  outlet.innerHTML = `
    ${appBar({ title: s.title, extra: `<button class="app-bar__start" data-start aria-label="${t('detail.start')}">${iconHtml(Play)}</button>` })}
    <main class="screen">
      ${s.description ? `<p class="lead">${escapeHtml(s.description)}</p>` : ''}
      <div class="chips">
        ${totalDur ? `<span class="chip">≈ ${fmtDuration(totalDur)}</span>` : ''}
        ${totalDist ? `<span class="chip">${fmtDist(totalDist)}</span>` : ''}
        <span class="chip">${escapeHtml(t('detail.mode', { mode: s.display }))}</span>
        ${s.targetHrZone ? `<span class="chip">${escapeHtml(t('detail.targetHr', { lo: s.targetHrZone[0], hi: s.targetHrZone[1] }))}</span>` : ''}
      </div>
      <ol class="steps">${s.sections.map(stepHtml).join('')}</ol>
      <div class="detail-actions">
        <div class="editor__row">
          <button class="btn btn--block" data-edit>${iconHtml(Pencil)} ${t('common.edit')}</button>
          ${canShare ? `<button class="btn btn--block" data-share>${iconHtml(Share2)} ${t('detail.share')}</button>` : ''}
        </div>
        <button class="btn btn--ghost btn--block" data-delete>${iconHtml(Trash)} ${t('detail.delete')}</button>
      </div>

      ${past.length ? `
        <div class="section-head"><h2 class="section-head__title">${iconHtml(History)} ${t('detail.history')}</h2></div>
        ${historyListHtml(past.slice(0, 5))}
        ${past.length > 5 ? `<button class="btn btn--ghost btn--block" data-all-history>${t('detail.seeAll')}</button>` : ''}
      ` : ''}
    </main>`;

  // Bouton accueil géré globalement (data-home -> go('/')).
  outlet.querySelector('[data-start]').addEventListener('click', () => go(`/live/${slug}`));
  outlet.querySelector('[data-edit]').addEventListener('click', () => go(`/edit/${slug}`));
  const shareBtn = outlet.querySelector('[data-share]');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      try { await shareSession(s); } catch (e) { console.error('Partage échoué :', e); }
    });
  }
  outlet.querySelector('[data-delete]').addEventListener('click', async () => {
    if (!await confirmDialog(t('detail.deleteConfirm'), { confirmLabel: t('common.delete'), danger: true })) return;
    await deleteDefinition(slug);
    go('/');
  });
  const allBtn = outlet.querySelector('[data-all-history]');
  if (allBtn) allBtn.addEventListener('click', () => go(`/history/${slug}`));
  bindHistoryList(outlet);
}

function stepHtml(x) {
  const target = x.target.type === 'duration' ? fmtDuration(x.target.value)
    : x.target.type === 'distance' ? fmtDist(x.target.value)
    : x.target.type === 'hr' ? fmtHrTarget(x.target)
    : t('target.manual');
  const cadence = x.cadence
    ? `<span class="step__cadence">${t('detail.cadence')} ${escapeHtml(x.cadence)}</span>`
    : '';
  const zone = x.targetHrZone
    ? `<span class="step__zone">${escapeHtml(t('detail.targetHr', { lo: x.targetHrZone[0], hi: x.targetHrZone[1] }))}</span>`
    : '';
  return `<li class="step">
    <div class="step__main">
      <span class="step__name">${escapeHtml(x.name)}</span>
      ${cadence}
      ${zone}
      ${x.note ? `<span class="step__note">${escapeHtml(x.note)}</span>` : ''}
    </div>
    <span class="step__target">${escapeHtml(target)}</span>
  </li>`;
}

function fmtHrTarget(t2) {
  if (t2.mode === 'dynamic') return `FC cible max−${t2.delta}${t2.cap ? ` (max ${fmtDuration(t2.cap)})` : ''}`;
  if (t2.mode === 'fixed') return `FC cible ${t2.value} bpm${t2.cap ? ` (max ${fmtDuration(t2.cap)})` : ''}`;
  if (t2.mode === 'pct') return `FC cible ${t2.pct}%${t2.cap ? ` (max ${fmtDuration(t2.cap)})` : ''}`;
  if (t2.mode === 'karvonen') return `FC cible Karvonen ${t2.pct}%${t2.cap ? ` (max ${fmtDuration(t2.cap)})` : ''}`;
  return 'FC cible';
}
