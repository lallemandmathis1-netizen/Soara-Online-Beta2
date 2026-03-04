import { buildCatalogueMap, TECH_CATALOGUE } from "../data/techCatalogue.js";
import { normalizeSymbolKey, resolveSymbolMeta } from "../data/symbolsV6.js";
import { STARTER_EQUIPMENT } from "../data/equipmentBase.js";

const STORAGE_KEY = "soara_beta2_player_state";

export function createPlayerState({ initialName = "Joueur1" } = {}) {
  let runtimeCatalogue = Array.isArray(TECH_CATALOGUE) ? [...TECH_CATALOGUE] : [];
  let runtimeCatalogueMap = buildCatalogueMap(runtimeCatalogue);

  function hasCatalogueLoaded() {
    return runtimeCatalogueMap.size > 0;
  }

  function catalogueHas(id) {
    if (!id) return false;
    if (!hasCatalogueLoaded()) return true;
    return runtimeCatalogueMap.has(id);
  }

  const defaultState = {
    player: {
      id: "player_1",
      displayName: initialName,
      profile: { temperament: null, style: null, objectif: null },
      stats: { hpMax: 34, hp: 34, energyMax: 4, energy: 4, regen: 1 },
      equipment: { ...STARTER_EQUIPMENT },
      inventorySlots: Array.from({ length: 9 }, () => null),
      learnedTechniques: [],
      techSlotsTotal: 10,
      techniquesBySlot: Array.from({ length: 10 }, () => null),
      combatConfig: { combatType: "tutorial", unitDurationMs: 500, autoTempo: false },
      hasStarterKitV2: false
    },
    campaign: { tutorialDialogueDone: false, tutorialCombatDone: false }
  };
  let state = JSON.parse(JSON.stringify(defaultState));
  const listeners = new Set();

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function normalizeState(input) {
    const base = clone(defaultState);
    const src = input && typeof input === "object" ? input : {};
    const out = { ...base, ...src };
    out.player = { ...base.player, ...(src.player || {}) };
    out.player.profile = { ...base.player.profile, ...(src?.player?.profile || {}) };
    out.player.stats = { ...base.player.stats, ...(src?.player?.stats || {}) };
    out.player.equipment = { ...base.player.equipment, ...(src?.player?.equipment || {}) };
    out.player.inventorySlots = Array.isArray(src?.player?.inventorySlots)
      ? Array.from({ length: 9 }, (_, i) => src.player.inventorySlots[i] ?? null)
      : Array.from({ length: 9 }, () => null);

    const learned = Array.isArray(src?.player?.learnedTechniques)
      ? src.player.learnedTechniques
        .map((x) => (typeof x === "string" ? x : x?.id))
        .filter((id) => typeof id === "string" && catalogueHas(id))
      : [];
    out.player.learnedTechniques = [...new Set(learned)];

    out.player.techSlotsTotal = Math.max(1, Math.min(10, Number(src?.player?.techSlotsTotal ?? 10)));
    const rawSlots = Array.isArray(src?.player?.techniquesBySlot) ? src.player.techniquesBySlot : [];
    out.player.techniquesBySlot = Array.from({ length: out.player.techSlotsTotal }, (_, i) => {
      const value = rawSlots[i];
      if (!value) return null;
      const id = typeof value === "string" ? value : value?.id;
      return typeof id === "string" && catalogueHas(id) ? id : null;
    });

    for (let i = 0; i < out.player.techniquesBySlot.length; i += 1) {
      const id = out.player.techniquesBySlot[i];
      if (!id) continue;
      if (!out.player.learnedTechniques.includes(id)) out.player.learnedTechniques.push(id);
    }

    out.player.combatConfig = { ...base.player.combatConfig, ...(src?.player?.combatConfig || {}) };
    out.player.hasStarterKitV2 = !!src?.player?.hasStarterKitV2;
    out.campaign = { ...base.campaign, ...(src?.campaign || {}) };
    return out;
  }

  function emit() {
    const snap = get();
    for (const cb of listeners) cb(snap);
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    try {
      state = normalizeState(JSON.parse(raw));
      return true;
    } catch {
      return false;
    }
  }

  function get() {
    return clone(state);
  }

  function updatePlayer(patchFn) {
    const next = get();
    patchFn(next.player);
    state = normalizeState(next);
    save();
    emit();
  }

  function patch(mutator) {
    const next = get();
    mutator(next);
    state = normalizeState(next);
    save();
    emit();
  }

  function subscribe(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  function setCatalogue(catalogue) {
    runtimeCatalogue = Array.isArray(catalogue) ? [...catalogue] : [];
    runtimeCatalogueMap = buildCatalogueMap(runtimeCatalogue);
    state = normalizeState(state);
    save();
    emit();
  }

  function pickStarterSet(existingIds = new Set()) {
    const source = Array.isArray(runtimeCatalogue) ? runtimeCatalogue : [];
    const findBy = (predicate) => source.find((t) => predicate(t) && !existingIds.has(t.id))
      || source.find((t) => predicate(t))
      || null;

    const symbolsOf = (t) => (Array.isArray(t?.symbols) ? t.symbols : [])
      .map((s) => normalizeSymbolKey(typeof s === "string" ? s : s?.sym))
      .filter(Boolean);

    const off = findBy((t) => t.type === "normal" && (t.category === "offense" || symbolsOf(t).includes("X")));
    const def = findBy((t) => {
      if (t.type !== "normal") return false;
      if (t.category === "defense") return true;
      return symbolsOf(t).some((s) => resolveSymbolMeta(s)?.type === "defense");
    });
    const esq = findBy((t) => {
      if (t.type !== "normal") return false;
      if (t.category === "evasion") return true;
      return symbolsOf(t).some((s) => resolveSymbolMeta(s)?.type === "evasion");
    });
    const ref = findBy((t) => t.type === "reflex");
    return [off, def, esq, ref].filter(Boolean).map((t) => t.id);
  }

  function grantStarterTechniques() {
    patch((s) => {
      if (s.player.hasStarterKitV2) return;
      const hasExistingProgress = (Array.isArray(s.player.learnedTechniques) && s.player.learnedTechniques.length > 0)
        || (Array.isArray(s.player.techniquesBySlot) && s.player.techniquesBySlot.some((x) => !!x));
      if (hasExistingProgress) {
        s.player.hasStarterKitV2 = true;
        return;
      }
      const existing = new Set((s.player.learnedTechniques || []).map((x) => (typeof x === "string" ? x : x?.id)).filter(Boolean));
      const starter = pickStarterSet(existing);
      const learned = [...existing];
      for (const id of starter) {
        if (!learned.includes(id)) learned.push(id);
      }
      s.player.learnedTechniques = [...learned];
      s.player.techniquesBySlot = Array.from({ length: 10 }, (_, i) => (i < 4 ? starter[i] || null : null));
      s.player.hasStarterKitV2 = true;
    });
  }

  function grantStarterKit() {
    grantStarterTechniques();
  }

  return {
    get,
    patch,
    load,
    save,
    subscribe,
    updatePlayer,
    setCatalogue,
    grantStarterKit,
    grantStarterTechniques
  };
}



