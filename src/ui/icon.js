// Helper icône Lucide. Les icônes sont des IconNode importés à la demande
// (tree-shaking → seules les icônes utilisées entrent dans le bundle) :
//   import { Bell } from 'lucide';
//   el.appendChild(icon(Bell, { 'aria-hidden': 'true' }));
import { createElement } from 'lucide';

export function icon(node, attrs = {}) {
  const svg = createElement(node);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    svg.setAttribute(k, v);
  }
  return svg;
}

// Variante string pour usage dans template literals :
//   `...${iconHtml(Menu)}...`
export function iconHtml(node, attrs = {}) {
  return icon(node, attrs).outerHTML;
}
