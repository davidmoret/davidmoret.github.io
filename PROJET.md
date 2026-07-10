# RAM — Rowing Assistant (PWA perso)

> PWA hors-ligne pour accompagner mes séances de rameur (Merach R50) avec suivi
> cardio (Polar Verity Sense). 100 % local, aucune donnée envoyée sur un serveur.

---

## 1. Objectifs & principes

- **Simple** : pas de backend, pas de compte, pas d'analytics. Tout tourne dans le navigateur du téléphone.
- **Privacy-first** : données stockées en local (IndexedDB). Sauvegarde/synchro = fichiers exportés vers **Proton Drive** via le partage Android.
- **Offline-first** : PWA installable, utilisable sans réseau (service worker).
- **Séances éditables à la main** : les plans de séance sont des fichiers **Markdown** que je peux écrire/modifier au clavier.
- **Historique exploitable** : chaque séance jouée produit un résumé **JSON** + des stats globales.

### Décisions actées
| Sujet | Choix |
|---|---|
| Appareil pendant la séance | Smartphone **Android** (PWA installée) |
| Lecture capteurs | **Web Bluetooth** (Chrome Android) |
| Stack | **Vite + Vanilla JS + SCSS** (BEM, nesting max 3) |
| Stockage runtime | **IndexedDB** |
| Synchro | Export fichiers → app **Proton Drive** (Web Share API) ; import via sélecteur de fichier |

---

## 2. Risques techniques (à traiter en priorité)

| # | Risque | Impact | Mitigation |
|---|---|---|---|
| **R1** | **Merach R50** : protocole BLE inconnu (FTMS standard `0x1826` **ou** propriétaire). | 🔴 Bloquant : sans lecture, pas de métriques rameur. | **Lot 0** : spike de découverte des services BLE avant tout dev. |
| R2 | Web Bluetooth exige HTTPS + un geste utilisateur pour appairer. | 🟠 | Bouton « Connecter » explicite ; app servie en HTTPS (même en local). |
| R3 | Reconnexion BLE après perte de signal / écran verrouillé. | 🟠 | **Wake Lock API** (écran allumé) + logique de reconnexion auto. |
| R4 | Pas d'accès fichier direct sur Chrome Android (pas de File System Access API). | 🟡 | Export via **Web Share API** ; import via `<input type="file">`. |
| R5 | Polar Verity Sense — capteur standard HR. | 🟢 Faible | Service `0x180D` / caractéristique `0x2A37`, bien documenté. |

---

## 3. Architecture (modules)

```
ram/
├─ index.html
├─ manifest.webmanifest
├─ sw.js                     # service worker (offline)
├─ src/
│  ├─ main.js                # bootstrap + routeur simple
│  ├─ data/
│  │  ├─ session-parser.js   # Markdown → objet Session
│  │  ├─ store.js            # IndexedDB (définitions + historique)
│  │  └─ export.js           # export .md/.json via Web Share API, import fichier
│  ├─ ble/
│  │  ├─ heart.js            # Polar — BLE Heart Rate standard (0x180D)
│  │  ├─ rower.js            # Merach R50 — FTMS (0x1826) ou driver dédié
│  │  ├─ normalizer.js       # événements normalisés (hr, spm, power, dist, pace…)
│  │  └─ simulator.js        # source factice (mode démo / récup)
│  ├─ engine/
│  │  ├─ session-engine.js   # machine à états (idle/running/paused) + chrono + cible hr
│  │  └─ recorder.js         # échantillonnage timeline (métriques + FC)
│  ├─ stats/
│  │  └─ aggregate.js        # stats globales à partir de l'historique JSON
│  ├─ ui/
│  │  ├─ screen-home.js      # listing séances + stats globales
│  │  ├─ screen-detail.js    # aperçu d'une séance avant lancement
│  │  ├─ screen-live.js      # écran séance en cours (+ mode récup)
│  │  └─ screen-summary.js   # résumé post-séance
│  └─ styles/
│     ├─ main.scss
│     └─ _*.scss             # BEM, kebab-case
└─ sessions/                 # plans de séance en Markdown (édités à la main)
   └─ 2026-07-06-pyramide.md
```

### Séparation des responsabilités
- **`ble/`** ne connaît rien de l'UI : il émet des événements normalisés.
- **`engine/`** est le cerveau : il ne sait pas d'où viennent les données ni comment elles s'affichent → **testable avec des données simulées** (indispensable pour bosser sans être sur le rameur).
- **`ui/`** consomme l'engine et le store, ne fait aucun calcul métier.

---

## 4. Format d'une séance (Markdown)

Séance = frontmatter (métadonnées) + une liste de **sections** (échauffement, intervalles, récup…).
Chaque section a une **cible de fin** : durée, distance, hr, ou manuelle.

```markdown
---
title: Pyramide 500m
type: intervalles
description: Échauffement + pyramide + retour au calme
target_hr_zone: [130, 160]   # optionnel, zone FC cible affichée (mode cardio)
display: perf                 # perf | cardio | complet | zen — défaut: perf
---

## Échauffement            <!-- section -->
- duree: 5:00
- intensite: facile
- note: cadence libre, monter progressivement

## Intervalle 1
- distance: 500m
- cadence: 24-26 spm
- note: allure tenue

## Récup 1
- duree: 2:00
- intensite: facile

## Intervalle 2
- distance: 750m
- cadence: 24-26 spm

## Retour au calme
- cible_fc: max-40
- duree: 5min
- note: respire, 4s inspire / 6s expire
```

**Règles de parsing (simples et tolérantes) :**
- Chaque `##` = une nouvelle section (le titre = nom affiché).
- Clés reconnues : `duree` (`m:ss`), `distance` (`Nm`/`Nkm`), `cadence`, `intensite`, `note`, `cible_fc` (`max-40` ou valeur fixe).
- `cible_fc` définit une cible `hr` (fin auto quand FC ≤ seuil). `duree` devient plafond de sécurité.
- Sans `cible_fc`, `duree` **ou** `distance` définit la condition de fin ; sans les deux → section **manuelle**.

---

## 5. Moteur de séance (machine à états)

États : `idle → running ⇄ paused → finished`

Contrôles demandés :
- **Pause / Reprise** : gèle le chrono global + chrono de section.
- **Revenir en arrière** : `section précédente` (rejouer une section) et `section suivante`.
- **Fin auto de section** : quand la cible (durée/distance/hr) est atteinte → passage auto (avec petit signal sonore/vibration).
- **Cible hr** : fin quand FC ≤ seuil pendant 3 s continues (anti-rebond). Seuil figé à l'entrée dans la section. Plafond `duree` en sécurité.

Le **recorder** échantillonne (ex. 1 Hz) : timestamp, section, FC, cadence (spm), puissance (W), distance, allure (/500m). Cette timeline est stockée avec le résumé de séance → permet un graphe post-séance et les stats.

---

## 6. Écrans (UI)

1. **Accueil** — liste des séances dispo (depuis `sessions/`) + **stats globales** (nb séances, distance totale, temps total, FC moy…). Bouton « Importer une séance ».
2. **Détail séance** — aperçu des sections, durée/distance estimée, bouton **« Démarrer »** (déclenche l'appairage BLE).
3. **Live** — le cœur de l'app (voir §6.1 pour les modes d'affichage) :
   - **1 métrique “héro”** en géant + **3-4 tuiles secondaires**.
   - **Chrono** global + chrono/progression de la **section en cours**.
   - Nom de la section + **la suivante**.
   - Contrôles gros doigts : **Pause**, **◀ Précédent**, **Suivant ▶**.
   - Indicateur de **zone FC** (couleur) si `target_hr_zone` défini.
   - **Mode récup** automatique quand la section a une cible `hr` (voir §6.2).
4. **Résumé post-séance** — totaux, FC moy/max, allure moy, mini-graphe, boutons **« Exporter (.md + .json) »** → partage Proton.

**Contraintes UX rameur** (mains moites, effort, écran de loin) : grandes zones tactiles, gros chiffres, fort contraste, thème sombre par défaut, **Wake Lock** (écran ne s'éteint pas).

### 6.1 Modes d'affichage de l'écran Live

Principe : **1 métrique “héro” en géant + 3-4 tuiles secondaires**. Le mode est choisi
par séance via le champ `display` du frontmatter (défaut : `perf`), changeable à la volée
pendant la séance.

| Mode | Héro (géant) | Tuiles secondaires | Usage |
|---|---|---|---|
| **`perf`** *(défaut)* | **Allure /500m** | Cadence (spm) · FC · Distance section | Intervalles, pyramides — l'allure est la référence rameur |
| **`cardio`** | **FC** (+ zone couleur) | Allure · Cadence · Distance | Endurance, travail en zones FC |
| **`complet`** | grille 6 tuiles égales | Allure · FC · Cadence · Puissance · Distance · Chrono section | Tout voir d'un coup |
| **`zen`** | **Chrono section** | 1 seule tuile (allure) | Séance libre, focus ressenti |

**Fiabilité des métriques (priorité de confiance) :**
1. **FC** — Polar Verity Sense dédié, standard BLE → toujours fiable.
2. **Allure /500m · Cadence · Distance · Chrono** — dépendent du Merach (FTMS) → à valider Lot 0, mais standard.
3. **Puissance (W)** — dépend de la courbe de résistance du Merach → potentiellement peu fiable, à confirmer Lot 0. Reléguée en secondaire.

**Chrono toujours visible** quel que soit le mode (bandeau permanent : global + section).

### 6.2 Mode récupération (section cible `hr`)

Quand la section courante a `target.type === 'hr'`, l'écran Live bascule automatiquement :

- **Hero + tuiles + sources + modes** → masqués.
- **FC en géant** (rouge au-dessus du seuil, vert en dessous).
- **Jauge FC** horizontale : remplissage rouge→vert, repère du seuil.
- **Breath Pacer** : cercle CSS `@keyframes` (4 s inspire / 6 s expire), texte alterné via `data-recovery-phase`.
- **Avertissement** si pas de ceinture FC connectée (« Connecte ta ceinture FC pour l'auto-fin »).
- **Bouton « Terminer »** (skip manuel) toujours disponible.
- Le simulateur bascule en mode récup (`setRecoveryMode`) : FC décroît, rameur à l'arrêt.

---

## 7. Stockage & synchro

- **Runtime** : IndexedDB
  - `definitions` : séances importées (parsées depuis le .md).
  - `history` : une entrée JSON par séance jouée (résumé + timeline).
- **Export** (bouton) : génère `.json` (résumé complet) + `.md` lisible (compte-rendu) → **Web Share API** → je choisis **Proton Drive** dans le menu Android.
- **Import** : `<input type="file">` pour charger un `.md` de séance édité à la main (depuis Proton).
- **Format historique JSON** (par séance) :

```json
{
  "id": "2026-07-06T18:30:00",
  "session_title": "Pyramide 500m",
  "duration_s": 1980,
  "distance_m": 4200,
  "hr": { "avg": 142, "max": 168 },
  "pace_avg_500m": "2:21",
  "spm_avg": 25,
  "sections": [ { "name": "Échauffement", "duration_s": 300, "distance_m": 780 } ],
  "samples": [ { "t": 1, "hr": 110, "spm": 22, "w": 90, "dist": 4, "pace": 145 } ]
}
```

---

## 8. Roadmap (lots)

- **Lot 0 — Spike Bluetooth (dé-risquage)** ✅
- **Lot 1 — Squelette** ✅
- **Lot 2 — Moteur + Live (données simulées)** ✅
- **Lot 3 — Bluetooth réel** ✅
- **Lot 4 — Historique & stats** ✅
- **Lot 5 — Finitions** ✅

---

## 9. Suggestions d'amélioration (optionnel, à trancher plus tard)

- **Annonces vocales** (Web Speech / TTS) : « 250 m restants », « section suivante ».
- **Auto-lap** par section : stats détaillées par intervalle.
- **Export .FIT ou .TCX** plus tard, pour pousser vers Strava/Garmin si envie (sans compromettre la privacy : export manuel).
- **Comparaison** d'une même séance dans le temps (progression allure/FC).
- **Seuil personnalisé** : mini-profil (âge → FCmax = 220−âge, ou FCmax saisie) → débloque `55%` / Karvonen.
- **Heart Rate Recovery** dans le résumé (FC au début de la récup → temps pour repasser sous le seuil).

---

## 10. État des décisions
- ✅ Format Markdown de séance : validé (ajustable au fil de l'eau).
- ✅ Fin de section par **temps, distance ou hr** : validé.
- ✅ Écran Live : **métrique héro + secondaires**, 4 modes + mode récup auto.
- ✅ **Lot 0–5** : tous implémentés.

---

## 11. Fonctionnalité « Retour au calme » (cohérence cardiaque)

> Section de fin de séance : le rameur s'arrête, l'écran passe en mode
> récup et guide un exercice de respiration pour **faire redescendre la FC sous un
> seuil cible**. Objectif physio : expiration plus longue que l'inspiration →
> active le parasympathique → chute rapide du rythme cardiaque.

### Décisions actées (2026-07-10)
- ✅ **Nouveau type de cible de section : `hr`** (finit quand FC < seuil). S'ajoute
  à `duration` / `distance` / `manual` dans `session-engine.js` (`checkSectionEnd`).
- ✅ **Seuil = dynamique `max-40`** : FC max atteinte dans la séance − 40 bpm.
  Aucun profil utilisateur requis, s'adapte à l'intensité réelle.
  (Le parser gère aussi `cible_fc: 100` fixe — gratuit, non prioritaire.)
- ✅ **Définie dans le Markdown** : une section `##` avec `cible_fc:`, cohérent
  avec le modèle « séance = suite de sections ». Ajoutable à n'importe quelle séance.
- ✅ **`duree` sur une section `hr` = plafond de sécurité** (auto-fin au plus tôt :
  FC atteinte *ou* temps écoulé), pas la cible principale.

### Syntaxe Markdown
```markdown
## Retour au calme
- cible_fc: max-40      # descend sous (FC max de la séance − 40)
- duree: 5min           # plafond de sécurité (filet si la FC ne descend pas)
- note: respire, 4s inspire / 6s expire
```
→ `target = { type: 'hr', mode: 'dynamic', delta: 40, cap: 300 }`

### Implémentation

- **Lot A — Moteur** ✅
  - `session-parser.js` : `cible_fc:` → cible `hr` (dynamique `max-N` ou fixe).
    `duree` → `cap` quand la cible est `hr`.
  - `session-engine.js` : `pushHr()`, tracking `maxHr`/`currentHr`, cible `hr`
    dans `checkSectionEnd`, anti-rebond 3 s, seuil figé à l'entrée de section.
  - `simulator.js` : `setRecoveryMode()` — FC décroît, rameur à l'arrêt.

- **Lot B — Écran récup** ✅
  - `screen-live.js` : bascule UI via `data-recovery` sur `.live`.
  - `_live.scss` : bloc `.recovery` (FC géante, jauge, breath pacer, skip).
  - Breath pacer : `@keyframes breath` (4s/6s), phase texte via `data-recovery-phase`.
  - Mode dégradé sans ceinture FC : avertissement affiché, plafond durée + skip.

- **Lot C — Seuil personnalisé** *(optionnel, plus tard)*
- **Lot D — Heart Rate Recovery dans le résumé** *(optionnel, plus tard)*
