# Systeme de Resolution (Beta2)

Ce document decrit les regles de resolution implementees dans le runtime actuel.

## 1) Principe general

- Systeme deterministe: aucun de en resolution.
- Seule l'initiative utilise un tirage.
- Chaque entite valide un symbole puis le moteur applique:
  - cout energie
  - attaque/mitigation
  - esquive binaire
  - parade
  - vulnerable

## 2) Valeurs d'attaque fixes

Source officielle des multiplicateurs: `docs/SOARA_V6_Table_Symboles.docx` (projete dans `public/js/data/symbolsV6.js`).

- `X`: `1 x ATK`
- `<>`: `3 x ATK`
- `FINAL`: `3 x ATK` (ignore defense, garde armure)
- `!`: `2 x ATK`
- `~`: `2 x ATK`

## 3) Defense et armure

- `DEF_power = defFactor(symbole) x DEF_stat`
- `Mitigation = DEF_power + Armure`
- `Degats = max(0, ATK_power - Mitigation)`

### Duel offensif (attaque vs attaque)

- Si les 2 entites jouent un symbole d'attaque au meme rang:
  - `rawToEnemy = max(0, ATK_J - ATK_E)`
  - `rawToPlayer = max(0, ATK_E - ATK_J)`
  - degats finaux du duel:
    - `toEnemy = max(0, rawToEnemy - ArmureEnemy)`
    - `toPlayer = max(0, rawToPlayer - ArmurePlayer)`
- En duel offensif, on n'applique pas la mitigation DEF du symbole en face (seulement l'armure).

## 4) Esquive binaire

- `ESQ_power = esqFactor(symbole) x ESQ_stat`
- `Energy_attaquant = cout energie reel du symbole attaquant`
- Si `ESQ_power > Energy_attaquant` => attaque totalement esquivee (`0 degat`)
- Sinon => attaque appliquee integralement

## 5) Parade (runtime)

Si une entite pare une attaque:
- l'attaque recue est annulee sur ce cote
- renvoi: `min(attaque entrante, 2xATK du pareur)`

## 6) Vulnerable

- `VULN` applique un etat vulnerable sur l'entite qui le joue
- sur le tour courant: degats recus `x2`
- etat consomme en fin de tour

## 7) Couts energie

- normal: `x1`
- reflexe (`[ ]`): `x2`
- aerien (`{ }`): `x3`
- energie clamp entre `0` et `energyMax`

## 8) Ordre de resolution

1. Regeneration energie
2. Consommation energie du symbole valide
3. Calcul attaque/defense
4. Application esquive binaire
5. Application parade
6. Application vulnerable et degats finaux
7. Mise a jour PV/etats/log

## 9) Fichiers de reference

- `public/js/features/combatEngine.js`
- `public/js/features/resolutionSandbox.js`
- `public/js/data/symbolsV6.js`
