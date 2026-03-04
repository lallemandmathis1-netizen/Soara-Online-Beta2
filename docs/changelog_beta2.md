# Changelog - Beta 2

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
- Clarification: plus de des en resolution, sauf initiative.
- Clarification: parade runtime = `min(attaque entrante, 2xATK du pareur)`.
- Clarification: reference catalogue runtime (base 100, advanced 12, expert 6, reflexes 10).
- Ajout de `docs/runtime_reference_beta2.md` comme source de verite docs/moteur/donnees.

## Notes
- Orientation runtime actuelle: solo stable.
- Multi garde en preparation structurelle, non active par defaut.
