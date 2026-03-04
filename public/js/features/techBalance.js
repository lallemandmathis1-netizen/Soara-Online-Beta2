import { normalizeSymbolKey, resolveSymbolMeta } from "../data/symbolsV6.js";

const SYMBOL_IMPACT = {
  X: { off: 1.0 },
  "<>": { off: 2.6 },
  FINAL: { off: 2.8 },
  "!": { off: 1.9, ctr: 0.2 },
  "~": { off: 1.7, ctr: 0.15 },
  GUARD: { def: 1.0 },
  BULWARK: { def: 1.9 },
  PARRY: { def: 1.1, ctr: 0.8 },
  "[]": { def: 1.0 },
  "()": { def: 1.9 },
  "||": { def: 1.1, ctr: 0.8 },
  FEINT: { evd: 0.9, ctr: 0.2 },
  ROLL: { evd: 1.6 },
  "^": { evd: 1.0, ctr: 0.2 },
  "^^": { evd: 1.8, ctr: 0.35 },
  v: { evd: 0.2 },
  O: { eco: 1.0 },
  AURA: { eco: 1.8 },
  "?": { eco: 1.1, ctr: 0.2 },
  ITEM: { eco: 0.7 },
  VULN: { ctr: 0.5 }
};

function average(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values) {
  if (!values.length) return 0;
  const m = average(values);
  const variance = average(values.map((v) => (v - m) ** 2));
  return Math.sqrt(Math.max(0, variance));
}

function expectedCategoryWeights(category) {
  const c = String(category || "mixed").toLowerCase();
  if (c === "offense") return { off: 0.55, def: 0.15, evd: 0.15, eco: 0.15 };
  if (c === "defense") return { off: 0.15, def: 0.55, evd: 0.15, eco: 0.15 };
  if (c === "evasion") return { off: 0.15, def: 0.15, evd: 0.55, eco: 0.15 };
  if (c === "economy") return { off: 0.15, def: 0.15, evd: 0.15, eco: 0.55 };
  return { off: 0.25, def: 0.25, evd: 0.25, eco: 0.25 };
}

function targetEfficiencyRange(tech) {
  const isReflex = tech?.type === "reflex" || tech?.category === "reflex";
  const rarity = String(tech?.rarity || "common").toLowerCase();
  const rarityDelta = {
    common: -0.35,
    uncommon: -0.15,
    rare: 0.1,
    epic: 0.3,
    legendary: 0.55
  }[rarity] ?? 0;
  if (isReflex) return { min: 1.6, max: 3.4 };
  const tier = String(tech?.tier || "base").toLowerCase();
  if (tier === "advanced") return { min: 1.25 + rarityDelta, max: 2.7 + rarityDelta };
  if (tier === "expert") return { min: 1.7 + rarityDelta, max: 3.3 + rarityDelta };
  if (tier === "base") return { min: 0.7 + rarityDelta, max: 2.0 + rarityDelta };
  return { min: 1.9 + rarityDelta, max: 3.6 + rarityDelta };
}

function replacementForCategory(category, mode) {
  const c = String(category || "mixed").toLowerCase();
  if (mode === "down") {
    if (c === "offense") return "O";
    if (c === "defense") return "GUARD";
    if (c === "evasion") return "FEINT";
    if (c === "economy") return "O";
    return "O";
  }
  if (c === "offense") return "X";
  if (c === "defense") return "GUARD";
  if (c === "evasion") return "ROLL";
  if (c === "economy") return "?";
  return "X";
}

function expectedTechniqueLengthRange(tech) {
  const isReflex = tech?.type === "reflex" || tech?.category === "reflex";
  if (isReflex) return { min: 2, max: 2 };
  const tier = String(tech?.tier || "base").toLowerCase();
  if (tier === "base") return { min: 3, max: 4 };
  if (tier === "advanced") return { min: 4, max: 6 };
  if (tier === "expert") return { min: 7, max: 7 };
  return { min: 7, max: 9 };
}

function normalizeTechniqueLength(symbols, tech) {
  const out = Array.isArray(symbols) ? symbols.filter(Boolean).map((s) => normalizeSymbolKey(s)).filter(Boolean) : [];
  const { min, max } = expectedTechniqueLengthRange(tech);
  const targetMin = Math.max(1, Number(min || 1));
  const targetMax = Math.max(targetMin, Number(max || targetMin));
  if (!out.length) {
    const filler = tech?.type === "reflex" || tech?.category === "reflex" ? "X" : "O";
    return Array.from({ length: targetMin }, () => filler);
  }
  // Preserve authored sequence length when it is already within the expected range.
  if (out.length >= targetMin && out.length <= targetMax) return out;
  if (out.length > targetMax) return out.slice(0, targetMax);
  return Array.from({ length: targetMin }, (_, i) => out[i % out.length]);
}

export function computeTechniqueStats(tech, symbols) {
  const tokens = Array.isArray(tech?.symbols)
    ? tech.symbols
    : (Array.isArray(tech?.tokens) ? tech.tokens : []);
  const isReflex = tech?.type === "reflex" || tech?.category === "reflex";
  const defaultMultiplier = Math.max(1, Number(isReflex ? 2 : (tech?.costMultiplier || 1)));
  const normalized = tokens
    .map((t) => (typeof t === "string" ? { sym: t, mult: defaultMultiplier } : {
      sym: t?.sym,
      mult: Math.max(1, Number(t?.doubled ? 2 : (t?.multiplier || defaultMultiplier)))
    }))
    .filter((t) => !!t.sym)
    .map((t) => ({ sym: normalizeSymbolKey(t.sym), mult: t.mult }))
    .filter((t) => !!t.sym);

  const len = Math.max(1, normalized.length);
  let totalEnergyCost = 0;
  let off = 0;
  let def = 0;
  let evd = 0;
  let eco = 0;
  let ctrl = 0;

  for (const tok of normalized) {
    const sym = tok.sym;
    const defMeta = resolveSymbolMeta(sym) || symbols[sym] || { cost: 1 };
    const impact = SYMBOL_IMPACT[sym] || {};
    const mult = Math.max(1, Number(tok.mult || 1));
    totalEnergyCost += Math.max(0, Number(defMeta.cost || 0)) * mult;
    off += Number(impact.off || 0);
    def += Number(impact.def || 0);
    evd += Number(impact.evd || 0);
    eco += Number(impact.eco || 0);
    ctrl += Number(impact.ctr || 0);
  }

  const offensePer10 = Number(((off / len) * 10).toFixed(2));
  const defensePer10 = Number(((def / len) * 10).toFixed(2));
  const evasionPer10 = Number(((evd / len) * 10).toFixed(2));
  const economyPer10 = Number(((eco / len) * 10).toFixed(2));
  const controlPer10 = Number(((ctrl / len) * 10).toFixed(2));
  const normalizedCostPer10 = Number(((totalEnergyCost / len) * 10).toFixed(2));
  const powerPer10 = Number((offensePer10 + defensePer10 * 0.75 + evasionPer10 * 0.75 + economyPer10 * 0.6 + controlPer10 * 0.5).toFixed(2));
  const efficiency = Number((powerPer10 / Math.max(1, normalizedCostPer10)).toFixed(2));
  const estimatedDamagePerTurn = Number((offensePer10 + controlPer10 * 0.25).toFixed(2));

  const profile = [offensePer10, defensePer10, evasionPer10, economyPer10];
  const profileSum = Math.max(0.0001, profile.reduce((a, b) => a + b, 0));
  const normalizedProfile = {
    off: offensePer10 / profileSum,
    def: defensePer10 / profileSum,
    evd: evasionPer10 / profileSum,
    eco: economyPer10 / profileSum
  };
  const expected = expectedCategoryWeights(tech?.category);
  const profileDelta = Math.abs(normalizedProfile.off - expected.off)
    + Math.abs(normalizedProfile.def - expected.def)
    + Math.abs(normalizedProfile.evd - expected.evd)
    + Math.abs(normalizedProfile.eco - expected.eco);
  const spreadPenalty = Math.min(1, stdDev(profile) / Math.max(0.0001, average(profile)));
  const balanceIndex = Number(Math.max(0, Math.min(100, 100 - (profileDelta * 45) - (spreadPenalty * 20))).toFixed(1));

  return {
    totalEnergyCost,
    totalCost: totalEnergyCost,
    estimatedDamagePerTurn,
    dpt: estimatedDamagePerTurn,
    offensePer10,
    defensePer10,
    evasionPer10,
    economyPer10,
    controlPer10,
    normalizedCostPer10,
    powerPer10,
    efficiency,
    balanceIndex
  };
}

function findHighImpactTokenIndex(tokens) {
  const priority = ["FINAL", "<>", "!", "~", "X", "BULWARK", "PARRY", "ROLL", "FEINT"];
  for (const sym of priority) {
    const idx = tokens.lastIndexOf(sym);
    if (idx >= 0) return idx;
  }
  return -1;
}

function findLowImpactTokenIndex(tokens) {
  const priority = ["O", "ITEM", "?", "v", "GUARD", "FEINT"];
  for (const sym of priority) {
    const idx = tokens.indexOf(sym);
    if (idx >= 0) return idx;
  }
  return -1;
}

export function rebalanceTechnique(tech, symbols) {
  const tokensRaw = (Array.isArray(tech?.symbols)
    ? [...tech.symbols]
    : [...(tech?.tokens || [])].map((t) => (typeof t === "string" ? t : t?.sym)).filter(Boolean))
    .map((s) => normalizeSymbolKey(s))
    .filter(Boolean);
  const tokens = normalizeTechniqueLength(tokensRaw, tech);
  if (!tokens.length) return { ...tech, symbols: tokens };

  const upperLower = targetEfficiencyRange(tech);
  const loopCount = tech?.type === "reflex" || tech?.category === "reflex" ? 1 : 2;
  for (let i = 0; i < loopCount; i += 1) {
    const stats = computeTechniqueStats({ ...tech, symbols: tokens }, symbols);
    if (stats.efficiency > upperLower.max) {
      const idx = findHighImpactTokenIndex(tokens);
      if (idx >= 0) tokens[idx] = replacementForCategory(tech?.category, "down");
    } else if (stats.efficiency < upperLower.min) {
      const idx = findLowImpactTokenIndex(tokens);
      if (idx >= 0) tokens[idx] = replacementForCategory(tech?.category, "up");
    } else {
      break;
    }
  }

  return { ...tech, symbols: normalizeTechniqueLength(tokens.filter(Boolean), tech) };
}

export function buildBalancedTechniques(techniques, symbols) {
  return (techniques || []).map((tech) => {
    const rebalanced = rebalanceTechnique(tech, symbols);
    const seq = normalizeTechniqueLength(Array.isArray(rebalanced.symbols) ? [...rebalanced.symbols] : [], rebalanced);
    const tokens = seq.map((sym) => ({ sym }));
    return { ...rebalanced, seq, tokens, ...computeTechniqueStats(rebalanced, symbols) };
  });
}

export function buildComputedTechniques(techniques, symbols) {
  return (techniques || []).map((tech) => {
    const tokensRaw = (Array.isArray(tech?.symbols)
      ? [...tech.symbols]
      : [...(tech?.tokens || [])].map((t) => (typeof t === "string" ? t : t?.sym)).filter(Boolean))
      .map((s) => normalizeSymbolKey(s))
      .filter(Boolean);
    const seq = normalizeTechniqueLength(tokensRaw, tech);
    const computed = { ...tech, symbols: seq };
    const tokens = seq.map((sym) => ({ sym }));
    return { ...computed, seq, tokens, ...computeTechniqueStats(computed, symbols) };
  });
}
