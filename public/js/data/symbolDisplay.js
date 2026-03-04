import { SYMBOLS_V6_UI, normalizeSymbolKey, resolveDisplaySymbol } from "./symbolsV6.js";

const DISPLAY_MAP = new Map();
for (const item of SYMBOLS_V6_UI || []) {
  if (!item?.key) continue;
  DISPLAY_MAP.set(item.key, item.symbol || item.key);
}

export function toDisplaySymbol(sym) {
  if (!sym || typeof sym !== "string") return sym;
  const key = normalizeSymbolKey(sym);
  if (DISPLAY_MAP.has(key)) return DISPLAY_MAP.get(key);
  const resolved = resolveDisplaySymbol(sym);
  return resolved || sym;
}

export function formatSymbolSeqInline(seq) {
  if (!Array.isArray(seq) || seq.length === 0) return "-";
  return seq.map((x) => {
    const sym = typeof x === "string" ? x : x?.sym;
    return toDisplaySymbol(sym || "-");
  }).join(" ");
}
