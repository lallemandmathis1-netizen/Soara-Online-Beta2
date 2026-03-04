# Prompt Codex - Beta 2 Audit & Consolidation

## Contexte
Projet: Soara Online (solo stable, multi plus tard).

Objectif: analyser, optimiser et corriger sans regression.

Contraintes:
- JS vanilla uniquement
- aucune nouvelle dependance
- ne pas casser login, carte, campagne, inventaire, UI combat
- fournir diff, liste de fichiers modifies, resume

## Regles metier a respecter
- Combat deterministe, energetique, sequentiel
- Aucun de en resolution (attaque/defense/esquive)
- Tempo uniquement via tirage
- Reflexes: `[ ]` 2 symboles, cout x2
- Aerien: `{ }` cout x3
- 10 slots techniques
- C-01: choix de voie -> 3 techniques de base + 1 reflexe

## Verite runtime actuelle (obligatoire)
- `base.json`: 100 items
- `advanced.json`: 12 items
- `expert.json`: 6 items
- `reflexes.json`: 10 items
- Source unique: `docs/runtime_reference_beta2.md`

## Taches
1. Verifier la coherence des donnees techniques
- longueurs des sequences runtime
- reflexes limites a 2 symboles
- IDs valides entre catalogue, campagne, UI combat

2. Verifier la synchronisation etat joueur
- learnedTechniques
- learnedReflexes
- techniquesBySlot
- affichage fiche joueur
- affichage combat

3. Nettoyer et optimiser
- retirer/archiver code mort non utilise
- garder un acces catalogue performant (Map id -> technique)
- reduire recalculs UI inutiles

4. Ajouter garde-fous
- IDs inconnus
- slots hors borne
- donnees null/invalides
- robustesse parsing JSON

5. Validation
- executer checks locaux possibles
- documenter:
  - anomalies trouvees
  - correctifs appliques
  - risques residuels
  - plan d'ouverture multi ulterieure (sans activer le multi)

## Format de reponse attendu
1. Findings priorises (avec fichier:ligne)
2. Patch propose
3. Impact fonctionnel
4. Tests executes / non executes
