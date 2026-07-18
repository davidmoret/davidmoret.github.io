// Éditeur de séance in-app : formulaire pour créer/modifier une séance
// sans écrire de Markdown. Produit le même objet session que le parser.

import { getDefinition, putDefinition } from '../data/store.js';
import { getProfile, karvonenBase } from '../data/profile.js';
import { slugify } from '../data/session-parser.js';
import { DISPLAY_MODES } from '../data/display-modes.js';
import { escapeHtml } from './format.js';
import { go } from './router.js';
import { appBar } from './app-bar.js';
import { t } from './i18n/index.js';

const TARGET_TYPES = [
  { value: 'duration', labelKey: 'target.duration' },
  { value: 'distance', labelKey: 'target.distance' },
  { value: 'hr', labelKey: 'target.hr' },
  { value: 'manual', labelKey: 'target.manual' },
];

const HR_MODES = [
  { value: 'dynamic', labelKey: 'hrMode.dynamic' },
  { value: 'pct', labelKey: 'hrMode.pct' },
  { value: 'karvonen', labelKey: 'hrMode.karvonen' },
];

// Karvonen par défaut si le profil le permet (FCmax + FCrepos), sinon max−N.
function defaultHrMode(profile) {
  return karvonenBase(profile) ? 'karvonen' : 'dynamic';
}

// Normalise un mode hérité : 'fixed' (option retirée) retombe sur le défaut.
function normalizeHrMode(mode, defHr) {
  return HR_MODES.some((m) => m.value === mode) ? mode : defHr;
}

export async function screenEditor({ slug }, outlet) {
  const [existing, profile] = await Promise.all([
    slug ? getDefinition(slug) : null,
    getProfile(),
  ]);
  const defHr = defaultHrMode(profile);
  const sections = existing
    ? existing.sections.map((s) => sectionToForm(s, defHr))
    : [emptySection(1, defHr)];

  render(outlet, {
    title: existing?.title || '',
    description: existing?.description || '',
    display: existing?.display || 'perf',
    hrZoneLow: existing?.targetHrZone?.[0] ?? '',
    hrZoneHigh: existing?.targetHrZone?.[1] ?? '',
    sections,
    defaultHrMode: defHr,
    slug: existing?.slug || '',
  });
}

function render(outlet, state) {
  outlet.innerHTML = `
    ${appBar({ title: state.slug ? t('editor.title.edit') : t('editor.title.new') })}
    <main class="screen">
      <form class="editor" data-form>
        <label class="profile-field">
          <span class="profile-field__label">${t('editor.field.title')}</span>
          <input class="profile-field__input" type="text" name="title" required
            value="${escapeHtml(state.title)}" placeholder="ex. Pyramide 500m">
        </label>

        <div class="editor__row">
          <label class="profile-field editor__field editor__field--25">
            <span class="profile-field__label">${t('editor.field.display')}</span>
            <select class="profile-field__input" name="display">
              ${DISPLAY_MODES.map(m => `<option value="${m.value}"${m.value === state.display ? ' selected' : ''}>${m.label}</option>`).join('')}
            </select>
          </label>
          <label class="profile-field editor__field editor__field--75">
            <span class="profile-field__label">${t('editor.field.description')}</span>
            <input class="profile-field__input" type="text" name="description"
              value="${escapeHtml(state.description)}" placeholder="${t('common.optional')}">
          </label>
        </div>

        <div class="profile-field">
          <span class="profile-field__label">${t('editor.field.hrZone')} <small>${t('editor.field.hrZoneHint')}</small></span>
          <div class="editor__range">
            <input class="profile-field__input" type="number" name="hrZoneLow" inputmode="numeric"
              value="${state.hrZoneLow}" placeholder="min">
            <span class="editor__range-sep">–</span>
            <input class="profile-field__input" type="number" name="hrZoneHigh" inputmode="numeric"
              value="${state.hrZoneHigh}" placeholder="max">
          </div>
        </div>

        <div class="section-head">
          <h2 class="section-head__title">${t('editor.sections')}</h2>
        </div>

        <div class="editor__sections" data-sections>
          ${state.sections.map((s, i) => sectionHtml(s, i)).join('')}
        </div>

        <button type="button" class="btn btn--ghost btn--block" data-add-section>${t('editor.addSection')}</button>

        <button type="submit" class="btn btn--block">${t('common.save')}</button>
      </form>
    </main>`;

  outlet.querySelector('[data-add-section]').addEventListener('click', () => {
    syncStateFromDom(outlet, state);
    state.sections.push(emptySection(state.sections.length + 1, state.defaultHrMode));
    render(outlet, state);
  });

  outlet.querySelector('[data-sections]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-section]');
    if (!btn) return;
    syncStateFromDom(outlet, state);
    state.sections.splice(Number(btn.dataset.removeSection), 1);
    render(outlet, state);
  });

  outlet.querySelector('[data-sections]').addEventListener('change', (e) => {
    const sel = e.target.closest('[data-target-type]');
    if (sel) {
      syncStateFromDom(outlet, state);
      state.sections[Number(sel.dataset.targetType)].targetType = sel.value;
      render(outlet, state);
    }
    const hr = e.target.closest('[data-hr-mode]');
    if (hr) {
      syncStateFromDom(outlet, state);
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

// Recopie les valeurs saisies dans le DOM vers `state` avant un re-render,
// sinon l'ajout/suppression de section réinitialiserait tout le formulaire.
function syncStateFromDom(outlet, state) {
  const form = outlet.querySelector('[data-form]');
  if (!form) return;
  const fd = new FormData(form);
  const g = (k) => fd.get(k) ?? '';

  state.title = g('title');
  state.description = g('description');
  state.display = g('display') || state.display;
  state.hrZoneLow = g('hrZoneLow');
  state.hrZoneHigh = g('hrZoneHigh');

  state.sections.forEach((s, i) => {
    s.name = g(`secName_${i}`);
    s.targetType = g(`secTarget_${i}`) || s.targetType;
    if (fd.has(`secHrZoneLow_${i}`)) s.hrZoneLow = g(`secHrZoneLow_${i}`);
    if (fd.has(`secHrZoneHigh_${i}`)) s.hrZoneHigh = g(`secHrZoneHigh_${i}`);
    s.cadence = g(`secCadence_${i}`);
    s.display = g(`secDisplay_${i}`);
    s.note = g(`secNote_${i}`);
    s.hrMode = g(`secHrMode_${i}`) || s.hrMode;
    // Champs conditionnels : présents dans le DOM seulement si leur mode est actif.
    if (fd.has(`secDurMin_${i}`)) s.durationMin = g(`secDurMin_${i}`);
    if (fd.has(`secDurSec_${i}`)) s.durationSec = g(`secDurSec_${i}`);
    if (fd.has(`secDist_${i}`)) s.distance = g(`secDist_${i}`);
    if (fd.has(`secDistUnit_${i}`)) s.distanceUnit = g(`secDistUnit_${i}`);
    if (fd.has(`secHrDelta_${i}`)) s.hrDelta = g(`secHrDelta_${i}`);
    if (fd.has(`secHrPct_${i}`)) s.hrPct = g(`secHrPct_${i}`);
  });
}

// ── Form state helpers ────────────────────────────────────────────────

function emptySection(n, defHr = 'dynamic') {
  return {
    name: t('editor.section.default', { n }),
    targetType: 'duration',
    durationMin: '',
    durationSec: '',
    distance: '',
    distanceUnit: 'm',
    hrMode: defHr,
    hrDelta: '40',
    hrPct: '',
    hrZoneLow: '',
    hrZoneHigh: '',
    cadence: '',
    display: '',
    note: '',
  };
}

function sectionToForm(s, defHr = 'dynamic') {
  const sec = {
    name: s.name || '',
    targetType: s.target.type,
    durationMin: '',
    durationSec: '',
    distance: '',
    distanceUnit: 'm',
    hrMode: normalizeHrMode(s.target.mode, defHr),
    hrDelta: '',
    hrPct: '',
    hrZoneLow: s.targetHrZone?.[0] ?? '',
    hrZoneHigh: s.targetHrZone?.[1] ?? '',
    cadence: s.cadence || '',
    display: s.display || '',
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
    if (sec.hrMode === 'dynamic') sec.hrDelta = String(s.target.delta || 40);
    if (sec.hrMode === 'pct' || sec.hrMode === 'karvonen') sec.hrPct = String(s.target.pct || '');
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
        value="${escapeHtml(s.name)}" placeholder="${t('editor.field.sectionName')}">
      <button type="button" class="btn btn--ghost editor__remove" data-remove-section="${idx}" aria-label="${t('common.delete')}">✕</button>
    </div>

    <div class="editor__row editor__row--pad-y">
      <label class="profile-field editor__field editor__field--25">
        <span class="profile-field__label">${t('editor.field.display')}</span>
        <select class="profile-field__input" name="secDisplay_${idx}">
          <option value="">${t('editor.field.displayInherit')}</option>
          ${DISPLAY_MODES.map(m => `<option value="${m.value}"${m.value === s.display ? ' selected' : ''}>${m.label}</option>`).join('')}
        </select>
      </label>
      <label class="profile-field editor__field editor__field--75">
        <span class="profile-field__label">${t('editor.field.note')}</span>
        <input class="profile-field__input" type="text" name="secNote_${idx}"
          value="${escapeHtml(s.note)}" placeholder="${t('common.optional')}">
      </label>
    </div>

    <div class="editor__target">
      <label class="profile-field editor__field">
        <span class="profile-field__label">${t('editor.field.target')}</span>
        <select class="profile-field__input" name="secTarget_${idx}" data-target-type="${idx}">
          ${TARGET_TYPES.map(tt => `<option value="${tt.value}"${tt.value === s.targetType ? ' selected' : ''}>${t(tt.labelKey)}</option>`).join('')}
        </select>
      </label>

      ${s.targetType === 'duration' ? durationFieldsHtml(s, idx) : ''}
      ${s.targetType === 'distance' ? distanceFieldsHtml(s, idx) : ''}
      ${s.targetType === 'hr' ? hrFieldsHtml(s, idx) : ''}
    </div>

    <label class="profile-field editor__field">
      <span class="profile-field__label">${t('editor.field.cadence')}</span>
      <input class="profile-field__input" type="text" name="secCadence_${idx}"
        value="${escapeHtml(s.cadence)}" placeholder="ex. 24-26 spm">
    </label>

    ${s.targetType === 'hr' ? '' : `<div class="profile-field">
      <span class="profile-field__label">${t('editor.field.hrZone')} <small>${t('editor.field.hrZoneOptional')}</small></span>
      <div class="editor__range">
        <input class="profile-field__input" type="number" name="secHrZoneLow_${idx}" inputmode="numeric"
          value="${escapeHtml(s.hrZoneLow)}" placeholder="min">
        <span class="editor__range-sep">–</span>
        <input class="profile-field__input" type="number" name="secHrZoneHigh_${idx}" inputmode="numeric"
          value="${escapeHtml(s.hrZoneHigh)}" placeholder="max">
      </div>
    </div>`}
  </div>`;
}

function durationFieldsHtml(s, idx) {
  return `<div class="editor__row">
    <label class="profile-field editor__field">
      <span class="profile-field__label">${t('editor.field.minutes')}</span>
      <input class="profile-field__input" type="number" name="secDurMin_${idx}" inputmode="numeric"
        value="${escapeHtml(s.durationMin)}" placeholder="0" min="0">
    </label>
    <label class="profile-field editor__field">
      <span class="profile-field__label">${t('editor.field.seconds')}</span>
      <input class="profile-field__input" type="number" name="secDurSec_${idx}" inputmode="numeric"
        value="${escapeHtml(s.durationSec)}" placeholder="0" min="0" max="59">
    </label>
  </div>`;
}

function distanceFieldsHtml(s, idx) {
  return `<div class="editor__row">
    <label class="profile-field editor__field">
      <span class="profile-field__label">${t('editor.field.distance')}</span>
      <input class="profile-field__input" type="number" name="secDist_${idx}" inputmode="numeric"
        value="${escapeHtml(s.distance)}" placeholder="500" min="0" step="any">
    </label>
    <label class="profile-field editor__field">
      <span class="profile-field__label">${t('editor.field.unit')}</span>
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
  } else {
    hrValueField = `<label class="profile-field editor__field">
      <span class="profile-field__label">%</span>
      <input class="profile-field__input" type="number" name="secHrPct_${idx}" inputmode="numeric"
        value="${escapeHtml(s.hrPct)}" placeholder="55" min="1" max="100">
    </label>`;
  }

  return `<div class="editor__row">
    <label class="profile-field editor__field">
      <span class="profile-field__label">${t('editor.field.hrMode')}</span>
      <select class="profile-field__input" name="secHrMode_${idx}" data-hr-mode="${idx}">
        ${HR_MODES.map(m => `<option value="${m.value}"${m.value === s.hrMode ? ' selected' : ''}>${t(m.labelKey)}</option>`).join('')}
      </select>
    </label>
    ${hrValueField}
  </div>
  <p class="editor__hint">${t(`hrMode.${s.hrMode || 'dynamic'}.help`)}</p>`;
}

// ── Form → Session object ─────────────────────────────────────────────

function formToSession(fd, state) {
  const title = fd.get('title')?.trim() || t('editor.untitled');
  const slug = state.slug || slugify(title);

  const hrZoneLow = fd.get('hrZoneLow');
  const hrZoneHigh = fd.get('hrZoneHigh');
  const targetHrZone = hrZoneLow && hrZoneHigh
    ? [Number(hrZoneLow), Number(hrZoneHigh)]
    : null;

  const sections = state.sections.map((_, i) => {
    const name = fd.get(`secName_${i}`)?.trim() || t('editor.section.default', { n: i + 1 });
    const targetType = fd.get(`secTarget_${i}`);
    const cadence = fd.get(`secCadence_${i}`)?.trim() || null;
    const display = fd.get(`secDisplay_${i}`) || null;
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
      let hrTarget;
      if (hrMode === 'dynamic') {
        hrTarget = { mode: 'dynamic', delta: Number(fd.get(`secHrDelta_${i}`) || 40) };
      } else if (hrMode === 'pct') {
        hrTarget = { mode: 'pct', pct: Number(fd.get(`secHrPct_${i}`) || 0) };
      } else {
        hrTarget = { mode: 'karvonen', pct: Number(fd.get(`secHrPct_${i}`) || 0) };
      }
      target = { type: 'hr', ...hrTarget };
    } else {
      target = { type: 'manual', value: null };
    }

    let duree = null;
    if (targetType === 'duration') duree = target.value;
    let distance = null;
    if (targetType === 'distance') distance = target.value;

    return { name, duree, distance, cadence, display, targetHrZone: sectionHrZone, note, target };
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
