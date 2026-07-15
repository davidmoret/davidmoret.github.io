// Source unique des modes d'affichage de l'écran Live.
// Consommée par le parser (validation du frontmatter), l'éditeur (options du
// <select>) et le Live (ordre du sélecteur de modes). Les métadonnées visuelles
// (couleur, icône, layout) restent dans screen-live.js — mais toute valeur
// listée ici DOIT y avoir un LAYOUT, sous peine de crash au rendu.
export const DISPLAY_MODES = [
  { value: 'perf', label: 'Perf' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'zen', label: 'Zen' },
  { value: 'cad', label: 'Cadence' },
];

export const DISPLAY_MODE_VALUES = DISPLAY_MODES.map((m) => m.value);
