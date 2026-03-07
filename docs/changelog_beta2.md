# Changelog - Beta 2

## Date
2026-03-07

## Correctif vivres (ration)
- Correction du bug de vivres perçus comme infinis.
- Le voyage consomme maintenant uniquement `food_bread_ration` (ration de pain).
- Migration inventaire: suppression des anciens vivres legacy non ration.
- Affichage inventaire conserve le format `xN Nom`.

## Equilibrage techniques/reflexes par espece
- Refonte du catalogue de techniques:
  - base: `20 techniques` par espece (Humain, Gobelin, Orc, Loup, Construct), avec raretes.
  - advanced/expert: reservees aux races jouables (`Humain`, `Gobelin`, `Orc`).
- Reequilibrage des reflexes (10 reflexes, format 2 symboles, profils especes).
- Conservation des IDs critiques de progression/starter (`base_punch`, `base_guard`, `base_wait`, `base_feint`, `base_quick`, `base_double`, `base_turtle`, `base_023`, `base_024`, `base_027`, `base_003`, `base_008`, `base_009`, `r_base_004`, `r_base_009`, `r_base_010`).

## Brouillard / exploration / voyage
- Correction du brouillard carte (masquage zones non explorees + zones revelees autour du joueur/points explores).
- Ajout d'un anneau visuel autour du joueur.
- Pins caches en zone non decouverte.
- Interaction pin: verification `etre sur le pin` avant action.
- Voyage pin->pin avec consommation de vivres (nourriture) et message `deplacement possible/impossible`.

## Carte exploration + voyage
- Spawn initial au pin `C-01` pour un nouveau compte.
- Reconnexion/refresh: conservation de la derniere position joueur (plus de teleporte systematique sur `C-01`).
- Ajout d'un cache local de secours par compte pour fiabiliser la restauration de position.
- Ajout du brouillard d'exploration avec rayon de revelation autour du joueur et des pins decouverts.
- Les pins en zone non exploree sont masques.
- Interaction pin: priorite a la condition `etre sur le pin`.
- Ajout du voyage entre pins: chaque trajet consomme 1 vivre (objet nourriture).
- Ajout de `discoveredPins` dans l'etat compte pour persister l'exploration.

## Starter racial + PVE Loup
- Ajout du starter pack racial applique a l'entree carte:
  - `Humain` -> `base_punch`, `base_guard`, `base_wait`, `r_base_009`
  - `Gobelin` -> `base_quick`, `base_feint`, `base_024`, `r_base_010`
  - `Orc` -> `base_double`, `base_turtle`, `base_027`, `r_base_004`
- Le pack est synchronise compte + UI avec marqueur `starterRacePackV1`.
- Campagne C-01: suppression du choix de discipline (loadout), passage en pack racial automatique.
- Combat PVE `U` remplace l'ennemi `Gobelin` par `Loup` (`entity_loup_base_v1`).
- Ajout de nouvelles fiches entites:
  - `entity_humain_classique_v1`
  - `entity_orc_classique_v1`
  - `entity_loup_base_v1`

## IA + outil de placement manuel des pins (Alkane)
- Ajout d'un editeur de pins dans `Parametres` reserve au compte `Alkane`.
- Edition manuelle des coordonnees `X/Y` avec pas configurable.
- Actions disponibles: appliquer, reset pin selectionne, reset global.
- Persistance des positions manuelles via `pinOverrides` dans l'etat compte.
- Le runtime carte applique les overrides uniquement pour `Alkane` (pas d'impact joueurs standards).
- IA PVE: selection de technique optimisee par scoring de profil:
  - `aggressive_short_burst`
  - `defensive_balanced`
  - fallback equilibre deterministic.

---

## Date
2026-03-07

## Entites PVE/PNJ - phase 1
- Ajout d'un referentiel modifiable des fiches entites: `public/data/entities/fiches_entites.json`.
- Ajout des deux premieres fiches:
  - `DUMMY`
  - `Gobelin`
- Ajout de la doc de schema: `docs/fiches_entites_reference.md`.
- Branchement de la source dans le chargement runtime via `dataService` (`entitySheets`).
- Branchement PVE sur les fiches entites via `enemyEntityId` (pin `U` -> Gobelin).
- IA PVE phase 1 active dans le moteur:
  - `scripted`
  - `aggressive_short_burst`

---

## Date
2026-03-07

## C-01 / Creation personnage
- Suppression de la phase `Mentor` du flux C-01.
- Reecriture du premier noeud de campagne: introduction directe au monde de Soara.
- Creation personnage obligatoire a la connexion si profil incomplet:
  - Nom
  - Espece
  - Age
- Le profil est enregistre immediatement puis le joueur entre dans la carte/campagne.

---

## Date
2026-03-07

## HUD Carte - correctifs rendu
- Correction du flash de l'ancienne UI au refresh: le HUD est affiche apres son rendu final.
- Barre HUD haute compacte: boutons icones alignes en continu sans espacement visuel (boutons colles).
- Stabilisation layout mobile: debordement horizontal controle si largeur insuffisante.

---

## Date
2026-03-07

## Equipement UI
- Inventaire d'entite: chaque emplacement d'equipement affiche un carre de slot, avec le nom de l'equipement ecrit a cote.
- Fiche entite: section Equipement alignee sur le meme format (carre + libelle a cote).

---

## Date
2026-03-07

## Symboles stats / Inventaire
- Fiche entite joueur: remplacement visuel des libelles stats offensives/defensives/esquive par symboles.
- Mapping actif:
  - ATK: `U+2694` (`⚔`)
  - DEF: `U+26E8` (`⛨`)
  - ESQ: `U+21BA` (`↺`)
- Inventaire d'entite: suppression du bloc `Statistiques visuelles` (le joueur ne voit plus ces valeurs dans ce panneau).

---

## Date
2026-03-07

## Fiche entite / Inventaire / Dialogue
- Dialogue type `dialogue`: le joueur est place dans le panneau de gauche.
- Correction du survol des pins: nom visible uniquement au hover (bug scope renderer corrige).
- Fiche entite joueur refondue en schema complet:
  - Identite (Nom, Age, Race, Faction)
  - Statistique (PV, Energie/EnergieMax, Regeneration, ATK, DEF, ESQ)
  - Reputation
  - Information (techniques apprises, slots debloques, techniques equipees)
  - Equipement
  - Inventaire (9 slots)
- Inventaire: ajout de symboles visuels pour les stats ATK/DEF/ESQ.
- Fiche personnage: correction de rendu (cards non tronquees, hauteur dynamique).

---

## Date
2026-03-07

## UI Carte / Dialogue
- Boite de dialogue carte introduite avec 4 types: `dialogue`, `carte`, `tutoriel`, `info`.
- Type `dialogue`: panneau agrandi, separe en 2 colonnes (entite gauche / entite droite).
- Texte du panneau gauche explicitement aligne a gauche.
- Noms des pins affiches uniquement au survol.

## Campagne C-01
- Le flux `Interrogatoire taverne` n'ouvre plus de modal legacy.
- Le dialogue campagne passe par la nouvelle boite de dialogue type `dialogue`.
- Fin de campagne C-01 (`complete`) rebranchee sur la progression carte: deblocage du pin `T`.
- Application du `grantLoadout` maintenue via le flux carte.

## Historique / Fiche entite
- Historique joueur limite a l'affichage des derniers combats (`[combat]`).
- Fiche entite: suppression du bouton runtime inutile dans le bloc statique.

## Nettoyage
- Retrait de code UI d'accueil non utilise.
- Simplification du renderer pins (survol local pour le nom, callbacks inutiles retires).

---

## Date
2026-03-04

## Ajouts
- Ajout d'un bouton `Notes de patch` dans `Parametres`.
- Ajout de `public/data/patch_notes.json` comme source de verite des mises a jour visibles en jeu.
- Le modal `Notes de patch` affiche l'historique des releases.

## Progression carte
- Progression verrouillee en sequence: `C-01` -> `T` -> `U` -> `N`.
- Suppression des actions de duel d'essai.
- Ecran `Accueil` avant le premier dialogue.

## Combat / Equilibrage
- Duree max d'un combat: 3 minutes.
- Monstre tutoriel ajuste a 24 PV.
- Fermeture manuelle autorisee sur U/N, bloquee en PVP.

## Equipement / Recompenses
- Aucun equipement donne au joueur au demarrage.
- Equipements attribues uniquement via progression:
  - dialogue: epee en bois
  - T: bouclier bois
  - U: gants

## Process release
- A chaque update, renseigner `public/data/patch_notes.json`.
- Conserver `docs/changelog_beta2.md` synchronise avec les points majeurs runtime/UI.

---

## Date
2026-03-03

## Ajouts
- Consolidation documentation projet Beta 2.
- Ajout d'un etat projet officiel (`project_status_beta2.md`).
- Ajout d'un prompt Codex d'audit/consolidation (`codex_prompt_beta2.md`).
- Ajout d'une presentation publique du projet (`presentation_publique.md`).

## Campagne C-01
- Ajout d'un choix de voie de combat dans le premier dialogue.
- Chaque voie attribue immediatement:
  - 3 techniques de base
  - 1 reflexe
- Synchronisation immediate du loadout vers le compte.

## Integration technique
- Branchement de l'application locale du loadout dans le flux campagne.
- Mise a jour du state joueur:
  - learnedTechniques
  - techniquesBySlot
  - techSlotsTotal
  - learnedReflexes
  - hasStarterKitV2

## Documentation unifiee (runtime)
- Clarification: plus de des en resolution, sauf Tempo.
- Clarification: parade runtime = `min(attaque entrante, 2xATK du pareur)`.
- Clarification: reference catalogue runtime (base 100, advanced 12, expert 6, reflexes 10).
- Ajout de `docs/runtime_reference_beta2.md` comme source de verite docs/moteur/donnees.

## Notes
- Orientation runtime actuelle: solo stable.
- Multi garde en preparation structurelle, non active par defaut.
