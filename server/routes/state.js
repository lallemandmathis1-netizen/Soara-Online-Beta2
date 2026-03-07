const { authMiddleware } = require("../auth");

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toBoundedString(value, { max = 120, allowEmpty = true } = {}) {
  if (value === undefined) return undefined;
  const out = String(value);
  if (!allowEmpty && !out.trim()) return null;
  return out.slice(0, max);
}

function toIntInRange(value, min, max) {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function sanitizeStringArray(arr, { label, maxItems = 200, maxLen = 80 } = {}) {
  if (!Array.isArray(arr)) return { ok: false, message: `${label} doit etre un tableau.` };
  if (arr.length > maxItems) return { ok: false, message: `${label} contient trop d'elements.` };
  const list = [];
  for (const item of arr) {
    if (typeof item !== "string") return { ok: false, message: `${label} contient une valeur invalide.` };
    list.push(item.slice(0, maxLen));
  }
  return { ok: true, value: list };
}

function sanitizeNullableStringArray(arr, { label, maxItems = 200, maxLen = 80 } = {}) {
  if (!Array.isArray(arr)) return { ok: false, message: `${label} doit etre un tableau.` };
  if (arr.length > maxItems) return { ok: false, message: `${label} contient trop d'elements.` };
  const list = [];
  for (const item of arr) {
    if (item == null) {
      list.push(null);
      continue;
    }
    if (typeof item !== "string") return { ok: false, message: `${label} contient une valeur invalide.` };
    list.push(item.slice(0, maxLen));
  }
  return { ok: true, value: list };
}

function sanitizePointArray(arr, { label, maxItems = 800 } = {}) {
  if (!Array.isArray(arr)) return { ok: false, message: `${label} doit etre un tableau.` };
  if (arr.length > maxItems) return { ok: false, message: `${label} contient trop d'elements.` };
  const out = [];
  for (const item of arr) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, message: `${label} contient un point invalide.` };
    }
    const x = Number(item.x);
    const y = Number(item.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { ok: false, message: `${label} contient un point non numerique.` };
    }
    out.push({ x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) });
  }
  return { ok: true, value: out };
}

function sanitizePinOverridesMap(input, { label = "pinOverrides", maxItems = 80 } = {}) {
  if (!isPlainObject(input)) return { ok: false, message: `${label} doit etre un objet.` };
  const entries = Object.entries(input);
  if (entries.length > maxItems) return { ok: false, message: `${label} contient trop d'entrees.` };
  const out = {};
  for (const [rawId, rawPos] of entries) {
    const id = String(rawId || "").trim().slice(0, 40);
    if (!id) return { ok: false, message: `${label} contient un id invalide.` };
    if (!isPlainObject(rawPos)) return { ok: false, message: `${label}.${id} doit etre un objet {x,y}.` };
    const x = Number(rawPos.x);
    const y = Number(rawPos.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { ok: false, message: `${label}.${id} doit contenir des coordonnees numeriques.` };
    }
    out[id] = { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  }
  return { ok: true, value: out };
}

function sanitizeStatePatch(input) {
  if (!isPlainObject(input)) {
    return { ok: false, error: "invalid_patch", message: "Patch JSON invalide." };
  }

  const allowedTop = new Set([
    "name",
    "race",
    "faction",
    "money",
    "notebook",
    "pos",
    "hp",
    "hpMax",
    "reputation",
    "campaign",
    "tagsProfil",
    "reputationLocale",
    "historiqueC01",
    "inventory",
    "techSlots",
    "reflexSlots",
    "learnedReflexes",
    "learnedTechniques",
    "techniquesBySlot",
    "techSlotsTotal",
    "hasStarterKitV2",
    "starterRacePackV1",
    "discoveredPins",
    "exploredPoints",
    "pinOverrides",
    "history"
  ]);

  const unknown = Object.keys(input).filter((k) => !allowedTop.has(k));
  if (unknown.length) {
    return { ok: false, error: "unknown_fields", message: `Champs non autorises: ${unknown.join(", ")}` };
  }

  const out = {};
  if (input.name !== undefined) out.name = toBoundedString(input.name, { max: 60, allowEmpty: true });
  if (input.race !== undefined) out.race = toBoundedString(input.race, { max: 60, allowEmpty: true });
  if (input.faction !== undefined) out.faction = toBoundedString(input.faction, { max: 60, allowEmpty: true });
  if (input.notebook !== undefined) out.notebook = toBoundedString(input.notebook, { max: 2000, allowEmpty: true });

  if (input.money !== undefined) {
    const money = toIntInRange(input.money, 0, 1000000000);
    if (money === null) return { ok: false, error: "invalid_money", message: "money doit etre un nombre." };
    out.money = money;
  }
  if (input.hp !== undefined) {
    const hp = toIntInRange(input.hp, 0, 100000);
    if (hp === null) return { ok: false, error: "invalid_hp", message: "hp doit etre un nombre." };
    out.hp = hp;
  }
  if (input.hpMax !== undefined) {
    const hpMax = toIntInRange(input.hpMax, 1, 100000);
    if (hpMax === null) return { ok: false, error: "invalid_hpmax", message: "hpMax doit etre un nombre." };
    out.hpMax = hpMax;
  }

  if (input.pos !== undefined) {
    if (!isPlainObject(input.pos)) {
      return { ok: false, error: "invalid_pos", message: "pos doit etre un objet {x,y}." };
    }
    const x = Number(input.pos.x);
    const y = Number(input.pos.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { ok: false, error: "invalid_pos", message: "pos.x et pos.y doivent etre numeriques." };
    }
    out.pos = { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  }

  if (input.reputation !== undefined) {
    if (!isPlainObject(input.reputation)) {
      return { ok: false, error: "invalid_reputation", message: "reputation doit etre un objet." };
    }
    const rep = {};
    for (const key of ["bazeides", "federation", "roor", "gobelins"]) {
      if (input.reputation[key] === undefined) continue;
      const v = toIntInRange(input.reputation[key], -100000, 100000);
      if (v === null) return { ok: false, error: "invalid_reputation", message: `reputation.${key} doit etre un nombre.` };
      rep[key] = v;
    }
    out.reputation = rep;
  }

  if (input.campaign !== undefined) {
    if (!isPlainObject(input.campaign)) {
      return { ok: false, error: "invalid_campaign", message: "campaign doit etre un objet." };
    }
    const campaign = {};
    for (const [campaignId, progress] of Object.entries(input.campaign)) {
      if (!isPlainObject(progress)) {
        return { ok: false, error: "invalid_campaign", message: `campaign.${campaignId} invalide.` };
      }
      const next = {};
      if (progress.node !== undefined) {
        next.node = toBoundedString(progress.node, { max: 80, allowEmpty: false });
        if (next.node === null) {
          return { ok: false, error: "invalid_campaign", message: `campaign.${campaignId}.node invalide.` };
        }
      }
      if (progress.completed !== undefined) next.completed = !!progress.completed;
      campaign[campaignId] = next;
    }
    out.campaign = campaign;
  }

  if (input.tagsProfil !== undefined) {
    if (!isPlainObject(input.tagsProfil)) {
      return { ok: false, error: "invalid_tags_profil", message: "tagsProfil doit etre un objet." };
    }
    const tags = {};
    for (const key of ["prudence", "agressivite", "tempo"]) {
      if (input.tagsProfil[key] === undefined) continue;
      const v = toIntInRange(input.tagsProfil[key], 0, 100);
      if (v === null) return { ok: false, error: "invalid_tags_profil", message: `tagsProfil.${key} doit etre un nombre.` };
      tags[key] = v;
    }
    out.tagsProfil = tags;
  }

  if (input.reputationLocale !== undefined) {
    const reputationLocale = toIntInRange(input.reputationLocale, -100000, 100000);
    if (reputationLocale === null) {
      return { ok: false, error: "invalid_reputation_locale", message: "reputationLocale doit etre un nombre." };
    }
    out.reputationLocale = reputationLocale;
  }

  if (input.historiqueC01 !== undefined) {
    const parsed = sanitizeStringArray(input.historiqueC01, { label: "historiqueC01", maxItems: 200, maxLen: 180 });
    if (!parsed.ok) return { ok: false, error: "invalid_historique_c01", message: parsed.message };
    out.historiqueC01 = parsed.value;
  }

  if (input.inventory !== undefined) {
    if (!Array.isArray(input.inventory) || input.inventory.length !== 9) {
      return { ok: false, error: "invalid_inventory", message: "inventory doit contenir 9 slots." };
    }
    out.inventory = input.inventory.map((v) => (v == null ? null : toBoundedString(v, { max: 80, allowEmpty: true })));
  }

  if (input.techSlots !== undefined) {
    if (!isPlainObject(input.techSlots)) {
      return { ok: false, error: "invalid_techslots", message: "techSlots doit etre un objet." };
    }
    const slots = {};
    for (const key of ["base", "advanced", "expert", "unique"]) {
      if (input.techSlots[key] === undefined) continue;
      const v = toIntInRange(input.techSlots[key], 0, 50);
      if (v === null) return { ok: false, error: "invalid_techslots", message: `techSlots.${key} doit etre un nombre.` };
      if (key === "unique") slots.expert = v;
      else slots[key] = v;
    }
    out.techSlots = slots;
  }

  if (input.reflexSlots !== undefined) {
    const reflexSlots = toIntInRange(input.reflexSlots, 0, 50);
    if (reflexSlots === null) return { ok: false, error: "invalid_reflex_slots", message: "reflexSlots doit etre un nombre." };
    out.reflexSlots = reflexSlots;
  }

  if (input.learnedReflexes !== undefined) {
    const parsed = sanitizeStringArray(input.learnedReflexes, { label: "learnedReflexes", maxItems: 200, maxLen: 80 });
    if (!parsed.ok) return { ok: false, error: "invalid_learned_reflexes", message: parsed.message };
    out.learnedReflexes = parsed.value;
  }
  if (input.learnedTechniques !== undefined) {
    const parsed = sanitizeStringArray(input.learnedTechniques, { label: "learnedTechniques", maxItems: 500, maxLen: 80 });
    if (!parsed.ok) return { ok: false, error: "invalid_learned_techniques", message: parsed.message };
    out.learnedTechniques = parsed.value;
  }
  if (input.techniquesBySlot !== undefined) {
    const parsed = sanitizeNullableStringArray(input.techniquesBySlot, { label: "techniquesBySlot", maxItems: 20, maxLen: 80 });
    if (!parsed.ok) return { ok: false, error: "invalid_techniques_by_slot", message: parsed.message };
    out.techniquesBySlot = parsed.value;
  }
  if (input.techSlotsTotal !== undefined) {
    const techSlotsTotal = toIntInRange(input.techSlotsTotal, 1, 10);
    if (techSlotsTotal === null) return { ok: false, error: "invalid_tech_slots_total", message: "techSlotsTotal doit etre un nombre." };
    out.techSlotsTotal = techSlotsTotal;
  }
  if (input.hasStarterKitV2 !== undefined) {
    out.hasStarterKitV2 = !!input.hasStarterKitV2;
  }
  if (input.starterRacePackV1 !== undefined) {
    out.starterRacePackV1 = toBoundedString(input.starterRacePackV1, { max: 40, allowEmpty: true });
  }
  if (input.history !== undefined) {
    const parsed = sanitizeStringArray(input.history, { label: "history", maxItems: 1000, maxLen: 300 });
    if (!parsed.ok) return { ok: false, error: "invalid_history", message: parsed.message };
    out.history = parsed.value;
  }
  if (input.discoveredPins !== undefined) {
    const parsed = sanitizeStringArray(input.discoveredPins, { label: "discoveredPins", maxItems: 200, maxLen: 40 });
    if (!parsed.ok) return { ok: false, error: "invalid_discovered_pins", message: parsed.message };
    out.discoveredPins = [...new Set(parsed.value)];
  }
  if (input.exploredPoints !== undefined) {
    const parsed = sanitizePointArray(input.exploredPoints, { label: "exploredPoints", maxItems: 800 });
    if (!parsed.ok) return { ok: false, error: "invalid_explored_points", message: parsed.message };
    out.exploredPoints = parsed.value;
  }
  if (input.pinOverrides !== undefined) {
    const parsed = sanitizePinOverridesMap(input.pinOverrides, { label: "pinOverrides", maxItems: 80 });
    if (!parsed.ok) return { ok: false, error: "invalid_pin_overrides", message: parsed.message };
    out.pinOverrides = parsed.value;
  }

  return { ok: true, value: out };
}

function applyLegacyStateMigrations(state, username, defaultState) {
  let next = state;
  let changed = false;
  if (!next) {
    next = defaultState(username);
    changed = true;
  }

  if (!isPlainObject(next.techSlots)) {
    next.techSlots = { base: 0, advanced: 0, expert: 0 };
    changed = true;
  }
  if (next.techSlots.expert === undefined && next.techSlots.unique !== undefined) {
    next.techSlots.expert = Number(next.techSlots.unique) || 0;
    changed = true;
  }
  if (next.techSlots.unique !== undefined) {
    delete next.techSlots.unique;
    changed = true;
  }
  if (Array.isArray(next.learnedReflexes) && next.learnedReflexes.includes("reflex_01")) {
    next.learnedReflexes = next.learnedReflexes.map((id) => (id === "reflex_01" ? "r_base_001" : id));
    changed = true;
  }
  if (!isPlainObject(next.pinOverrides)) {
    next.pinOverrides = {};
    changed = true;
  }

  return { state: next, changed };
}

function mountStateRoutes(app, { db, config, defaultState }){
  const auth = authMiddleware({ secret: config.JWT_SECRET });

  app.get("/api/state", auth, async (req, res) => {
    const dbData = db.read();
    const user = db.getUser(dbData, req.username);
    if (!user) return res.status(404).json({ error: "not_found" });

    const migrated = applyLegacyStateMigrations(user.state, req.username, defaultState);
    user.state = migrated.state;

    if (migrated.changed) {
      await db.update((dbDataWrite) => {
        const userWrite = db.getUser(dbDataWrite, req.username);
        if (!userWrite) return;
        const migratedWrite = applyLegacyStateMigrations(userWrite.state, req.username, defaultState);
        userWrite.state = migratedWrite.state;
      });
    }

    return res.json(user.state);
  });

  app.post("/api/state", auth, async (req, res) => {
    const parsed = sanitizeStatePatch(req.body || {});
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error, message: parsed.message });
    }
    const patch = parsed.value;

    try {
      await db.update((dbData) => {
        const user = db.getUser(dbData, req.username);
        if (!user) {
          const err = new Error("not_found");
          err.code = "not_found";
          throw err;
        }
        if (!user.state) user.state = defaultState(req.username);

        user.state = { ...user.state, ...patch };
        if (patch.campaign) user.state.campaign = { ...user.state.campaign, ...patch.campaign };
        if (patch.reputation) user.state.reputation = { ...(user.state.reputation || {}), ...patch.reputation };
        if (patch.tagsProfil) user.state.tagsProfil = { ...(user.state.tagsProfil || {}), ...patch.tagsProfil };
        if (patch.techSlots) user.state.techSlots = { ...(user.state.techSlots || {}), ...patch.techSlots };
      });
      return res.json({ ok: true });
    } catch (e) {
      if (e && e.code === "not_found") return res.status(404).json({ error: "not_found" });
      throw e;
    }
  });
}

module.exports = { mountStateRoutes };
