// Écran Résumé post-séance : totaux, FC moy/max, allure moy, mini-graphes
// (FC + allure), découpe par section, HRR, bouton Supprimer.
import { getHistoryEntry, deleteHistory } from '../data/store.js';
import { fmtDuration, fmtDist, escapeHtml } from './format.js';
import { go } from './router.js';
import { confirmDialog } from './modal.js';
import { appBar } from './app-bar.js';
import { t, getLang } from './i18n/index.js';

export async function screenSummary({ id }, outlet) {
  const entry = await getHistoryEntry(id);
  if (!entry) {
    outlet.innerHTML = `<main class="screen"><p class="empty">${t('common.notFound.session')}</p></main>`;
    return;
  }
  const date = new Date(entry.id).toLocaleString(getLang(), { dateStyle: 'medium', timeStyle: 'short' });

  outlet.innerHTML = `
    ${appBar({ title: entry.session_title })}
    <main class="screen">
      <p class="lead">${escapeHtml(date)}</p>

      <section class="summary-grid">
        ${stat(fmtDuration(entry.duration_s), t('summary.duration'))}
        ${stat(fmtDist(entry.distance_m), t('summary.distance'))}
        ${stat(entry.pace_avg_500m ?? '—', t('summary.pace'))}
        ${stat(entry.spm_avg ?? '—', t('summary.spm'))}
        ${stat(entry.hr.avg ?? '—', t('summary.hrAvg'))}
        ${stat(entry.hr.max ?? '—', t('summary.hrMax'))}
      </section>

      ${hrrBlock(entry.hrr)}

      ${sparkBlock(t('summary.spark.hr'), entry.samples, 'hr', 'var(--c-err)')}
      ${sparkBlock(t('summary.spark.pace'), entry.samples, 'pace', 'var(--c-accent-2)', true)}

      <div class="section-head"><h2 class="section-head__title">${t('summary.sections')}</h2></div>
      <ul class="recap">
        ${entry.sections.map((s) => `<li class="recap__item">
          <span class="recap__name">${escapeHtml(s.name)}</span>
          <span class="recap__val">${fmtDuration(s.duration_s)} · ${fmtDist(s.distance_m)}</span>
        </li>`).join('')}
      </ul>

      <div class="summary-actions">
        <button class="btn btn--ghost btn--block" data-delete>${t('summary.delete')}</button>
      </div>
    </main>`;

  // Bouton accueil géré globalement (data-home -> go('/')).
  outlet.querySelector('[data-delete]').addEventListener('click', async () => {
    if (!await confirmDialog(t('summary.deleteConfirm'), { confirmLabel: t('common.delete'), danger: true })) return;
    await deleteHistory(entry.id);
    go('/');
  });
}

function stat(value, key) {
  return `<div class="stats__item">
    <span class="stats__val">${escapeHtml(value)}</span>
    <span class="stats__key">${key}</span>
  </div>`;
}

function hrrBlock(hrr) {
  if (!hrr) return '';
  const hrr60 = hrr.hrr60 != null ? `${hrr.hrr60} bpm` : '—';
  const hrr120 = hrr.hrr120 != null ? `${hrr.hrr120} bpm` : '—';
  const quality60 = hrrQuality(hrr.hrr60);
  const quality120 = hrrQuality(hrr.hrr120);
  return `
    <section class="hrr">
      <div class="hrr__title">${t('summary.hrr.title')}</div>
      <div class="hrr__grid">
        <div class="hrr__item">
          <span class="hrr__val">${hrr60}</span>
          <span class="hrr__key">${t('summary.hrr.1min')}${quality60 ? ` · ${quality60}` : ''}</span>
        </div>
        <div class="hrr__item">
          <span class="hrr__val">${hrr120}</span>
          <span class="hrr__key">${t('summary.hrr.2min')}${quality120 ? ` · ${quality120}` : ''}</span>
        </div>
        <div class="hrr__item">
          <span class="hrr__val">${hrr.hrStart ?? '—'} bpm</span>
          <span class="hrr__key">${t('summary.hrr.start')}</span>
        </div>
      </div>
    </section>`;
}

// Interprétation médicale simplifiée du HRR
function hrrQuality(val) {
  if (val == null) return '';
  if (val >= 40) return t('quality.excellent');
  if (val >= 25) return t('quality.good');
  if (val >= 12) return t('quality.average');
  return t('quality.poor');
}

function sparkBlock(title, samples, key, color, invert = false) {
  const path = sparkline(samples, key, invert);
  if (!path) return '';
  return `<div class="spark">
    <span class="spark__title">${title}</span>
    <svg class="spark__svg" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="${path}" fill="none" stroke="${color}" stroke-width="1.2"
        vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />
    </svg>
  </div>`;
}

function sparkline(samples, key, invert) {
  const pts = samples.map((s) => s[key]).filter((v) => v != null);
  if (pts.length < 2) return '';
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const n = pts.length;
  return pts.map((v, i) => {
    const x = (i / (n - 1)) * 100;
    let norm = (v - min) / span;
    if (invert) norm = 1 - norm;
    const y = 29 - norm * 28;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}
