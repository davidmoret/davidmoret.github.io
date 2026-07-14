// Notifications internes typées (cf. PROJET.md §13.3). Remplace toast()/alert().
// Deux usages :
//  - toast (défaut) : auto-dismiss, pas de bouton fermer, slide-out CSS.
//  - persistante (opts.persistent) : bouton fermer, reste jusqu'à interaction.
// opts.container monte la notif dans un hôte du flux (ex. rappel sauvegarde
// sur l'accueil) au lieu de la pile flottante ; à la fermeture la notif
// collapsé proprement (hauteur+marge → 0) pour ne pas faire sauter la page.
// opts.onClose est appelé une fois quand l'utilisateur ferme manuellement
// la notif (permet de mémoriser un rejet pour ne pas réafficher au re-render).
import { Info, CircleAlert, CircleCheck, TriangleAlert, CircleX, X } from 'lucide';
import { icon } from './icon.js';

// 5 types → icône Lucide associée (set cercle minimaliste homogène).
const ICONS = {
  neutral: Info,
  info: CircleAlert,
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleX,
};

const AUTO_DISMISS_MS = 3200;

let stackEl = null;
function stack() {
  if (!stackEl || !stackEl.isConnected) {
    stackEl = document.createElement('div');
    stackEl.className = 'notifications';
    document.body.appendChild(stackEl);
  }
  return stackEl;
}

export function notify(type, title, description, opts = {}) {
  const { persistent = false, action = null, container = null, onClose = null } = opts;
  const inline = !!container;
  const t = ICONS[type] ? type : 'neutral';

  const card = document.createElement('div');
  card.className = `notification notification--${t}`;
  card.setAttribute('role', 'status');

  const iconBox = document.createElement('span');
  iconBox.className = 'notification__icon';
  iconBox.appendChild(icon(ICONS[t], { 'aria-hidden': 'true' }));

  const body = document.createElement('div');
  body.className = 'notification__body';
  const h = document.createElement('p');
  h.className = 'notification__title';
  h.textContent = title;
  body.appendChild(h);
  if (description) {
    const d = document.createElement('p');
    d.className = 'notification__desc';
    d.textContent = description;
    body.appendChild(d);
  }
  if (action) {
    const ab = document.createElement('button');
    ab.className = 'notification__action btn btn--primary btn--sm';
    ab.type = 'button';
    ab.textContent = action.label;
    ab.addEventListener('click', () => action.onClick());
    body.appendChild(ab);
  }

  card.append(iconBox, body);

  let timer;
  const dismiss = () => {
    if (card.dataset.leaving) return;
    card.dataset.leaving = '1';
    clearTimeout(timer);

    if (inline) {
      // Collapse dans le flux : anime hauteur + marge → 0 pour libérer la
      // place proprement (un translateY laisserait l'espace occupé jusqu'au
      // retrait du DOM, d'où un saut). box-sizing border-box → height inclut
      // le padding, contenu clippé par overflow:hidden.
      card.style.overflow = 'hidden';
      const height = card.offsetHeight;
      const marginTop = parseFloat(getComputedStyle(card).marginTop) || 0;
      const anim = card.animate(
        [
          { height: `${height}px`, marginTop: `${marginTop}px`, opacity: 1 },
          { height: 0, marginTop: 0, opacity: 0 },
        ],
        { duration: 260, easing: 'ease-in', fill: 'forwards' },
      );
      anim.onfinish = () => card.remove();
    } else {
      // Toast flottant (hors flux) : slide-out CSS.
      card.addEventListener('animationend', () => card.remove(), { once: true });
      setTimeout(() => card.remove(), 400); // filet si pas d'animation
    }
  };

  if (persistent) {
    const close = document.createElement('button');
    close.className = 'notification__close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Fermer');
    close.appendChild(icon(X, { 'aria-hidden': 'true' }));
    close.addEventListener('click', () => {
      if (onClose) onClose();
      dismiss();
    });
    card.append(close);
  } else {
    timer = setTimeout(dismiss, AUTO_DISMISS_MS);
  }

  (container || stack()).appendChild(card);
  return card;
}

// Flash : notif différée au prochain rendu d'écran (après navigation async).
// Évite qu'une notif créée avant un rendu async ne parte trop tôt.
let pendingFlash = null;
export function setFlash(type, title, description) {
  pendingFlash = { type, title, description };
}
export function flushFlash() {
  const f = pendingFlash;
  pendingFlash = null;
  if (f) notify(f.type, f.title, f.description);
}
