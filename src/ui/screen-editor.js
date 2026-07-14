// Éditeur de séance in-app : formulaire pour créer/modifier une séance
// sans écrire de Markdown. Produit le même objet session que le parser.

import { getDefinition, putDefinition } from '../data/store.js';
import { parseSession, slugify } from '../data/session-parser.js';
import { escapeHtml } from './format.js';
import { go } from './router.js';

const DISPLAY_MODES = [
  { value: 'perf', label: 'Perf' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'complet', label: 'Complet' },
  { value: 'zen', label: 'Zen' },
  { value: 'cad', label: 'Cadence' },
];

const TARGET_TYPES = [
  { value: 'duration', label: 'Durée' },
  { value: 'distance', label: 'Distance' },
  { value: 'hr', label: 'FC cible' },
  { value: 'manual', label: 'Manuel' },
];

const HR_MODES = [
  { value: 'dynamic', label: 'max − N' },
  { value: 'fixed', label: 'Fixe (bpm)' },
  { value: 'pct', label: '% FCmax' },
  { value: 'karvonen', label: 'Karvonen %' },
];

export async function screenEditor({ slug }, outlet) {
  const existing = slug ? await getDefinition(slug) : null;
  const sections = existing
    ? existing.sections.map(sectionToForm)
    : [emptySection(1)];

  render(outlet, {
    title: existing?.title || '',
    type: existing?.type || '',
    description: existing?.description || '',
    display: existing?.display || 'perf',
    hrZoneLow: existing?.targetHrZone?.[0] ?? '',
    hrZoneHigh: existing?.targetHrZone?.[1] ?? '',
    sections,
    slug: existing?.slug || '',
  });
}

function render(outlet, state) {
  outlet.innerHTML = `
    <header class="app-bar app-bar--detail">
      <button class="app-bar__back" data-back aria-label="Retour">‹</button>
      <h1 class="app-bar__title">${state.slug ? 'Modifier' : 'Nouvelle'} séance</h1>
      <button class="app-bar__action" data-menu aria-label="Menu">☰</button>
    </header>
    <main class="screen">
      <form class="editor" data-form>
        <label class="profile-field">
          <span class="profile-field__label">Titre</span>
          <input class="profile-field__input" type="text" name="title" required
            value="${escapeHtml(state.title)}" placeholder="ex. Pyramide 500m">
        </label>

        <div class="editor__row">
          <label class="profile-field editor__field">
            <span class="profile-field__label">Type</span>
            <input class="profile-field__input" type="text" name="type"
              value="${escapeHtml(state.type)}" placeholder="ex. intervalles">
          </label>
          <label class="profile-field editor__field">
            <span class="profile-field__label">Affichage</span>
            <select class="profile-field__input" name="display">
              ${DISPLAY_MODES.map(m => `<option value="${m.value}"${m.value === state.display ? ' selected' : ''}>${m.label}</option>`).join('')}
            </select>
          </label>
        </div>

        <label class="profile-field">
          <span class="profile-field__label">Description</span>
          <input class="profile-field__input" type="text" name="description"
            value="${escapeHtml(state.description)}" placeholder="optionnel">
        </label>

        <div class="profile-field">
          <span class="profile-field__label">Zone FC cible <small>(fallback si pas défini par section)</small></span>
          <div class="editor__range">
            <input class="profile-field__input" type="number" name="hrZoneLow" inputmode="numeric"
              value="${state.hrZoneLow}" placeholder="min">
            <span class="editor__range-sep">–</span>
            <input class="profile-field__input" type="number" name="hrZoneHigh" inputmode="numeric"
              value="${state.hrZoneHigh}" placeholder="max">
          </div>
        </div>

        <div class="section-head">
          <h2 class="section-head__title">Sections</h2>
        </div>

        <div class="editor__sections" data-sections>
          ${state.sections.map((s, i) => sectionHtml(s, i)).join('')}
        </div>

        <button type="button" class="btn btn--ghost btn--block" data-add-section>+ Ajouter une section</button>

        <button type="submit" class="btn btn--primary btn--block">Enregistrer</button>
      </form>
    </main>`;

  outlet.querySelector('[data-back]').addEventListener('click', () =>
    state.slug ? go(`/session/${state.slug}`) : go('/sessions'));

  outlet.querySelector('[data-add-section]').addEventListener('click', () => {
    state.sections.push(emptySection(state.sections.length + 1));
    render(outlet, state);
  });

  outlet.querySelector('[data-sections]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-section]');
    if (!btn) return;
    state.sections.splice(Number(btn.dataset.removeSection), 1);
    render(outlet, state);
  });

  outlet.querySelector('[data-sections]').addEventListener('change', (e) => {
    const sel = e.target.closest('[data-target-type]');
    if (sel) {
      state.sections[Number(sel.dataset.targetType)].targetType = sel.value;
      render(outlet, state);
    }
    const hr = e.target.closest('[data-hr-mode]');
    if (hr) {
      state.sections[Number(hr.dataset.hrMode)].hrMode = hr.value;
      render(outlet, state);
    }
  });

  outlet.querySelector('[data-form]').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const session = formToSession(fd, state);
    putDefinition(session).then(() => go(`/session/${session.slug}`));
  });
}

// ── Form state helpers ────────────────────────────────────────────────

function emptySection(n) {
  return {
    name: `Section ${n}`,
    targetType: 'duration',
    durationMin: '',
    durationSec: '',
    distance: '',
    distanceUnit: 'm',
    hrMode: 'dynamic',
    hrDelta: '40',
    hrFixed: '',
    hrPct: '',
    hrZoneLow: '',
    hrZoneHigh: '',
    cadence: '',
    note: '',
  };
}

function sectionToForm(s) {
  const sec = {
    name: s.name || '',
    targetType: s.target.type,
    durationMin: '',
    durationSec: '',
    distance: '',
    distanceUnit: 'm',
    hrMode: s.target.mode || 'dynamic',
    hrDelta: '',
    hrFixed: '',
    hrPct: '',
    hrZoneLow: s.targetHrZone?.[0] ?? '',
    hrZoneHigh: s.targetHrZone?.[1] ?? '',
    cadence: s.cadence || '',
    note: s.note || '',
  };

  if (s.target.type === 'duration' && s.target.value) {
    sec.durationMin = String(Math.floor(s.target.value / 60));
    sec.durationSec = String(s.target.value % 60).padStart(2, '0');
  }
  if (s.target.type === 'distance' && s.target.value) {
    if (s.target.value >= 1000 && s.target.value % 1000 === 0) {
      sec.distance = String(s.target.value / 1000);
      sec.distanceUnit = 'km';
    } else {
      sec.distance = String(s.target.value);
      sec.distanceUnit = 'm';
    }
  }
  if (s.target.type === 'hr') {
    sec.hrMode = s.target.mode || 'dynamic';
    if (s.target.mode === 'dynamic') sec.hrDelta = String(s.target.delta || 40);
    if (s.target.mode === 'fixed') sec.hrFixed = String(s.target.value || '');
    if (s.target.mode === 'pct' || s.target.mode === 'karvonen') sec.hrPct = String(s.target.pct || '');
    if (s.target.cap) {
      sec.durationMin = String(Math.floor(s.target.cap / 60));
      sec.durationSec = String(s.target.cap % 60).padStart(2, '0');
    }
  }

  return sec;
}

// ── Section HTML ──────────────────────────────────────────────────────

function sectionHtml(s, idx) {
  return `<div class="editor__section" data-section="${idx}">
    <div class="editor__section-head">
      <input class="profile-field__input" type="text" name="secName_${idx}"
        value="${escapeHtml(s.name)}" placeholder="Nom de la section">
      <button type="button" class="btn btn--ghost editor__remove" data-remove-section="${idx}" aria-label="Supprimer">✕</button>
    </div>

    <label class="profile-field editor__field">
      <span class="profile-field__label">Cible</span>
      <select class="profile-field__input" name="secTarget_${idx}" data-target-type="${idx}">
        ${TARGET_TYPES.map(t => `<option value="${t.value}"${t.value === s.targetType ? ' selected' : ''}>${t.label}</option>`).join('')}
      </select>
    </label>

    ${s.targetType === 'duration' ? durationFieldsHtml(s, idx) : ''}
    ${s.targetType === 'distance' ? distanceFieldsHtml(s, idx) : ''}
    ${s.targetType === 'hr' ? hrFieldsHtml(s, idx) : ''}

    <div class="profile-field">
      <span class="profile-field__label">Zone FC cible <small>(optionnel)</small></span>
      <div class="editor__range">
        <input class="profile-field__input" type="number" name="secHrZoneLow_${idx}" inputmode="numeric"
          value="${escapeHtml(s.hrZoneLow)}" placeholder="min">
        <span class="editor__range-sep">–</span>
        <input class="profile-field__input" type="number" name="secHrZoneHigh_${idx}" inputmode="numeric"
          value="${escapeHtml(s.hrZoneHigh)}" placeholder="max">
      </div>
    </div>

    <div class="editor__row">
      <label class="profile-field editor__field">
        <span class="profile-field__label">Cadence</span>
        <input class="profile-field__input" type="text" name="secCadence_${idx}"
          value="${escapeHtml(s.cadence)}" placeholder="ex. 24-26 spm">
      </label>
      <label class="profile-field editor__field">
        <span class="profile-field__label">Note</span>
        <input class="profile-field__input" type="text" name="secNote_${idx}"
          value="${escapeHtml(s.note)}" placeholder="optionnel">
      </label>
    </div>
  </div>`;
}

function durationFieldsHtml(s, idx) {
  return `<div class="editor__row">
    <label class="profile-field editor__field">
      <span class="profile-field__label">Minutes</span>
      <input class="profile-field__input" type="number" name="secDurMin_${idx}" inputmode="numeric"
        value="${escapeHtml(s.durationMin)}" placeholder="0" min="0">
    </label>
    <label class="profile-field editor__field">
      <span class="profile-field__label">Secondes</span>
      <input class="profile-field__input" type="number" name="secDurSec_${idx}" inputmode="numeric"
        value="${escapeHtml(s.durationSec)}" placeholder="0" min="0" max="59">
    </label>
  </div>`;
}

function distanceFieldsHtml(s, idx) {
  return `<div class="editor__row">
    <label class="profile-field editor__field">
      <span class="profile-field__label">Distance</span>
      <input class="profile-field__input" type="number" name="secDist_${idx}" inputmode="numeric"
        value="${escapeHtml(s.distance)}" placeholder="500" min="0" step="any">
    </label>
    <label class="profile-field editor__field">
      <span class="profile-field__label">Unité</span>
      <select class="profile-field__input" name="secDistUnit_${idx}">
        <option value="m"${s.distanceUnit === 'm' ? ' selected' : ''}>m</option>
        <option value="km"${s.distanceUnit === 'km' ? ' selected' : ''}>km</option>
      </select>
    </label>
  </div>`;
}

function hrFieldsHtml(s, idx) {
  let hrValueField;
  if (s.hrMode === 'dynamic') {
    hrValueField = `<label class="profile-field editor__field">
      <span class="profile-field__label">max −</span>
      <input class="profile-field__input" type="number" name="secHrDelta_${idx}" inputmode="numeric"
        value="${escapeHtml(s.hrDelta)}" placeholder="40" min="1">
    </label>`;
  } else if (s.hrMode === 'fixed') {
    hrValueField = `<label class="profile-field editor__field">
      <span class="profile-field__label">BPM</span>
      <input class="profile-field__input" type="number" name="secHrFixed_${idx}" inputmode="numeric"
        value="${escapeHtml(s.hrFixed)}" placeholder="100" min="30">
    </label>`;
  } else {
    hrValueField = `<label class="profile-field editor__field">
      <span class="profile-field__label">%</span>
      <input class="profile-field__input" type="number" name="secHrPct_${idx}" inputmode="numeric"
        value="${escapeHtml(s.hrPct)}" placeholder="55" min="1" max="100">
    </label>`;
  }

  return `<div class="editor__row">
    <label class="profile-field editor__field">
      <span class="profile-field__label">Mode FC</span>
      <select class="profile-field__input" name="secHrMode_${idx}" data-hr-mode="${idx}">
        ${HR_MODES.map(m => `<option value="${m.value}"${m.value === s.hrMode ? ' selected' : ''}>${m.label}</option>`).join('')}
      </select>
    </label>
    ${hrValueField}
  </div>
  <div class="editor__row">
    <label class="profile-field editor__field">
      <span class="profile-field__label">Plafond min</span>
      <input class="profile-field__input" type="number" name="secDurMin_${idx}" inputmode="numeric"
        value="${escapeHtml(s.durationMin)}" placeholder="optionnel" min="0">
    </label>
    <label class="profile-field editor__field">
      <span class="profile-field__label">Plafond sec</span>
      <input class="profile-field__input" type="number" name="secDurSec_${idx}" inputmode="numeric"
        value="${escapeHtml(s.durationSec)}" placeholder="0" min="0" max="59">
    </label>
  </div>`;
}

// ── Form → Session object ─────────────────────────────────────────────

function formToSession(fd, state) {
  const title = fd.get('title')?.trim() || 'Séance sans titre';
  const slug = state.slug || slugify(title);

  const hrZoneLow = fd.get('hrZoneLow');
  const hrZoneHigh = fd.get('hrZoneHigh');
  const targetHrZone = hrZoneLow && hrZoneHigh
    ? [Number(hrZoneLow), Number(hrZoneHigh)]
    : null;

  const sections = state.sections.map((_, i) => {
    const name = fd.get(`secName_${i}`)?.trim() || `Section ${i + 1}`;
    const targetType = fd.get(`secTarget_${i}`);
    const cadence = fd.get(`secCadence_${i}`)?.trim() || null;
    const note = fd.get(`secNote_${i}`)?.trim() || null;

    const secHrZoneLow = fd.get(`secHrZoneLow_${i}`);
    const secHrZoneHigh = fd.get(`secHrZoneHigh_${i}`);
    const sectionHrZone = secHrZoneLow && secHrZoneHigh
      ? [Number(secHrZoneLow), Number(secHrZoneHigh)]
      : null;

    let target;
    if (targetType === 'duration') {
      const durMin = Number(fd.get(`secDurMin_${i}`) || 0);
      const durSec = Number(fd.get(`secDurSec_${i}`) || 0);
      const value = durMin * 60 + durSec;
      target = value > 0 ? { type: 'duration', value } : { type: 'manual', value: null };
    } else if (targetType === 'distance') {
      const dist = Number(fd.get(`secDist_${i}`) || 0);
      const unit = fd.get(`secDistUnit_${i}`);
      const value = unit === 'km' ? Math.round(dist * 1000) : Math.round(dist);
      target = value > 0 ? { type: 'distance', value } : { type: 'manual', value: null };
    } else if (targetType === 'hr') {
      const hrMode = fd.get(`secHrMode_${i}`);
      const capMin = Number(fd.get(`secDurMin_${i}`) || 0);
      const capSec = Number(fd.get(`secDurSec_${i}`) || 0);
      const cap = capMin * 60 + capSec || null;
      let hrTarget;
      if (hrMode === 'dynamic') {
        hrTarget = { mode: 'dynamic', delta: Number(fd.get(`secHrDelta_${i}`) || 40) };
      } else if (hrMode === 'fixed') {
        hrTarget = { mode: 'fixed', value: Number(fd.get(`secHrFixed_${i}`) || 0) };
      } else if (hrMode === 'pct') {
        hrTarget = { mode: 'pct', pct: Number(fd.get(`secHrPct_${i}`) || 0) };
      } else {
        hrTarget = { mode: 'karvonen', pct: Number(fd.get(`secHrPct_${i}`) || 0) };
      }
      target = { type: 'hr', ...hrTarget, cap };
    } else {
      target = { type: 'manual', value: null };
    }

    let duree = null;
    if (targetType === 'duration') duree = target.value;
    if (targetType === 'hr' && target.cap) duree = target.cap;
    let distance = null;
    if (targetType === 'distance') distance = target.value;

    return { name, duree, distance, cadence, targetHrZone: sectionHrZone, note, target };
  });

  const display = fd.get('display') || 'perf';

  return {
    slug,
    title,
    type: fd.get('type')?.trim() || '',
    description: fd.get('description')?.trim() || '',
    targetHrZone,
    display,
    sections,
  };
}
