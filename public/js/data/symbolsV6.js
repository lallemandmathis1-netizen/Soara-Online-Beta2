// Source metier officielle: docs/SOARA_V6_Table_Symboles.docx
// Ce fichier est l'unique reference runtime pour couts et multiplicateurs.
export const SYMBOLS_V6 = {
  X: { cost: 1, type: "attack", atkDice: 1, atkFactor: 1 },
  "<>": { cost: 3, type: "attack", atkDice: 3, atkFactor: 3 },
  FINAL: { cost: 3, type: "attack", atkDice: 3, atkFactor: 3, parryOnly: true },
  "!": { cost: 2, type: "attack", atkDice: 2, atkFactor: 2, interruptOnHit: true },
  "~": { cost: 2, type: "attack", atkDice: 2, atkFactor: 2, applyVulnerableOnHit: true },
  GUARD: { cost: 1, type: "defense", defDice: 1, defFactor: 1 },
  BULWARK: { cost: 3, type: "defense", defDice: 3, defFactor: 3 },
  PARRY: { cost: 2, type: "defense", defDice: 1, defFactor: 1, counterAtk: 1, counterAtkCapMultiplier: 2 },
  // Legacy aliases kept for backward compatibility.
  "[]": { cost: 1, type: "defense", defDice: 1, defFactor: 1 },
  "()": { cost: 3, type: "defense", defDice: 3, defFactor: 3 },
  "||": { cost: 2, type: "defense", defDice: 1, defFactor: 1, counterAtk: 1, counterAtkCapMultiplier: 2 },
  FEINT: { cost: 2, type: "evasion", esqDice: 2, esqFactor: 2, special: "copyLast" },
  ROLL: { cost: 3, type: "evasion", esqDice: 2, esqFactor: 2 },
  O: { cost: 0, type: "economy", energyGain: 1 },
  AURA: { cost: 0, type: "economy", energyGain: 2, rare: true },
  ITEM: { cost: 0, type: "economy", specialAction: true, noDamage: true },
  "?": { cost: 0, type: "economy", revealNext: true },
  "^": { cost: 2, type: "move", airborne: true, esqDice: 1, esqFactor: 1 },
  v: { cost: 0, type: "move", land: true },
  VULN: { cost: 0, type: "state", selfVulnerable: true }
};

export const BASE_ALLOWED_SYMBOLS = ["X", "GUARD", "BULWARK", "PARRY", "FEINT", "ROLL", "O", "?", "^", "v", "VULN"];

function uiCost(key) {
  return Number(SYMBOLS_V6[key]?.cost ?? 0);
}

export const SYMBOLS_V6_UI = [
  { key: "O", symbol: "O", name: "Respiration", cost: uiCost("O"), effect: "+1 energie, sans jet." },
  { key: "AURA", symbol: "\u25C9", name: "Aura", cost: uiCost("AURA"), effect: "+2 energie, rare." },
  { key: "?", symbol: "\u2299", name: "Observation", cost: uiCost("?"), effect: "Revele le prochain symbole cible (1 tour)." },
  { key: "ITEM", symbol: "\u25CF", name: "Action speciale", cost: uiCost("ITEM"), effect: "Utilise potion/objet, consomme le tour." },
  { key: "X", symbol: "X", name: "Attaque legere", cost: uiCost("X"), effect: "Degats fixes: 1xATK." },
  { key: "<>", symbol: "\u2297", name: "Attaque lourde", cost: uiCost("<>"), effect: "Degats fixes: 3xATK." },
  { key: "FINAL", symbol: "\u2605", name: "Attaque finale", cost: uiCost("FINAL"), effect: "Degats fixes: 3xATK, bloquable par parade uniquement." },
  { key: "!", symbol: "\u2727", name: "Attaque destabil.", cost: uiCost("!"), effect: "Degats fixes: 2xATK. Si touche: interruption technique adverse." },
  { key: "~", symbol: "\u2726", name: "Attaque malicieuse", cost: uiCost("~"), effect: "Degats fixes: 2xATK. Si touche: applique Vulnerable." },
  { key: "GUARD", symbol: "\u25A1", name: "Garde legere", cost: uiCost("GUARD"), effect: "Facteur defense x1." },
  { key: "BULWARK", symbol: "\u25A3", name: "Garde lourde", cost: uiCost("BULWARK"), effect: "Facteur defense x3." },
  { key: "PARRY", symbol: "\u25B3", name: "Parade", cost: uiCost("PARRY"), effect: "Annule l'attaque et renvoie jusqu'a 2xATK." },
  { key: "FEINT", symbol: "\u2194", name: "Feinte", cost: uiCost("FEINT"), effect: "Copie visuelle du dernier move, resolu en esquive x2." },
  { key: "ROLL", symbol: "\u27F2", name: "Roulade", cost: uiCost("ROLL"), effect: "Facteur esquive x2." },
  { key: "^", symbol: "\u2191", name: "Saut", cost: uiCost("^"), effect: "Passe en Air + facteur esquive x1." },
  { key: "v", symbol: "\u21D3", name: "Retombee", cost: uiCost("v"), effect: "Sort de l'etat Air." },
  { key: "VULN", symbol: "\u26A0", name: "Vulnerable", cost: uiCost("VULN"), effect: "L'entite qui le joue recoit x2 degats ce tour." }
].filter((entry) => !!SYMBOLS_V6[entry.key]);

// Legacy aliases coming from older saves / placeholders.
const SYMBOL_ALIASES = {
  G1: "GUARD",
  G2: "BULWARK",
  G3: "PARRY",
  DEF1: "GUARD",
  DEF2: "BULWARK",
  DEF3: "PARRY",
  "[]": "GUARD",
  "()": "BULWARK",
  "||": "PARRY",
  DODGE: "ROLL",
  AIR_UP: "^",
  AIR_DOWN: "v",
  VULNERABLE: "VULN"
};

const UI_BY_KEY = new Map((SYMBOLS_V6_UI || []).map((s) => [s.key, s]));
const KEY_BY_SYMBOL = new Map(
  (SYMBOLS_V6_UI || [])
    .filter((s) => typeof s?.symbol === "string" && s.symbol.length > 0)
    .map((s) => [s.symbol, s.key])
);

export function normalizeSymbolKey(raw) {
  if (!raw || typeof raw !== "string") return raw;
  if (SYMBOLS_V6[raw]) return raw;
  if (SYMBOL_ALIASES[raw]) return SYMBOL_ALIASES[raw];
  const bySymbol = KEY_BY_SYMBOL.get(raw);
  if (bySymbol) return bySymbol;
  return raw;
}

export function resolveSymbolMeta(raw) {
  const key = normalizeSymbolKey(raw);
  return SYMBOLS_V6[key] || null;
}

export function resolveDisplaySymbol(raw) {
  const key = normalizeSymbolKey(raw);
  const ui = UI_BY_KEY.get(key);
  if (ui?.symbol) return ui.symbol;
  return raw;
}

