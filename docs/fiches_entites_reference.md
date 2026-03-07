# SOARA - Reference Fiches Entites

Date: 2026-03-07  
Statut: base de travail pour monstres, PNJ et IA PVE

## Objectif
Centraliser les fiches entites dans un format modifiable facilement, pour preparer:
- creation de monstres,
- creation de PNJ,
- branchement IA PVE.

## Source de donnees
- Fichier runtime modifiable: `public/data/entities/fiches_entites.json`
- Referentiel global (index complet): `docs/referentiel_entites_global.md`

## Schema de fiche
Chaque entite suit ce bloc:
- `id`
- `role`
- `identity`:
  - `nom`
  - `espece`
  - `faction`
- `stats`:
  - `pv`, `pvMax`
  - `energie`, `energieMax`
  - `regenEnergie`
  - `atk`, `def`, `esq`
- `reputation`
- `information`:
  - `techniquesApprises`
  - `techSlotsDebloques`
  - `techniquesEquipees`
- `equipement`:
  - `mainDroite`, `mainGauche`, `armure`, `accessoire`
- `inventaire` (9 slots)
- `aiProfile`:
  - `mode`
  - `description`

## Entites initialisees (phase 1)
- `DUMMY`:
  - role: `training_dummy`
  - profil: cible d'entrainement stable.
- `Gobelin`:
  - role: `monster`
  - profil: pression courte, mobile, offensive.
- `Humain classique`:
  - role: `npc`
  - profil: rotation equilibree offense/defense/economie.
- `Orc classique`:
  - role: `npc`
  - profil: impact frontal et tenue de ligne.
- `Loup`:
  - role: `monster`
  - profil: harcelement mobile, palier tutoriel PVE.

## Index des entites referencees
- `entity_dummy_training_v1`
  - nom: `DUMMY`
  - role: `training_dummy`
  - mode IA: `scripted`
- `entity_gobelin_base_v1`
  - nom: `Gobelin`
  - role: `monster`
  - mode IA: `aggressive_short_burst`
- `entity_humain_classique_v1`
  - nom: `Humain classique`
  - role: `npc`
  - mode IA: `balanced_rotation`
- `entity_orc_classique_v1`
  - nom: `Orc classique`
  - role: `npc`
  - mode IA: `aggressive_short_burst`
- `entity_loup_base_v1`
  - nom: `Loup`
  - role: `monster`
  - mode IA: `aggressive_short_burst`

## Notes d'usage
- Les valeurs sont editables directement dans le JSON.
- Cette reference sert d'appui pour la prochaine etape: branchement IA PVE sur `aiProfile`.
- Modes IA deja utilises:
  - `scripted`: comportement simple, stable (ex: DUMMY).
  - `aggressive_short_burst`: priorise les techniques offensives courtes (ex: Gobelin).
