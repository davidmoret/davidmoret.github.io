// Routeur basé sur le hash (#/...), adossé à l'API History pour un vrai modèle
// de pile. Chaque route est un couple [pattern, handler] ; le handler peut
// renvoyer { cleanup } appelé au départ de la vue (ex. écran Live : arrêt
// moteur/simulateur).
//
// Navigation — trois primitives :
//   go(path)               empile une nouvelle page. Si la cible est DÉJÀ dans
//                          la pile (ex. re-navigation via le menu vers une
//                          section déjà ouverte), on y revient au lieu d'empiler
//                          un doublon → pas de boucle au retour.
//   go(path, {replace})    remplace la page courante (transition non « revenable » :
//                          live→résumé, sauvegarde éditeur → détail).
//   back(fallback)         vraie page précédente (history.back), repli si racine.
//
// La profondeur de chaque entrée est mémorisée dans history.state.depth, ce qui
// permet de resynchroniser la pile sur le retour/geste système (popstate).

const stack = [];

const currentPath = () => location.hash.slice(1) || '/';
const rerender = () => window.dispatchEvent(new PopStateEvent('popstate'));

export function createRouter(routes, outlet) {
  let current = null;

  async function render() {
    if (current && typeof current.cleanup === 'function') current.cleanup();
    current = null;
    const path = currentPath();
    for (const [pattern, handler] of routes) {
      const params = match(pattern, path);
      if (params) { current = (await handler(params, outlet)) || {}; return; }
    }
    outlet.innerHTML = '<main class="screen"><p class="empty">Page introuvable.</p></main>';
  }

  // Retour/avance système ou history.go() : on aligne la pile sur la profondeur
  // de l'entrée atteinte, puis on rend.
  function onPop() {
    const d = history.state && typeof history.state.depth === 'number'
      ? history.state.depth : stack.length - 1;
    stack.length = d;
    stack[d] = currentPath();
    stack.length = d + 1;
    render();
  }

  window.addEventListener('popstate', onPop);

  return {
    start() {
      const path = currentPath();
      stack.length = 0;
      stack.push(path);
      history.replaceState({ depth: 0 }, '', `#${path}`);
      render();
    },
  };
}

function match(pattern, path) {
  const pp = pattern.split('/');
  const ap = path.split('/');
  if (pp.length !== ap.length) return null;
  const params = {};
  for (let i = 0; i < pp.length; i += 1) {
    if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(ap[i]);
    else if (pp[i] !== ap[i]) return null;
  }
  return params;
}

export function go(path, { replace = false } = {}) {
  if (path === currentPath()) { if (!replace) rerender(); return; }

  // Cible déjà présente plus bas dans la pile → on y revient (dépile les
  // entrées au-dessus). Cœur de l'anti-doublon, quel que soit `replace`.
  const seen = stack.indexOf(path);
  if (seen !== -1 && seen < stack.length - 1) {
    const delta = seen - (stack.length - 1);
    stack.length = seen + 1;
    history.go(delta); // déclenche popstate → render
    return;
  }

  if (replace) {
    stack[stack.length - 1] = path;
    history.replaceState({ depth: stack.length - 1 }, '', `#${path}`);
  } else {
    stack.push(path);
    history.pushState({ depth: stack.length - 1 }, '', `#${path}`);
  }
  rerender();
}

export function back(fallback = '/') {
  if (stack.length > 1) history.back(); // popstate gère le dépilage + le rendu
  else go(fallback, { replace: true });
}
