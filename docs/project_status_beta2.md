# SOARA ONLINE - Etat Projet Beta 2 Stable

## Positionnement
Soara Online est un jeu strategique symbolique en ligne.

Le coeur de jeu vise un systeme:
- deterministe
- energetique
- sequentiel
- lisible
- reproductible

## Regles runtime de resolution
- Aucun de en resolution de degats/defense/esquive.
- Seul le tempo utilise un tirage.
- Parade runtime: `renvoi = min(attaque entrante, 2xATK du pareur)`.

## Systeme techniques (runtime)
- 10 slots de techniques equipes.
- Reflexe: `[ symbole symbole ]` (2 symboles, cout x2).
- Aerien: `{ symbole }` (cout x3).
- Catalogue runtime charge depuis:
  - `public/data/techniques/base.json` (100 items)
  - `public/data/techniques/advanced.json` (12 items)
  - `public/data/techniques/expert.json` (6 items)
  - `public/data/techniques/reflexes.json` (10 items)

## Combat UI (etat actuel)
- Slots vides hachures
- Selection d'une technique en attente (pending)
- Validation action + energie + log
- Log lisible par entite
- Historique joueur recentre sur les logs de combats recents

## C-01 (etat actuel)
- Introduction au monde de Soara
- Creation personnage geree a la connexion (nom/espece)
- Choix de voie de combat (implante)
- Attribution immediate: 3 techniques de base + 1 reflexe
- Synchronisation immediate vers le compte
- Progression carte verrouillee: `C-01` -> `T` -> `U` -> `N`
- Aucun duel d'essai manuel expose au joueur
- Flux campagne carte aligne sur la boite de dialogue type `dialogue` (plus de modal legacy pour l'interrogatoire)

## UI Carte (etat actuel)
- Noms des pins visibles au survol uniquement.
- Boite de dialogue basse unifiee avec 4 types:
  - `dialogue`
  - `carte`
  - `tutoriel`
  - `info`
- Type `dialogue`: joueur affiche dans le panneau gauche.
- HUD haut en mode icones compactes: boutons colles sans ecart.
- Rendu refresh stabilise: plus de flash visible de l'ancienne variante HUD.
- Outil admin `Alkane` disponible dans `Parametres`: editeur manuel des pins (X/Y, pas, reset pin/global).
- Overrides de placement pins persistants dans l'etat compte via `pinOverrides`.

## Fiche entite (etat actuel)
- Structure cible active pour l'entite joueur:
  - Identite: Nom, Age, Race, Faction
  - Statistique: PV, Energie/EnergieMax, Regeneration, `⚔`, `⛨`, `↺`
  - Reputation
  - Information: nombre de techniques apprises, slots debloques, techniques equipees
  - Equipement: main droite, main gauche, armure, accessoire
  - Inventaire: 9 slots
- Mapping symboles stats:
  - `⚔` = ATK
  - `⛨` = DEF
  - `↺` = ESQ
- Inventaire: le panneau n'affiche pas les statistiques visuelles.
- Equipement (inventaire + fiche entite): affichage `carre de slot + nom de l'equipement a cote`.
- Referentiel entites runtime (monstres/PNJ) initialise:
  - `public/data/entities/fiches_entites.json`
  - Entites de base: `DUMMY`, `Gobelin`
  - IDs: `entity_dummy_training_v1`, `entity_gobelin_base_v1`

## Synchronisation
- Source de donnees techniques: catalogue runtime
- Profil joueur: techniques apprises + slots equipes
- UI combat et fiche joueur alignees sur `playerState`
- Patch compte via API state

## Contraintes projet
- JS vanilla
- Pas de dependance additionnelle
- Priorite stabilite solo
- Multi prevu ensuite (etat de combat serialisable)

## Notes de patch (in-game)
- Bouton `Parametres` -> `Notes de patch` disponible pour tous les joueurs.
- Source de donnees: `public/data/patch_notes.json`.
- Regle de maintenance: mise a jour obligatoire de ce fichier a chaque release.

## Prochaines etapes
1. Garder une reference unique docs/moteur/donnees (`runtime_reference_beta2.md`).
2. Archiver les chemins legacy combat non utilises.
3. Etendre les profils IA PVE (per-pin/per-entity) et valider sur courbe de progression.
4. Consolider les tests de coherence catalogue/slots/campagne.
5. Preparer interfaces de sync multi sans activation runtime.
