export const EQUIPMENT_BASE = {
  none: { id: "none", slot: "any", name: "-", atk: 0, def: 0, esq: 0, hpMax: 0, energyMax: 0, regen: 0 },

  weapon_training_sword: { id: "weapon_training_sword", slot: "rightHand", name: "Epee d'entrainement", atk: 2, def: 0, esq: 0, hpMax: 0, energyMax: 0, regen: 0 },
  offhand_wood_shield: { id: "offhand_wood_shield", slot: "leftHand", name: "Bouclier bois", atk: 0, def: 2, esq: -1, hpMax: 0, energyMax: 0, regen: 0 },
  armor_padded: { id: "armor_padded", slot: "armor", name: "Armure matelassee", atk: 0, def: 1, esq: 0, hpMax: 4, energyMax: 0, regen: 0 },
  accessory_focus_band: { id: "accessory_focus_band", slot: "accessory", name: "Bandeau focus", atk: 0, def: 0, esq: 2, hpMax: 0, energyMax: 1, regen: 0 }
};

export const STARTER_EQUIPMENT = {
  rightHand: "weapon_training_sword",
  leftHand: "offhand_wood_shield",
  armor: "armor_padded",
  accessory: "accessory_focus_band"
};

function resolveItem(id) {
  if (!id || typeof id !== "string") return EQUIPMENT_BASE.none;
  return EQUIPMENT_BASE[id] || EQUIPMENT_BASE.none;
}

export function getEquipmentLabel(id) {
  return resolveItem(id).name || "-";
}

export function computeEquipmentStats(loadout = {}) {
  const items = [
    resolveItem(loadout.rightHand),
    resolveItem(loadout.leftHand),
    resolveItem(loadout.armor),
    resolveItem(loadout.accessory)
  ];

  const out = {
    atk: 1,
    def: 1,
    esq: 1,
    hpMaxBonus: 0,
    energyMaxBonus: 0,
    regenBonus: 0
  };

  for (const it of items) {
    out.atk += Number(it.atk || 0);
    out.def += Number(it.def || 0);
    out.esq += Number(it.esq || 0);
    out.hpMaxBonus += Number(it.hpMax || 0);
    out.energyMaxBonus += Number(it.energyMax || 0);
    out.regenBonus += Number(it.regen || 0);
  }
  return out;
}

