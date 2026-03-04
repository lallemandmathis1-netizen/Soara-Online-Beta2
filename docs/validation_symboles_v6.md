# Validation symboles SOARA V6

Source de reference: `docs/SOARA_V6_Table_Symboles.docx`.

## Corrections appliquees dans le code

- `BULWARK` aligne a `cost: 3`, `defDice: 3`.
- Alias `()` aligne sur `BULWARK` (`cost: 3`, `defDice: 3`).
- `ROLL` aligne a `cost: 3`, `esqDice: 2`.
- `FEINT` aligne a `cost: 2`, `esqDice: 2`.
- `?` (Observation) aligne a `cost: 0`.
- `^` (Saut) aligne a `cost: 2`.
- Meta runtime ajoutee pour `AURA` et `ITEM` dans `SYMBOLS_V6`.
- `FINAL` ignore la defense (armure conservee).
- `PARRY` renvoie `min(attaque entrante, 2xATK du pareur)`.

## Regle de resolution globale

- Aucun de en resolution de degats/defense/esquive.
- Seul le tempo conserve un tirage.

## Fichiers de reference

- `docs/SOARA_V6_Table_Symboles.docx`
- `public/js/data/symbolsV6.js`
- `public/js/features/combatEngine.js`
- `public/js/features/resolutionSandbox.js`

## Validation resolution

Batterie de checks executee sur le sandbox de resolution:
- 17 checks
- 17 passes
- 0 echec

Cas verifies:
- puissances de base `X`, `<>`, `GUARD`, `BULWARK`, `ROLL`, `FEINT`, `^`
- couts `BULWARK`, `ROLL`, `FEINT`, `?`, `^`
- regle `FINAL` (ignore DEF)
- regle `PARRY` (cap `2xATK`)

## Coherence moteur

Le moteur et le sandbox lisent les facteurs depuis `SYMBOLS_V6` (plus de fallback metier dur pour les degats).
Resultat: la source de verite degats/defense/esquive est unique et alignee au document officiel.
