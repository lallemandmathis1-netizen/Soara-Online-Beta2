import { SYMBOLS_V6 } from "./symbolsV6.js";
import { buildComputedTechniques } from "../features/techBalance.js";

function normalizeTechniques(items, tier) {
  if (!Array.isArray(items)) return [];
  const safeTier = String(tier || "base").toLowerCase();
  const out = [];
  for (const item of items) {
    const id = String(item?.id || "").trim();
    const name = String(item?.name || "").trim();
    const symbols = Array.isArray(item?.symbols)
      ? item.symbols.map((s) => String(s)).filter(Boolean)
      : (Array.isArray(item?.seq) ? item.seq.map((s) => String(s)).filter(Boolean) : []);
    if (!id || !name || !symbols.length) continue;
    out.push({
      id,
      name,
      tier: safeTier,
      rarity: String(item?.rarity || "common").toLowerCase(),
      category: String(item?.category || "mixed").toLowerCase(),
      symbols,
      description: String(item?.description || ""),
      utility: String(item?.utility || ""),
      drawback: String(item?.drawback || "")
    });
  }
  return out;
}

function normalizeReflexes(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (const item of items) {
    const id = String(item?.id || "").trim();
    const name = String(item?.name || "").trim();
    const symbols = Array.isArray(item?.symbols)
      ? item.symbols.map((s) => String(s)).filter(Boolean)
      : (Array.isArray(item?.seq) ? item.seq.map((s) => String(s)).filter(Boolean) : []);
    if (!id || !name || !symbols.length) continue;
    out.push({
      id,
      name,
      category: "reflex",
      symbols,
      costMultiplier: Math.max(1, Number(item?.costMultiplier || 2)),
      description: String(item?.description || ""),
      utility: String(item?.utility || ""),
      drawback: String(item?.drawback || "")
    });
  }
  return out;
}

function buildBalancedNormalTechniques(techniquesByTier) {
  const base = normalizeTechniques(techniquesByTier?.base, "base");
  const advanced = normalizeTechniques(techniquesByTier?.advanced, "advanced");
  const expert = normalizeTechniques(techniquesByTier?.expert, "expert");
  const merged = [...base, ...advanced, ...expert];
  if (!merged.length) return [];
  return buildComputedTechniques(merged, SYMBOLS_V6).map((t) => ({
    ...t,
    category: t.category || "mixed",
    type: "normal"
  }));
}

function buildBalancedReflexes(reflexes) {
  const normalized = normalizeReflexes(reflexes);
  if (!normalized.length) return [];
  return buildComputedTechniques(normalized, SYMBOLS_V6).map((t) => ({
    ...t,
    type: "reflex",
    doubledCost: true,
    tokens: (t.tokens || []).map((tok) => ({ ...tok, doubled: true }))
  }));
}

export function buildRuntimeCatalogue({ techniques = null, reflexes = [] } = {}) {
  const runtimeNormal = buildBalancedNormalTechniques(techniques || {});
  const runtimeReflexes = buildBalancedReflexes(reflexes || []);
  return [...runtimeNormal, ...runtimeReflexes];
}

// Catalogue is runtime-only and sourced from /public/data/techniques.
export const TECH_CATALOGUE = [];

export function buildCatalogueMap(catalogue = TECH_CATALOGUE) {
  return new Map((Array.isArray(catalogue) ? catalogue : []).map((t) => [t.id, t]));
}

export function getTechById(id, catalogue = TECH_CATALOGUE) {
  if (!id) return null;
  return buildCatalogueMap(catalogue).get(id) || null;
}

export function isReflex(id, catalogue = TECH_CATALOGUE) {
  const tech = getTechById(id, catalogue);
  return !!tech && tech.type === "reflex";
}
