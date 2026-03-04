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
- Seule l'initiative utilise un tirage.
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

## C-01 (etat actuel)
- Interrogatoire et cadrage narratif
- Choix race + faction
- Mentor
- Choix de voie de combat (implante)
- Attribution immediate: 3 techniques de base + 1 reflexe
- Synchronisation immediate vers le compte
- Progression carte verrouillee: `C-01` -> `T` -> `U` -> `N`
- Aucun duel d'essai manuel expose au joueur

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
3. Consolider les tests de coherence catalogue/slots/campagne.
4. Preparer interfaces de sync multi sans activation runtime.
