import { toDisplaySymbol } from "../data/symbolDisplay.js";

export function normalizeToken(raw) {
  if (!raw) return null;
  if (typeof raw === "string") {
    return { prefixes: [], sym: raw, suffixes: [], doubled: false };
  }
  const sym = typeof raw.sym === "string" ? raw.sym : null;
  if (!sym) return null;
  return {
    prefixes: Array.isArray(raw.prefixes) ? raw.prefixes.filter((x) => typeof x === "string") : [],
    sym,
    suffixes: Array.isArray(raw.suffixes) ? raw.suffixes.filter((x) => typeof x === "string") : [],
    doubled: !!raw.doubled,
    multiplier: Number(raw.multiplier || 0) || 0
  };
}

export function tokenMultiplier(token) {
  const tok = normalizeToken(token);
  if (!tok) return 1;
  if (tok.multiplier >= 3) return 3;
  if (tok.multiplier === 2) return 2;
  if (tok.doubled) return 2;
  return 1;
}

function wrapByMultiplier(body, mult) {
  // V6 grammar: braces are used for Air-played symbols.
  if (mult >= 3) return `{${body}}`;
  return body;
}

export function formatToken(token) {
  const tok = normalizeToken(token);
  if (!tok || !tok.sym) return "-";
  const body = `${tok.prefixes.join("")}${toDisplaySymbol(tok.sym)}${tok.suffixes.join("")}`;
  return wrapByMultiplier(body, tokenMultiplier(tok));
}

export function getTechniqueTokens(technique) {
  if (!technique) return [];
  if (Array.isArray(technique.tokens) && technique.tokens.length) {
    return technique.tokens.map(normalizeToken).filter(Boolean);
  }
  if (Array.isArray(technique.symbols) && technique.symbols.length) {
    return technique.symbols.map((sym) => normalizeToken(sym)).filter(Boolean);
  }
  if (Array.isArray(technique.seq) && technique.seq.length) {
    return technique.seq.map((sym) => normalizeToken(sym)).filter(Boolean);
  }
  return [];
}

export function renderTokenBlocks(tokens, { maxBlocks = Infinity } = {}) {
  const list = Array.isArray(tokens) ? tokens.map(normalizeToken).filter(Boolean) : [];
  const blocks = [];
  let i = 0;
  while (i < list.length) {
    if (blocks.length >= maxBlocks) break;
    const tok = list[i];
    const mult = tokenMultiplier(tok);
    if (mult === 1) {
      blocks.push(formatToken(tok));
      i += 1;
      continue;
    }
    let body = "";
    while (i < list.length && tokenMultiplier(list[i]) === mult) {
      const dt = list[i];
      body += `${dt.prefixes.join("")}${toDisplaySymbol(dt.sym)}${dt.suffixes.join("")}`;
      i += 1;
    }
    blocks.push(wrapByMultiplier(body, mult));
  }
  return blocks;
}

export function formatTechniqueSequence(tokens, { techType = "normal", maxBlocks = Infinity } = {}) {
  const list = Array.isArray(tokens) ? tokens.map(normalizeToken).filter(Boolean) : [];
  if (!list.length) return "(vide)";

  // Reflex wrapper denotes reflex sequence. Keep token display neutral inside.
  const normalizedForDisplay = techType === "reflex"
    ? list.map((tok) => {
      const mult = tokenMultiplier(tok);
      if (mult === 2 || mult >= 3) return { ...tok, doubled: false, multiplier: 1 };
      return tok;
    })
    : list;

  const body = renderTokenBlocks(normalizedForDisplay, { maxBlocks }).join(" ");
  if (techType === "reflex") return `[${body}]`;
  return `(${body})`;
}
