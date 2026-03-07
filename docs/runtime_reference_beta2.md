# SOARA - Reference Runtime Beta 2 (Source de Verite)

Date de consolidation: 2026-03-03

## 1) Regles de resolution
- Aucun de pour attaque/defense/esquive/mitigation.
- Seul le tempo utilise un tirage.
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
- base (equilibrage par espece):
  - `Humain`: 20
  - `Gobelin`: 20
  - `Orc`: 20
  - `Loup`: 20
  - `Construct`: 20
- advanced/expert:
  - reserve aux races jouables (`Humain`, `Gobelin`, `Orc`)

## 4) Slots et etat joueur
- 10 slots techniques (`techSlotsTotal = 10` max)
- champs de sync comptes:
  - `learnedTechniques`
  - `learnedReflexes`
  - `techniquesBySlot`
  - `techSlotsTotal`
- starter racial a l'entree carte:
  - chaque race recoit `3 techniques + 1 reflexe` automatiquement
  - races supportees: `Humain`, `Gobelin`, `Orc`
- exploration carte:
  - `discoveredPins` conserve les pins deja explores
  - le brouillard masque les zones non explorees
  - les pins non reveles sont caches
  - voyager vers un pin consomme 1 vivre (objet nourriture)

## 5) Fichiers code autorite
- Moteur combat: `public/js/features/combatEngine.js`
- Sandbox resolution: `public/js/features/resolutionSandbox.js`
- Metadonnees symboles: `public/js/data/symbolsV6.js`
- Construction catalogue runtime: `public/js/data/techCatalogue.js`

## 6) Referentiel entites (base PVE/PNJ)
- Source editable: `public/data/entities/fiches_entites.json`
- Document global de reference: `docs/referentiel_entites_global.md`
- Entites initialisees: `DUMMY`, `Gobelin`, `Humain classique`, `Orc classique`, `Loup`
- IDs runtime references:
  - `entity_dummy_training_v1`
  - `entity_gobelin_base_v1`
  - `entity_humain_classique_v1`
  - `entity_orc_classique_v1`
  - `entity_loup_base_v1`
- Ce fichier sert de base de travail pour les prochaines etapes IA PVE.

## 6b) Referentiel objets
- Source equipement runtime: `public/js/data/equipmentBase.js`
- Source objets inventaire (nourriture): `public/js/data/inventoryObjects.js`
- Document global objets: `docs/referentiel_objets_global.md`
- Ce referentiel couvre les objets equipables actifs et les objets narratifs presents dans les fiches entites.

## 7) Politique docs
Si une doc contredit ce fichier, ce fichier fait foi jusqu'a mise a jour explicite.
