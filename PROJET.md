# RAM — Rowing Assistant (PWA perso)

> PWA hors-ligne pour accompagner mes séances de rameur (Merach R50) avec suivi
> cardio (Polar Verity Sense). 100 % local, aucune donnée envoyée sur un serveur.

---

## 1. Objectifs & principes

- **Simple** : pas de backend, pas de compte, pas d'analytics. Tout tourne dans le navigateur du téléphone.
- **Privacy-first** : données stockées en local (IndexedDB). Sauvegarde chiffrée optionnelle en fichier `.rambak` (local) ou synchronisée sur Dropbox / Google Drive ; export séance `.txt` via le partage Android (Proton Drive, etc.).
- **Offline-first** : PWA installable, utilisable sans réseau (service worker).
- **Séances éditables** : plans de séance au format texte (frontmatter + sections), créés dans l'app ou importés depuis un fichier `.txt`.
- **Historique exploitable** : chaque séance jouée produit un résumé JSON (timeline + HRR) et alimente les stats globales.

### Décisions actées
| Sujet | Choix |
|---|---|
| Appareil pendant la séance | Smartphone **Android** (PWA installée) |
| Lecture capteurs | **Web Bluetooth** (Chrome Android) |
| Stack | **Vite + Vanilla JS + SCSS** (BEM, nesting max 3) |
| Stockage runtime | **IndexedDB** |
| Icônes | **Lucide** (SVG) |
| Sauvegarde | Export séance `.txt` (Web Share API) · backup chiffré `.rambak` (local, Dropbox, Google Drive) |

---

## 2. Architecture

```
ram/
├─ index.html · manifest.webmanifest · sw.js     # PWA shell + offline
├─ public/                  # icônes, fonts, manifest
├─ sessions/                # séances d'exemple livrées (semées au 1er lancement)
└─ src/
   ├─ main.js               # bootstrap + routeur
   ├─ data/                 # persistance & parsing
   │  ├─ session-parser.js  # texte → objet Session
   │  ├─ session-format.js  # parse/format par champ (durée, distance, FC, zone)
   │  ├─ display-modes.js   # source unique des modes d'affichage Live
   │  ├─ store.js           # IndexedDB (definitions + history + profile + meta)
   │  ├─ profile.js         # profil utilisateur (âge, FCmax, FCrepos)
   │  ├─ export.js          # séance → .txt (Web Share API)
   │  ├─ backup.js          # dump/restore chiffré (AES-256-GCM, PBKDF2)
   │  └─ cloud/             # sync Dropbox / Google Drive (last-write-wins)
   │     ├─ config.js · dropbox.js · gdrive.js · sync.js
   │     ├─ pkce.js · oauth-popup.js · tokens.js · passphrase.js · index.js
   ├─ ble/
   │  ├─ heart.js · rower.js · normalizer.js · simulator.js
   ├─ engine/
   │  ├─ session-engine.js  # machine à états (idle/running/paused/finished)
   │  └─ recorder.js        # sampling 1 Hz + HRR
   ├─ stats/                # agrégats + résumé post-séance
   ├─ ui/
   │  ├─ screen-*.js        # un fichier par écran (home, sessions, detail, live,
   │  │                     #   summary, profile, prefs, data, editor, history)
   │  ├─ router.js · app-bar.js · menu.js · notify.js · modal.js
   │  ├─ live/              # wake-lock.js, recovery.js (mode récup)
   │  ├─ i18n/              # traductions FR/EN
   │  └─ theme.js · icon.js · format.js · feedback.js
   └─ styles/               # _tokens · _base · _detail · _home · _live · _summary
```

### Séparation des responsabilités
- **`ble/`** ne connaît rien de l'UI : il émet des événements normalisés.
- **`engine/`** ne sait pas d'où viennent les données ni comment elles s'affichent → testable avec des données simulées.
- **`ui/`** consomme l'engine et le store, ne fait aucun calcul métier.

---

## 3. Format d'une séance (`.txt`)

Séance = frontmatter (métadonnées) + une liste de **sections** (échauffement, intervalles, récup…).
Chaque section a une **cible de fin** : durée, distance, FC, ou manuelle.

```markdown
---
slug: rester-motiver
title: Rester motivé
display: zen                 # perf | cad | cardio | zen — défaut: perf
---

## Échauffement
- duree: 5:00
- note: monter progressivement

## Intervalle 1
- distance: 500m
- cadence: 24-26 spm
- target_hr_zone: [130, 160]

## Retour au calme
- cible_fc: karvonen-50%     # descend sous la cible FC
- duree: 5:00                # plafond de sécurité
```

**Règles de parsing (tolérantes) :**
- Chaque `##` = une section (titre = nom affiché).
- Frontmatter reconnu : `slug`, `title`, `description`, `display`, `target_hr_zone`.
- Clés de section : `duree` (`m:ss`), `distance` (`Nm`/`Nkm`), `cadence`, `cible_fc`, `target_hr_zone`, `display`, `note`.
- `cible_fc` définit une cible `hr` (fin auto quand FC ≤ seuil pendant 3 s). Syntaxes :
  - `max-40` → dynamique (FCmax de la séance − 40)
  - `100` → fixe (100 bpm)
  - `55%` → pourcentage de FCmax (requiert profil)
  - `karvonen-50%` → pourcentage de la réserve Karvonen (requiert profil + FCrepos)
- `duree` sur une section `hr` = plafond de sécurité.
- Sans `cible_fc`, `duree` ou `distance` définit la fin ; sinon section **manuelle**.
- `target_hr_zone` (`[lo, hi]`) disponible **par section** et au niveau **séance**. La section a priorité ; fallback séance.
- **Slug** : lu depuis le frontmatter à l'import (préserve l'identité de la séance), sinon dérivé du titre.

---

## 4. Moteur de séance

États : `idle → running ⇄ paused → finished`

- **Pause / Reprise** : gèle le chrono global + chrono de section.
- **Section précédente / suivante** : rejouer ou sauter une section.
- **Fin auto de section** : quand la cible (durée/distance/hr) est atteinte → passage auto avec signal sonore (3 bips courts + 1 long).
- **Chrono à rebours** : quand la section se clôt au temps, décompte sur les dernières secondes.
- **Cible hr** : fin quand FC ≤ seuil pendant 3 s (anti-rebond), seuil figé à l'entrée de section, plafond `duree` en sécurité.
- **Profil** : optionnel pour résoudre les cibles `%` et `karvonen`.

Le **recorder** échantillonne à 1 Hz (moyenne des paquets reçus dans la seconde) :
timestamp, section, FC, cadence, puissance, distance, allure. Anti-stale : une métrique
sans mise à jour depuis 3 s est enregistrée à `null`. Mémorise l'entrée dans chaque section
pour le calcul HRR. La timeline est stockée avec le résumé.

---

## 5. Écrans

1. **Accueil** — séances favorites + dernières séances + stats globales (nb, distance, temps, FC moy). Menu ☰ → profil, séances, données, préférences.
2. **Toutes les séances** (`/sessions`) — liste complète, import `.txt`, toggle favori ★, nouvelle séance.
3. **Détail séance** (`/session/:slug`) — aperçu sections, durée/distance estimée, boutons Démarrer / Modifier / Partager / Supprimer, historique de la séance.
4. **Live** (`/live/:slug`) — l'écran séance en cours (cf. §6).
5. **Résumé** (`/summary/:id`) — totaux, FC moy/max, allure moy, **bloc HRR**, mini-graphe.
6. **Éditeur** (`/edit`, `/edit/:slug`) — formulaire de création/édition de séance (sans écrire de texte).
7. **Historique** (`/history`, `/history/:slug`) — listing complet, filtrable par séance.
8. **Profil** (`/profile`) — âge, FCmax, FCrepos.
9. **Préférences** (`/prefs`) — thème (système / clair / sombre), langue (FR / EN).
10. **Données** (`/data`) — backup chiffré (export/import `.rambak`, sync cloud).

**Contraintes UX rameur** (mains moites, effort, écran de loin) : grandes zones tactiles, gros chiffres, fort contraste, **Wake Lock** (écran allumé).

---

## 6. Écran Live

**1 métrique "héro" en géant + 3-4 tuiles secondaires** + chrono global / section. Mode
choisi par séance via `display` (défaut `perf`), changeable à la volée. Menu bas : pill
colorée pour le mode actif, icônes seules pour les autres.

| Mode | Héro | Tuiles secondaires | Couleur | Usage |
|---|---|---|---|---|
| **`perf`** *(défaut)* | Allure /500m | Cadence · FC · Distance | 🔵 bleu | Intervalles, pyramides |
| **`cardio`** | FC (+ zone) | Allure · Cadence · Distance | 🔴 rouge | Endurance, zones FC |
| **`cad`** | Cadence (spm) | Puissance · FC · Chrono section | 🟠 orange | Travail de cadence |
| **`zen`** | Chrono section | Allure · FC · Cadence | 🟢 vert | Séance libre, focus ressenti |

**Mode récupération** (automatique quand `target.type === 'hr'`) : FC en géant (rouge/vert
selon seuil), jauge FC horizontale, breath pacer (4 s inspire / 6 s expire), avertissement
si pas de ceinture FC, bouton « Terminer ». Le simulateur bascule en mode récup.

---

## 7. Stockage & synchro

**Runtime — IndexedDB** (`ram`, version 3) :
- `definitions` — séances importées (clé `slug`).
- `history` — une entrée JSON par séance jouée (clé `id`).
- `profile` — profil utilisateur (clé `'me'`).
- `meta` — clé-valeur (date de backup, thème, langue, tokens cloud, etc.).

**Export séance** : `.txt` lisible via Web Share API (partage Proton Drive, etc.).

**Backup chiffré** (`.rambak`) : dump complet d'IndexedDB (definitions + history + profile),
chiffré AES-256-GCM, clé dérivée de la passphrase via PBKDF2 (600 000 itérations).
Sorties : fichier local (File System Access API / Web Share / download) ou sync cloud.

**Sync cloud** (Dropbox, Google Drive) :
- Backup déposé sous le nom `ram-backup.rambak` dans le dossier d'app dédié
  (Dropbox « App folder », Google Drive `drive.appdata`) — invisible depuis l'UI du fournisseur.
- Auth OAuth2 **PKCE** (popup) + **refresh token** → reconnexion silencieuse durable.
  Jetons stockés chiffrés dans le store `meta`.
- Stratégie **last-write-wins** : à la connexion / au démarrage, on compare la date du
  fichier distant à la date de backup locale. Distant plus récent → download + restore ;
  local plus récent → upload.
- Sync silencieuse au démarrage de l'app (re-rend l'écran courant si un download a modifié les données).

**Format historique JSON** (par séance jouée) :

```json
{
  "id": "2026-07-06T18:30:00",
  "session_title": "Pyramide 500m",
  "duration_s": 1980,
  "distance_m": 4200,
  "hr": { "avg": 142, "max": 168 },
  "pace_avg_500m": "2:21",
  "spm_avg": 25,
  "sections": [{ "name": "Échauffement", "duration_s": 300, "distance_m": 780 }],
  "samples": [{ "t": 1, "hr": 110, "spm": 22, "w": 90, "dist": 4, "pace": 145 }],
  "hrr": { "hrStart": 168, "hrr60": 42, "hrr120": 56, "significant": true }
}
```

---

## 8. Heart Rate Recovery (HRR)

Calculé dans le résumé post-séance (`stats/summary.js`) à partir de la 1re section `hr` :

- **FC de départ** = FC à l'entrée de la section de récup (mémorisée par le recorder).
- **HRR₁ / HRR₂** = Δ FC à +60 s et +120 s après l'entrée (`hrr60`, `hrr120`).
- **Interprétation** : excellent ≥ 40, bon ≥ 25, moyen ≥ 12, faible < 12 (bpm).
- **Seuil de pertinence** : le HRR n'est interprété que si la FC à l'entrée atteint
  ≥ 70 % de la FCmax de la séance (`HRR_MIN_INTENSITY`). En dessous, la chute de FC
  n'est pas significative → bloc HRR affiché sans interprétation (`significant: false`).

---

## 9. Tests

Vitest + jsdom. Tests de caractérisation round-trip parse↔format
(`test/session-format.test.js`) et math pure de la jauge récupération
(`test/recovery.test.js`).
