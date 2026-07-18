// Markdown → objet Session. Parsing volontairement tolérant (cf. PROJET.md §4).
//
// Session = frontmatter (métadonnées) + liste de sections.
// Chaque section a une cible de fin : durée, distance, hr, ou manuelle.

import { DISPLAY_MODE_VALUES } from './display-modes.js';
import { parseDuration, parseDistance, parseHrTarget, parseZone } from './session-format.js';

export function parseSession(md, slug = '') {
  const { data, body } = extractFrontmatter(md);
  const sections = parseSections(body);
  return {
    slug: slug || slugify(data.title || 'seance'),
    title: data.title || 'Séance sans titre',
    description: data.description || '',
    targetHrZone: parseZone(data.target_hr_zone),
    display: DISPLAY_MODE_VALUES.includes(data.display) ? data.display : 'perf',
    sections,
    raw: md,
  };
}

function extractFrontmatter(md) {
  const m = md.match(/^\s*---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: md };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (kv) data[kv[1].trim()] = kv[2].replace(/\s*#.*$/, '').trim();
  }
  return { data, body: m[2] };
}

function parseSections(body) {
  const blocks = body.split(/^##\s+/m).slice(1);
  return blocks.map((block) => {
    const [head, ...rest] = block.split(/\r?\n/);
    const props = {};
    for (const line of rest) {
      const kv = line.match(/^\s*-\s*([\w-]+)\s*:\s*(.+?)\s*$/);
      if (kv) props[kv[1].toLowerCase()] = kv[2].trim();
    }
    const duree = parseDuration(props.duree);
    const distance = parseDistance(props.distance);
    const cibleFc = parseHrTarget(props.cible_fc);
    let target;
    if (cibleFc) {
      target = { type: 'hr', ...cibleFc, cap: duree };
    } else if (duree != null) {
      target = { type: 'duration', value: duree };
    } else if (distance != null) {
      target = { type: 'distance', value: distance };
    } else {
      target = { type: 'manual', value: null };
    }
    return {
      name: head.trim(),
      duree,
      distance,
      cadence: props.cadence || null,
      display: DISPLAY_MODE_VALUES.includes(props.display) ? props.display : null,
      targetHrZone: parseZone(props.target_hr_zone),
      note: props.note || null,
      target,
    };
  });
}

export function slugify(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
