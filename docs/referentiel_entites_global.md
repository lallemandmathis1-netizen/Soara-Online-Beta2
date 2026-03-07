# SOARA - Referentiel Global Des Entites

Date: 2026-03-07  
Statut: reference globale des monstres, PNJ et autres entites

## Source de verite
- Donnees runtime: `public/data/entities/fiches_entites.json`
- Ce document reference toutes les entites presentes dans cette source.

## Schema de fiche (standard)
```json
{
  "id": "entity_xxx_v1",
  "role": "monster | npc | training_dummy | boss | neutral",
  "identity": {
    "nom": "Nom affiche",
    "espece": "Espece",
    "faction": "Faction ou Neutre"
  },
  "stats": {
    "pv": 0,
    "pvMax": 0,
    "energie": 0,
    "energieMax": 0,
    "regenEnergie": 0,
    "atk": 0,
    "def": 0,
    "esq": 0
  },
  "reputation": {
    "locale": 0
  },
  "information": {
    "techniquesApprises": 0,
    "techSlotsDebloques": 0,
    "techniquesEquipees": []
  },
  "equipement": {
    "mainDroite": "-",
    "mainGauche": "-",
    "armure": "-",
    "accessoire": "-"
  },
  "inventaire": [null, null, null, null, null, null, null, null, null],
  "aiProfile": {
    "mode": "scripted | aggressive_short_burst | ...",
    "description": "Description courte"
  }
}
```

## Index global des entites referencees
### Monstres
- `entity_gobelin_base_v1`
  - nom: `Gobelin`
  - role: `monster`
  - faction: `Royaume Gobelin`
  - mode IA: `aggressive_short_burst`
- `entity_loup_base_v1`
  - nom: `Loup`
  - role: `monster`
  - faction: `Meute sauvage`
  - mode IA: `aggressive_short_burst`

### PNJ
- `entity_humain_classique_v1`
  - nom: `Humain classique`
  - role: `npc`
  - faction: `Neutre`
  - mode IA: `balanced_rotation`
- `entity_orc_classique_v1`
  - nom: `Orc classique`
  - role: `npc`
  - faction: `Royaume de Roor`
  - mode IA: `aggressive_short_burst`

### Autres entites
- `entity_dummy_training_v1`
  - nom: `DUMMY`
  - role: `training_dummy`
  - faction: `Neutre`
  - mode IA: `scripted`

## Fiches schema des entites referencees
### Fiche schema - `entity_dummy_training_v1`
```json
{
  "id": "entity_dummy_training_v1",
  "role": "training_dummy",
  "identity": {
    "nom": "DUMMY",
    "espece": "Construct",
    "faction": "Neutre"
  },
  "stats": {
    "pv": 10,
    "pvMax": 10,
    "energie": 4,
    "energieMax": 4,
    "regenEnergie": 1,
    "atk": 1,
    "def": 1,
    "esq": 1
  },
  "reputation": {
    "locale": 0
  },
  "information": {
    "techniquesApprises": 1,
    "techSlotsDebloques": 1,
    "techniquesEquipees": ["force_O"]
  },
  "equipement": {
    "mainDroite": "-",
    "mainGauche": "-",
    "armure": "-",
    "accessoire": "-"
  },
  "inventaire": [null, null, null, null, null, null, null, null, null],
  "aiProfile": {
    "mode": "scripted",
    "description": "Cible d'entrainement stable, action simple forcee."
  }
}
```

### Fiche schema - `entity_gobelin_base_v1`
```json
{
  "id": "entity_gobelin_base_v1",
  "role": "monster",
  "identity": {
    "nom": "Gobelin",
    "espece": "Gobelin",
    "faction": "Royaume Gobelin"
  },
  "stats": {
    "pv": 24,
    "pvMax": 24,
    "energie": 5,
    "energieMax": 5,
    "regenEnergie": 1,
    "atk": 2,
    "def": 1,
    "esq": 2
  },
  "reputation": {
    "locale": 0
  },
  "information": {
    "techniquesApprises": 3,
    "techSlotsDebloques": 3,
    "techniquesEquipees": ["base_punch", "base_quick", "base_feint"]
  },
  "equipement": {
    "mainDroite": "Lame rouillee",
    "mainGauche": "-",
    "armure": "Peau cloutee legere",
    "accessoire": "-"
  },
  "inventaire": ["Bandage", null, null, null, null, null, null, null, null],
  "aiProfile": {
    "mode": "aggressive_short_burst",
    "description": "Pression courte et mobile, cherche l'ouverture rapide."
  }
}
```

### Fiche schema - `entity_humain_classique_v1`
```json
{
  "id": "entity_humain_classique_v1",
  "role": "npc",
  "identity": {
    "nom": "Humain classique",
    "espece": "Humain",
    "faction": "Neutre"
  },
  "stats": {
    "pv": 22,
    "pvMax": 22,
    "energie": 5,
    "energieMax": 5,
    "regenEnergie": 1,
    "atk": 2,
    "def": 2,
    "esq": 1
  },
  "reputation": {
    "locale": 0
  },
  "information": {
    "techniquesApprises": 3,
    "techSlotsDebloques": 3,
    "techniquesEquipees": ["base_punch", "base_guard", "base_wait"]
  },
  "equipement": {
    "mainDroite": "Lame d'appoint",
    "mainGauche": "Bouclier leger",
    "armure": "Gambison simple",
    "accessoire": "-"
  },
  "inventaire": ["Bandage", null, null, null, null, null, null, null, null],
  "aiProfile": {
    "mode": "balanced_rotation",
    "description": "Alternance offense/defense/economie pour duel stable."
  }
}
```

### Fiche schema - `entity_orc_classique_v1`
```json
{
  "id": "entity_orc_classique_v1",
  "role": "npc",
  "identity": {
    "nom": "Orc classique",
    "espece": "Orc",
    "faction": "Royaume de Roor"
  },
  "stats": {
    "pv": 26,
    "pvMax": 26,
    "energie": 5,
    "energieMax": 5,
    "regenEnergie": 1,
    "atk": 3,
    "def": 2,
    "esq": 1
  },
  "reputation": {
    "locale": 0
  },
  "information": {
    "techniquesApprises": 3,
    "techSlotsDebloques": 3,
    "techniquesEquipees": ["base_double", "base_turtle", "base_027"]
  },
  "equipement": {
    "mainDroite": "Masse d'entrainement",
    "mainGauche": "-",
    "armure": "Cuir epais",
    "accessoire": "-"
  },
  "inventaire": ["Ration seche", null, null, null, null, null, null, null, null],
  "aiProfile": {
    "mode": "aggressive_short_burst",
    "description": "Pression frontale avec pointes d'impact."
  }
}
```

### Fiche schema - `entity_loup_base_v1`
```json
{
  "id": "entity_loup_base_v1",
  "role": "monster",
  "identity": {
    "nom": "Loup",
    "espece": "Canide",
    "faction": "Meute sauvage"
  },
  "stats": {
    "pv": 16,
    "pvMax": 16,
    "energie": 4,
    "energieMax": 4,
    "regenEnergie": 1,
    "atk": 2,
    "def": 1,
    "esq": 2
  },
  "reputation": {
    "locale": 0
  },
  "information": {
    "techniquesApprises": 3,
    "techSlotsDebloques": 3,
    "techniquesEquipees": ["base_023", "base_quick", "base_024"]
  },
  "equipement": {
    "mainDroite": "Crocs",
    "mainGauche": "Griffes",
    "armure": "Pelage dense",
    "accessoire": "-"
  },
  "inventaire": [null, null, null, null, null, null, null, null, null],
  "aiProfile": {
    "mode": "aggressive_short_burst",
    "description": "Harcelement rapide et pression par mobilite."
  }
}
```

## Regle de maintenance
- A chaque ajout/suppression d'entite dans `public/data/entities/fiches_entites.json`, mettre a jour ce document.
