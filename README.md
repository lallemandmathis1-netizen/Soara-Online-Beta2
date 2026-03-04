# Soara - version modulaire (C-01 + Tutoriel combat)

## Lancer
```powershell
npm.cmd install
npm.cmd run dev
```
Puis http://localhost:3000

## Structure
- `server/` : Express + JWT + db.json
- `public/` : client ESM + PixiJS v8 (import dynamique)
- Donnees sous `public/data/` (pins, campagne, techniques)

## Etat actuel (Beta 2 stable)
- Combat cible: deterministe, energetique, sequentiel.
- Aucun de en resolution (attaque, defense, esquive, mitigation).
- Seule l'initiative conserve un tirage.
- C-01 actif avec dialogue initial, choix narratifs, et attribution de loadout.
- Premier choix de voie de combat: 3 techniques de base + 1 reflexe.
- UI combat solo stable, slots techniques et bibliotheque synchronises.
- Fiche joueur reliee a l'etat compte (techniques apprises/equipees).

## Documentation utile
- [Reference runtime Beta 2 (source de verite)](docs/runtime_reference_beta2.md)
- [Etat projet Beta 2](docs/project_status_beta2.md)
- [Prompt Codex Beta 2](docs/codex_prompt_beta2.md)
- [Flux campagne C-01](docs/campaign_c01_flow.md)
- [Techniques officielles V6](docs/techniques_officielles_v6.md)
