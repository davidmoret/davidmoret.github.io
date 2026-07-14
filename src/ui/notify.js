// Notifications internes typées (cf. PROJET.md §13.3). Remplace toast()/alert().
// Carte teintée + icône (carré blanc) + titre/desc + × ; auto-dismiss + stack.
import { Info, Bell, CheckCheck, TriangleAlert, Ban, X } from 'lucide';
import { icon } from './icon.js';

// 5 types → icône Lucide associée.
const ICONS = {
  neutral: Info,
  info: Bell,
  success: CheckCheck,
  warning: TriangleAlert,
  error: Ban,
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

export function notify(type, title, description) {
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

  const close = document.createElement('button');
  close.className = 'notification__close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Fermer');
  close.appendChild(icon(X, { 'aria-hidden': 'true' }));

  card.append(iconBox, body, close);

  let timer;
  const dismiss = () => {
    if (card.dataset.leaving) return;
    card.dataset.leaving = '1';
    clearTimeout(timer);
    card.addEventListener('animationend', () => card.remove(), { once: true });
    setTimeout(() => card.remove(), 400); // filet si pas d'animation
  };
  close.addEventListener('click', dismiss);
  timer = setTimeout(dismiss, AUTO_DISMISS_MS);

  stack().appendChild(card);
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
