# SOARA - Reference Runtime Beta 2 (Source de Verite)

Date de consolidation: 2026-03-03

## 1) Regles de resolution
- Aucun de pour attaque/defense/esquive/mitigation.
- Seule l'initiative utilise un tirage.
- Les facteurs de degats/defense/esquive sont bases sur `docs/SOARA_V6_Table_Symboles.docx` via `public/js/data/symbolsV6.js`.
- Esquive binaire: `ESQ_power > energie depensee attaquant` => esquive totale.
- Parade: `renvoi = min(attaque entrante, 2xATK du pareur)`.
- `FINAL`: ignore defense, conserve armure.
- `VULN`: degats recus x2 sur le tour courant.

## 2) Grammaire de cout
- normal: `x1`
- reflexe (`[ ]`): `x2`
- aerien (`{ }`): `x3`

## 3) Catalogue runtime charge par le client
- `public/data/techniques/base.json`: 100 items
- `public/data/techniques/advanced.json`: 12 items
- `public/data/techniques/expert.json`: 6 items
- `public/data/techniques/reflexes.json`: 10 items

## 4) Slots et etat joueur
- 10 slots techniques (`techSlotsTotal = 10` max)
- champs de sync comptes:
  - `learnedTechniques`
  - `learnedReflexes`
  - `techniquesBySlot`
  - `techSlotsTotal`

## 5) Fichiers code autorite
- Moteur combat: `public/js/features/combatEngine.js`
- Sandbox resolution: `public/js/features/resolutionSandbox.js`
- Metadonnees symboles: `public/js/data/symbolsV6.js`
- Construction catalogue runtime: `public/js/data/techCatalogue.js`

## 6) Politique docs
Si une doc contredit ce fichier, ce fichier fait foi jusqu'a mise a jour explicite.
