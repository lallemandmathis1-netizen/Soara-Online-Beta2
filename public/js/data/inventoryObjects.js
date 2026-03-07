function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const CATALOGUE = {
  food_bread_ration: {
    id: "food_bread_ration",
    name: "Ration de pain",
    icon: "\u{1F35E}",
    type: "food"
  },
  food_meat: {
    id: "food_meat",
    name: "Viande",
    icon: "\u{1F357}",
    type: "food"
  },
  food_apple: {
    id: "food_apple",
    name: "Pomme",
    icon: "\u{1F34E}",
    type: "food"
  },
  food_mushroom: {
    id: "food_mushroom",
    name: "Champignon",
    icon: "\u{1F344}",
    type: "food"
  },
  food_honey: {
    id: "food_honey",
    name: "Miel",
    icon: "\u{1F36F}",
    type: "food"
  },
  food_carrot: {
    id: "food_carrot",
    name: "Carotte",
    icon: "\u{1F955}",
    type: "food"
  }
};

const ALIASES = {
  "ration": "food_bread_ration",
  "rations": "food_bread_ration",
  "ration seche": "food_bread_ration",
  "pain": "food_bread_ration",
  "viande": "food_meat",
  "pomme": "food_apple",
  "champignon": "food_mushroom",
  "champignons": "food_mushroom",
  "miel": "food_honey",
  "carotte": "food_carrot",
  "carottes": "food_carrot"
};

export function resolveInventoryObject(raw) {
  if (raw == null) return null;

  if (typeof raw === "object") {
    const id = String(raw.id || "").trim();
    if (id && CATALOGUE[id]) return CATALOGUE[id];
    const name = String(raw.name || "").trim();
    if (!name) return null;
    raw = name;
  }

  const text = String(raw || "").trim();
  if (!text) return null;

  if (CATALOGUE[text]) return CATALOGUE[text];

  const key = normalizeKey(text);
  if (ALIASES[key] && CATALOGUE[ALIASES[key]]) {
    return CATALOGUE[ALIASES[key]];
  }

  for (const [alias, id] of Object.entries(ALIASES)) {
    if (key.includes(alias) && CATALOGUE[id]) return CATALOGUE[id];
  }

  return { id: "", name: text, icon: "", type: "misc" };
}

