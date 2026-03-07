# SOARA - Referentiel Global Des Objets

Date: 2026-03-07  
Statut: reference globale des objets runtime

## Source de verite
- Objets equipables runtime: `public/js/data/equipmentBase.js`
- Objets presents dans les fiches entites: `public/data/entities/fiches_entites.json`

## Schema de fiche objet (standard)
```json
{
  "id": "obj_xxx_v1",
  "nom": "Nom affiche",
  "type": "equipement | consommable | butin | narratif",
  "slot": "rightHand | leftHand | armor | accessory | inventory",
  "effets": {
    "atk": 0,
    "def": 0,
    "esq": 0,
    "hpMax": 0,
    "energyMax": 0,
    "regen": 0
  },
  "stackMax": 1,
  "description": "Texte court",
  "obtainable": true
}
```

## Objets nourriture (symboles inventaire)
### Fiche - `food_bread_ration`
```json
{
  "id": "food_bread_ration",
  "nom": "Ration de pain",
  "type": "consommable",
  "slot": "inventory",
  "effets": { "atk": 0, "def": 0, "esq": 0, "hpMax": 0, "energyMax": 0, "regen": 0 },
  "stackMax": 10,
  "description": "Ration de base.",
  "obtainable": true,
  "symbole": "U+1F35E"
}
```

### Fiche - `food_meat`
```json
{
  "id": "food_meat",
  "nom": "Viande",
  "type": "consommable",
  "slot": "inventory",
  "effets": { "atk": 0, "def": 0, "esq": 0, "hpMax": 0, "energyMax": 0, "regen": 0 },
  "stackMax": 10,
  "description": "Nourriture proteinee.",
  "obtainable": true,
  "symbole": "U+1F357"
}
```

### Fiche - `food_apple`
```json
{
  "id": "food_apple",
  "nom": "Pomme",
  "type": "consommable",
  "slot": "inventory",
  "effets": { "atk": 0, "def": 0, "esq": 0, "hpMax": 0, "energyMax": 0, "regen": 0 },
  "stackMax": 10,
  "description": "Fruit commun.",
  "obtainable": true,
  "symbole": "U+1F34E"
}
```

### Fiche - `food_mushroom`
```json
{
  "id": "food_mushroom",
  "nom": "Champignon",
  "type": "consommable",
  "slot": "inventory",
  "effets": { "atk": 0, "def": 0, "esq": 0, "hpMax": 0, "energyMax": 0, "regen": 0 },
  "stackMax": 10,
  "description": "Ressource de foret.",
  "obtainable": true,
  "symbole": "U+1F344"
}
```

### Fiche - `food_honey`
```json
{
  "id": "food_honey",
  "nom": "Miel",
  "type": "consommable",
  "slot": "inventory",
  "effets": { "atk": 0, "def": 0, "esq": 0, "hpMax": 0, "energyMax": 0, "regen": 0 },
  "stackMax": 10,
  "description": "Nourriture speciale.",
  "obtainable": true,
  "symbole": "U+1F36F"
}
```

### Fiche - `food_carrot`
```json
{
  "id": "food_carrot",
  "nom": "Carotte",
  "type": "consommable",
  "slot": "inventory",
  "effets": { "atk": 0, "def": 0, "esq": 0, "hpMax": 0, "energyMax": 0, "regen": 0 },
  "stackMax": 10,
  "description": "Legume de reserve.",
  "obtainable": true,
  "symbole": "U+1F955"
}
```

## Objets equipables (runtime actifs)
### Fiche - `none`
```json
{
  "id": "none",
  "nom": "-",
  "type": "equipement",
  "slot": "any",
  "effets": { "atk": 0, "def": 0, "esq": 0, "hpMax": 0, "energyMax": 0, "regen": 0 },
  "stackMax": 1,
  "description": "Aucun equipement.",
  "obtainable": false
}
```

### Fiche - `weapon_training_sword`
```json
{
  "id": "weapon_training_sword",
  "nom": "Epee d'entrainement",
  "type": "equipement",
  "slot": "rightHand",
  "effets": { "atk": 2, "def": 0, "esq": 0, "hpMax": 0, "energyMax": 0, "regen": 0 },
  "stackMax": 1,
  "description": "Arme de base de progression.",
  "obtainable": true
}
```

### Fiche - `offhand_wood_shield`
```json
{
  "id": "offhand_wood_shield",
  "nom": "Bouclier bois",
  "type": "equipement",
  "slot": "leftHand",
  "effets": { "atk": 0, "def": 2, "esq": -1, "hpMax": 0, "energyMax": 0, "regen": 0 },
  "stackMax": 1,
  "description": "Bouclier defensif debutant.",
  "obtainable": true
}
```

### Fiche - `offhand_tutorial_shield`
```json
{
  "id": "offhand_tutorial_shield",
  "nom": "Bouclier de tutoriel",
  "type": "equipement",
  "slot": "leftHand",
  "effets": { "atk": 0, "def": 2, "esq": 0, "hpMax": 0, "energyMax": 0, "regen": 0 },
  "stackMax": 1,
  "description": "Bouclier utilise en contexte tutoriel.",
  "obtainable": true
}
```

### Fiche - `armor_padded`
```json
{
  "id": "armor_padded",
  "nom": "Armure matelassee",
  "type": "equipement",
  "slot": "armor",
  "effets": { "atk": 0, "def": 1, "esq": 0, "hpMax": 4, "energyMax": 0, "regen": 0 },
  "stackMax": 1,
  "description": "Protection legere augmentant les PV max.",
  "obtainable": true
}
```

### Fiche - `accessory_focus_band`
```json
{
  "id": "accessory_focus_band",
  "nom": "Bandeau focus",
  "type": "equipement",
  "slot": "accessory",
  "effets": { "atk": 0, "def": 0, "esq": 2, "hpMax": 0, "energyMax": 1, "regen": 0 },
  "stackMax": 1,
  "description": "Accessoire de concentration et mobilite.",
  "obtainable": true
}
```

### Fiche - `accessory_training_gloves`
```json
{
  "id": "accessory_training_gloves",
  "nom": "Gants d'entrainement",
  "type": "equipement",
  "slot": "accessory",
  "effets": { "atk": 0, "def": 0, "esq": 1, "hpMax": 0, "energyMax": 0, "regen": 0 },
  "stackMax": 1,
  "description": "Accessoire de progression oriente esquive.",
  "obtainable": true
}
```

## Objets narratifs declares dans les fiches entites
### Fiche - `obj_rusty_blade_v1`
```json
{
  "id": "obj_rusty_blade_v1",
  "nom": "Lame rouillee",
  "type": "narratif",
  "slot": "rightHand",
  "effets": { "atk": 0, "def": 0, "esq": 0, "hpMax": 0, "energyMax": 0, "regen": 0 },
  "stackMax": 1,
  "description": "Arme rudimentaire de gobelin.",
  "obtainable": true
}
```

### Fiche - `obj_spiked_hide_light_v1`
```json
{
  "id": "obj_spiked_hide_light_v1",
  "nom": "Peau cloutee legere",
  "type": "narratif",
  "slot": "armor",
  "effets": { "atk": 0, "def": 0, "esq": 0, "hpMax": 0, "energyMax": 0, "regen": 0 },
  "stackMax": 1,
  "description": "Protection legere artisanale.",
  "obtainable": true
}
```

### Fiche - `obj_side_blade_v1`
```json
{
  "id": "obj_side_blade_v1",
  "nom": "Lame d'appoint",
  "type": "narratif",
  "slot": "rightHand",
  "effets": { "atk": 0, "def": 0, "esq": 0, "hpMax": 0, "energyMax": 0, "regen": 0 },
  "stackMax": 1,
  "description": "Lame standard d'appoint humain.",
  "obtainable": true
}
```

### Fiche - `obj_light_shield_v1`
```json
{
  "id": "obj_light_shield_v1",
  "nom": "Bouclier leger",
  "type": "narratif",
  "slot": "leftHand",
  "effets": { "atk": 0, "def": 0, "esq": 0, "hpMax": 0, "energyMax": 0, "regen": 0 },
  "stackMax": 1,
  "description": "Bouclier de base non calibre gameplay.",
  "obtainable": true
}
```

### Fiche - `obj_gambeson_simple_v1`
```json
{
  "id": "obj_gambeson_simple_v1",
  "nom": "Gambison simple",
  "type": "narratif",
  "slot": "armor",
  "effets": { "atk": 0, "def": 0, "esq": 0, "hpMax": 0, "energyMax": 0, "regen": 0 },
  "stackMax": 1,
  "description": "Armure textile de milice.",
  "obtainable": true
}
```

### Fiche - `obj_training_mace_v1`
```json
{
  "id": "obj_training_mace_v1",
  "nom": "Masse d'entrainement",
  "type": "narratif",
  "slot": "rightHand",
  "effets": { "atk": 0, "def": 0, "esq": 0, "hpMax": 0, "energyMax": 0, "regen": 0 },
  "stackMax": 1,
  "description": "Masse lourde d'entrainement orc.",
  "obtainable": true
}
```

### Fiche - `obj_thick_leather_v1`
```json
{
  "id": "obj_thick_leather_v1",
  "nom": "Cuir epais",
  "type": "narratif",
  "slot": "armor",
  "effets": { "atk": 0, "def": 0, "esq": 0, "hpMax": 0, "energyMax": 0, "regen": 0 },
  "stackMax": 1,
  "description": "Protection brute et robuste.",
  "obtainable": true
}
```

### Fiche - `obj_fangs_v1`
```json
{
  "id": "obj_fangs_v1",
  "nom": "Crocs",
  "type": "narratif",
  "slot": "rightHand",
  "effets": { "atk": 0, "def": 0, "esq": 0, "hpMax": 0, "energyMax": 0, "regen": 0 },
  "stackMax": 1,
  "description": "Arme naturelle du loup.",
  "obtainable": false
}
```

### Fiche - `obj_claws_v1`
```json
{
  "id": "obj_claws_v1",
  "nom": "Griffes",
  "type": "narratif",
  "slot": "leftHand",
  "effets": { "atk": 0, "def": 0, "esq": 0, "hpMax": 0, "energyMax": 0, "regen": 0 },
  "stackMax": 1,
  "description": "Arme naturelle secondaire du loup.",
  "obtainable": false
}
```

### Fiche - `obj_dense_fur_v1`
```json
{
  "id": "obj_dense_fur_v1",
  "nom": "Pelage dense",
  "type": "narratif",
  "slot": "armor",
  "effets": { "atk": 0, "def": 0, "esq": 0, "hpMax": 0, "energyMax": 0, "regen": 0 },
  "stackMax": 1,
  "description": "Protection naturelle du loup.",
  "obtainable": false
}
```

### Fiche - `obj_bandage_v1`
```json
{
  "id": "obj_bandage_v1",
  "nom": "Bandage",
  "type": "consommable",
  "slot": "inventory",
  "effets": { "atk": 0, "def": 0, "esq": 0, "hpMax": 0, "energyMax": 0, "regen": 0 },
  "stackMax": 10,
  "description": "Consommable de soin simple (effet non cable gameplay).",
  "obtainable": true
}
```

### Fiche - `obj_dry_ration_v1`
```json
{
  "id": "obj_dry_ration_v1",
  "nom": "Ration seche",
  "type": "consommable",
  "slot": "inventory",
  "effets": { "atk": 0, "def": 0, "esq": 0, "hpMax": 0, "energyMax": 0, "regen": 0 },
  "stackMax": 10,
  "description": "Ravitaillement basique (effet non cable gameplay).",
  "obtainable": true
}
```

## Regle de maintenance
- A chaque ajout/modification d'objet dans `equipmentBase.js` ou dans `fiches_entites.json`, mettre a jour ce document.
- Si un objet narratif devient equipable gameplay, lui attribuer un `id` runtime et le migrer dans la section objets equipables.
