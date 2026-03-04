# Changelog - Beta 2

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
