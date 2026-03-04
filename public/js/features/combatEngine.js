import { formatToken, getTechniqueTokens, normalizeToken } from "./tokenModel.js";
import { normalizeSymbolKey, resolveSymbolMeta } from "../data/symbolsV6.js";
import { computeResolution as computeResolutionCore } from "./resolutionSandbox.js";

export const SYMBOLS = {
  O: { cat: "economy", cost: 0, bonusEnergy: 1, noRoll: true },
  AURA: { cat: "economy", cost: 0, bonusEnergy: 2, rare: true, noRoll: true },
  "?": { cat: "economy", cost: 0, observe: true, noDamage: true },
  ITEM: { cat: "economy", cost: 0, specialAction: true, noDamage: true },
  X: { cat: "attack", cost: 1, atkDice: 1 },
  "<>": { cat: "attack", cost: 3, atkDice: 3, label: "heavy" },
  FINAL: { cat: "attack", cost: 3, atkDice: 3, parryOnly: true },
  "!": { cat: "attack", cost: 2, atkDice: 2, interruptOnHit: true },
  "~": { cat: "attack", cost: 2, atkDice: 2, applyVulnerableOnHit: true },
  GUARD: { cat: "defense", cost: 1, defDice: 1 },
  BULWARK: { cat: "defense", cost: 3, defDice: 3 },
  PARRY: { cat: "defense", cost: 2, defDice: 1, parry: true, counterAtkDiceOnParry: 1, counterAtkCapMultiplier: 2 },
  // Legacy defense aliases.
  "[]": { cat: "defense", cost: 1, defDice: 1 },
  "()": { cat: "defense", cost: 3, defDice: 3 },
  "||": { cat: "defense", cost: 2, defDice: 1, parry: true, counterAtkDiceOnParry: 1, counterAtkCapMultiplier: 2 },
  FEINT: { cat: "dodge", cost: 2, esqDice: 2, copyLastMove: true },
  ROLL: { cat: "dodge", cost: 3, esqDice: 2, reinforced: true },
  "^": { cat: "move", cost: 2, esqDice: 1, enterAir: true },
  "^^": { cat: "move", cost: 3, esqDice: 2, enterAir: true },
  v: { cat: "move", cost: 0, exitAir: true, addRemainingEsqToDamage: true },
  VULN: { cat: "state", cost: 0, selfVulnerable: true, noDamage: true }
};

export function getTechniqueById(techniques, id) {
  return (techniques || []).find((t) => t.id === id) || null;
}

export function nextSymbol(techniques, ent) {
  const tech = getTechniqueById(techniques, ent.techId);
  const tokens = getTechniqueTokens(tech);
  if (!tokens.length) return null;
  return tokens[ent.step]?.sym || null;
}

export function applyRegen(ent) {
  ent.energy = Math.min(ent.energyMax, ent.energy + (ent.regen || 0));
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function tokenCost(sym, multiplier = 1) {
  if (!sym) return 0;
  const key = normalizeSymbolKey(sym);
  const base = Number(SYMBOLS[key]?.cost ?? resolveSymbolMeta(key)?.cost ?? 1);
  const mult = Math.max(1, Number(multiplier || 1));
  return Math.max(0, base * mult);
}

function prefixCost(prefixes) {
  const list = Array.isArray(prefixes) ? prefixes : [];
  let bonus = 0;
  for (const p of list) {
    if (p === "//") bonus += 2;
    else if (p === "/" || p === ">" || p === "↓") bonus += 1;
  }
  return bonus;
}

function normalizeEntity(input, fallbackName) {
  const energyMaxRaw = Number(input?.energyMax ?? 4);
  const energyMax = Number.isFinite(energyMaxRaw) ? Math.max(1, Math.min(energyMaxRaw, 12)) : 4;
  const energyRaw = Number(input?.energy ?? energyMax);
  const energy = Number.isFinite(energyRaw) ? Math.max(0, Math.min(energyRaw, energyMax)) : energyMax;
  return {
    name: input?.name || fallbackName,
    hp: Number(input?.hp ?? 30),
    hpMax: Number(input?.hpMax ?? 30),
    energy,
    energyMax,
    regen: Number(input?.regen ?? 1),
    atkStat: Math.max(0, Number(input?.atkStat ?? 1)),
    defStat: Math.max(0, Number(input?.defStat ?? 1)),
    esqStat: Math.max(0, Number(input?.esqStat ?? 1)),
    flatReduce: Number(input?.flatReduce ?? 0),
    techId: input?.techId || null,
    pendingTechId: input?.pendingTechId || null,
    step: Number(input?.step ?? 0),
    forcedNextSymbol: null,
    cancelAfterSymbol: false,
    states: {
      airborne: !!input?.states?.airborne,
      vulnerable: !!input?.states?.vulnerable,
      observed: false
    },
    observedEnemyNext: null,
    lastSymbols: [],
    lastTokens: [],
    lastTokenObjects: [],
    currentToken: null,
    validatedMove: null
  };
}

function classifySymbol(sym) {
  const key = normalizeSymbolKey(sym);
  const def = SYMBOLS[key] || resolveSymbolMeta(key);
  if (def) {
    return {
      kind: def.cat === "move" ? "economy" : def.cat,
      respiration: !!def.bonusEnergy,
      observation: !!def.observe,
      atkFactor: Number(def.atkFactor ?? def.atkDice ?? 0),
      defFactor: Number(def.defFactor ?? def.defDice ?? 0),
      esqFactor: Number(def.esqFactor ?? def.esqDice ?? 0),
      applyVulnerableOnHit: !!def.applyVulnerableOnHit,
      interruptOnHit: !!def.interruptOnHit,
      parry: !!def.parry,
      parryOnly: !!def.parryOnly,
      selfVulnerable: !!def.selfVulnerable
    };
  }
  return { kind: "economy", atkFactor: 0, defFactor: 0, esqFactor: 0 };
}

function isSelfVulnerableSymbol(sym) {
  const key = String(normalizeSymbolKey(sym) || "").toUpperCase();
  return key === "VULN" || key === "VULNERABLE";
}

function containsSuffix(token, value) {
  return !!token?.suffixes?.includes?.(value);
}

function isAirStartSymbol(sym) {
  const key = normalizeSymbolKey(sym);
  return key === "^";
}

function isAirEndSymbol(sym) {
  const key = normalizeSymbolKey(sym);
  return key === "v";
}

function tokenMultiplierForMove(entity, token, profile, isReflex = false) {
  const forcedTriple = Number(token?.multiplier || 0) >= 3;
  const tokenForcedDouble = !!token?.doubled;
  const airborneWindow = !!entity.states.airborne && !isAirStartSymbol(token?.sym) && !isAirEndSymbol(token?.sym);
  const airborneAttack = airborneWindow && profile?.kind === "attack";
  const airborneReflex = airborneWindow && !!isReflex;
  if (forcedTriple || airborneAttack || airborneReflex) return 3;
  if (isReflex || tokenForcedDouble) return 2;
  return 1;
}

function applyAirborneTransition(entity, sym) {
  if (isAirStartSymbol(sym)) entity.states.airborne = true;
  if (isAirEndSymbol(sym)) entity.states.airborne = false;
}

function consumeTechniqueSymbol(entity, techniques) {
  if (entity.forcedNextSymbol) {
    const forced = entity.forcedNextSymbol;
    entity.forcedNextSymbol = null;
    const forcedToken = normalizeToken({ sym: forced });
    return {
      token: forcedToken,
      sym: forcedToken.sym,
      techStart: false,
      techEnd: false,
      techId: null,
      fromTechnique: false
    };
  }

  if (!entity.techId && entity.pendingTechId) {
    entity.techId = entity.pendingTechId;
    entity.pendingTechId = null;
    entity.step = 0;
  }

  if (!entity.techId) {
    const defaultToken = normalizeToken({ sym: "O" });
    return {
      token: defaultToken,
      sym: defaultToken.sym,
      techStart: false,
      techEnd: false,
      techId: null,
      fromTechnique: false
    };
  }

  const tech = getTechniqueById(techniques, entity.techId);
  const techTokens = getTechniqueTokens(tech);
  if (!tech || !techTokens.length) {
    const oldId = entity.techId;
    entity.techId = null;
    entity.step = 0;
    const defaultToken = normalizeToken({ sym: "O" });
    return {
      token: defaultToken,
      sym: defaultToken.sym,
      techStart: false,
      techEnd: false,
      techId: oldId,
      fromTechnique: false
    };
  }

  const techStart = entity.step === 0;
  const idx = entity.step;
  const baseToken = normalizeToken(techTokens[idx]);
  if (!baseToken) {
    entity.techId = null;
    entity.step = 0;
    const defaultToken = normalizeToken({ sym: "O" });
    return {
      token: defaultToken,
      sym: defaultToken.sym,
      techStart: false,
      techEnd: false,
      techId: tech.id,
      fromTechnique: false
    };
  }
  const token = normalizeToken(baseToken);
  const sym = token.sym;
  entity.step += 1;

  let techEnd = false;
  if (entity.step >= techTokens.length || containsSuffix(token, "!") || containsSuffix(token, ")")) {
    techEnd = true;
    entity.techId = null;
    entity.step = 0;
  }

  return { token, sym, techStart, techEnd, techId: tech.id, fromTechnique: true };
}

function pushLastSymbol(entity, sym, token = null) {
  if (!sym && !token) return;
  if (sym) entity.lastSymbols.push(sym);
  entity.lastSymbols = entity.lastSymbols.slice(-12);
  if (token) {
    entity.lastTokens.push(formatToken(token));
    entity.lastTokens = entity.lastTokens.slice(-12);
    entity.lastTokenObjects.push(clone(token));
    entity.lastTokenObjects = entity.lastTokenObjects.slice(-12);
  }
}

export function createCombatSessionV6({ playerName, enemyName, techniques, playerMeta }) {
  const techs = Array.isArray(techniques) ? techniques : [];
  const byId = new Map(techs.map((t) => [t.id, t]));

  function registerTechnique(tech) {
    if (!tech?.id) return false;
    if (byId.has(tech.id)) return true;
    const normalized = {
      ...tech,
      tokens: getTechniqueTokens(tech)
    };
    byId.set(normalized.id, normalized);
    techs.push(normalized);
    return true;
  }

  const basePlayer = normalizeEntity({
    name: playerName || "Vous",
    hp: playerMeta?.hp ?? 34,
    hpMax: playerMeta?.hpMax ?? 34,
    energy: playerMeta?.energy ?? 4,
    energyMax: playerMeta?.energyMax ?? 4,
    regen: playerMeta?.energyRegen ?? 1,
    atkStat: playerMeta?.atkStat ?? 1,
    defStat: playerMeta?.defStat ?? 1,
    esqStat: playerMeta?.esqStat ?? 1,
    flatReduce: playerMeta?.flatReduce ?? 0
  }, "Vous");

  const baseEnemy = normalizeEntity({
    name: enemyName || "Ennemi",
    hp: 34,
    hpMax: 34,
    energy: 4,
    energyMax: 4,
    regen: 1,
    atkStat: 1,
    defStat: 1,
    esqStat: 1,
    flatReduce: 0
  }, "Ennemi");

  function nextInitiative() {
    // Initiative keeps a random roll. Resolution itself remains deterministic.
    return 1 + Math.floor(Math.random() * 20);
  }

  const firstBase = techs.find((t) => getTechniqueTokens(t).length > 0 && t?.type !== "reflex" && t?.category !== "reflex")?.id
    || techs.find((t) => getTechniqueTokens(t).length > 0)?.id
    || null;
  basePlayer.techId = null;
  baseEnemy.techId = firstBase;

  const state = {
    turn: 1,
    initiative: { player: nextInitiative(), enemy: nextInitiative() },
    player: basePlayer,
    enemy: baseEnemy
  };

  function pickDefaultTechniqueId(entity) {
    if (entity === state.player) {
      if (byId.has("beta_t1")) return "beta_t1";
      if (byId.has("t1")) return "t1";
    }
    const firstKnown = techs.find((t) => getTechniqueTokens(t).length > 0 && t?.type !== "reflex" && t?.category !== "reflex")
      || techs.find((t) => getTechniqueTokens(t).length > 0)
      || null;
    return firstKnown?.id || null;
  }

  function setPendingTechniqueForPlayer(techId) {
    if (!byId.has(techId)) return false;
    state.player.pendingTechId = techId;
    return true;
  }

  function ensureTechniqueForEntity(entityKey) {
    const ent = entityKey === "enemy" ? state.enemy : state.player;
    if (ent.techId) return ent.techId;
    if (ent.pendingTechId && byId.has(ent.pendingTechId)) {
      ent.techId = ent.pendingTechId;
      ent.pendingTechId = null;
      ent.step = 0;
      return ent.techId;
    }
    const fallbackId = pickDefaultTechniqueId(ent);
    if (fallbackId && byId.has(fallbackId)) {
      ent.techId = fallbackId;
      ent.step = 0;
      return ent.techId;
    }
    return null;
  }

  function requestPlayerCancel() {
    state.player.cancelAfterSymbol = true;
  }

  function forceTechniqueInterrupt(target) {
    target.techId = null;
    target.step = 0;
    target.forcedNextSymbol = "O";
  }

  // Single source of truth for per-turn energy update.
  function updateEnergyForTurn(entity, move, multiplier, skipPay = false) {
    const cost = tokenCost(move.sym, multiplier) + prefixCost(move.prefixes);
    if (!skipPay && move.sym && entity.energy < cost) return { ok: false, cost };
    if (!skipPay) entity.energy = clamp(entity.energy - cost, 0, entity.energyMax);
    if (!skipPay && move.sym === "O") entity.energy = clamp(entity.energy + 1, 0, entity.energyMax);
    return { ok: true, cost };
  }

  function previewCurrentTokenForEntity(entityKey) {
    const ent = entityKey === "enemy" ? state.enemy : state.player;
    let techId = ent.techId;
    if (!techId && ent.pendingTechId) techId = ent.pendingTechId;
    const tech = getTechniqueById(techs, techId);
    const tokens = getTechniqueTokens(tech);
    if (!tokens.length) return { techId: null, sym: "O", prefixes: [], suffixes: [], doubled: false, multiplier: 1 };
    const idx = ent.techId ? ent.step : 0;
    const baseToken = normalizeToken(tokens[idx]);
    if (!baseToken) return { techId: null, sym: "O", prefixes: [], suffixes: [], doubled: false, multiplier: 1 };
    const out = normalizeToken(baseToken);
    const profile = classifySymbol(out.sym);
    const isReflex = tech?.type === "reflex" || tech?.category === "reflex";
    out.multiplier = tokenMultiplierForMove(ent, out, profile, isReflex);
    out.doubled = out.multiplier === 2;
    return { techId: tech?.id || null, ...out };
  }

  function payEnergyNow(entityKey, token) {
    const ent = entityKey === "enemy" ? state.enemy : state.player;
    const mult = Number(token?.multiplier || 0) || (token?.doubled ? 2 : 1);
    const cost = tokenCost(token?.sym, mult) + prefixCost(token?.prefixes);
    if (cost > 0) {
      if (ent.energy < cost) return { ok: false, cost };
      ent.energy = clamp(ent.energy - cost, 0, ent.energyMax);
    }
    if (token?.sym === "O") ent.energy = clamp(ent.energy + 1, 0, ent.energyMax);
    return { ok: true, cost };
  }

  function validateEntityAction(entityKey) {
    const ent = entityKey === "enemy" ? state.enemy : state.player;
    if (ent.validatedMove) return { ok: true, token: ent.currentToken, move: ent.validatedMove };

    ensureTechniqueForEntity(entityKey);
    const move = consumeTechniqueSymbol(ent, techs);
    if (!move?.sym) {
      ent.validatedMove = { ...move, sym: null, prefixes: [], suffixes: [], doubled: false, multiplier: 1 };
      return { ok: true, token: null, move: ent.validatedMove };
    }

    const baseToken = normalizeToken(move.token) || normalizeToken({ sym: move.sym });
    const profile = classifySymbol(move.sym);
    const techMeta = getTechniqueById(techs, move.techId);
    const isReflex = techMeta?.type === "reflex" || techMeta?.category === "reflex";
    const multiplier = tokenMultiplierForMove(ent, baseToken, profile, isReflex);
    const doubled = multiplier === 2;
    const prefixes = [...(baseToken?.prefixes || [])];
    const suffixes = [...(baseToken?.suffixes || [])];

    if (ent.cancelAfterSymbol && move.fromTechnique) {
      if (!suffixes.includes("!")) suffixes.push("!");
      ent.cancelAfterSymbol = false;
      move.techEnd = true;
      ent.techId = null;
      ent.step = 0;
    }

    const token = { prefixes, sym: move.sym, suffixes, doubled, multiplier };
    const pay = payEnergyNow(entityKey, token);
    if (!pay.ok) {
      forceTechniqueInterrupt(ent);
      ent.validatedMove = { ...move, sym: null, prefixes: [], suffixes: [], doubled, multiplier };
      return { ok: false, token: null, move: ent.validatedMove };
    }

    ent.currentToken = token;
    ent.validatedMove = {
      ...move,
      prefixes,
      suffixes,
      doubled,
      multiplier,
      techType: (move.fromTechnique && isReflex) ? "reflex" : "normal"
    };
    pushLastSymbol(ent, move.sym, token);
    applyAirborneTransition(ent, move.sym);
    ent.energy = clamp(ent.energy, 0, ent.energyMax);
    return { ok: true, token, move: ent.validatedMove };
  }

  function validateSpecialAction(entityKey, { sym = "ITEM", energyCost = 0, techType = "normal" } = {}) {
    const ent = entityKey === "enemy" ? state.enemy : state.player;
    if (ent.validatedMove) return { ok: true, token: ent.currentToken, move: ent.validatedMove };

    const spend = Math.max(0, Number(energyCost || 0));
    if (spend > 0) {
      if (ent.energy < spend) return { ok: false, token: null, move: null };
      ent.energy = clamp(ent.energy - spend, 0, ent.energyMax);
    }

    const baseToken = normalizeToken({ sym }) || normalizeToken({ sym: "O" });
    const token = {
      prefixes: [...(baseToken?.prefixes || [])],
      sym: baseToken?.sym || "O",
      suffixes: [...(baseToken?.suffixes || [])],
      doubled: false,
      multiplier: 1
    };

    ent.currentToken = token;
    ent.validatedMove = {
      token,
      sym: token.sym,
      prefixes: token.prefixes,
      suffixes: token.suffixes,
      doubled: false,
      multiplier: 1,
      techStart: false,
      techEnd: false,
      techId: null,
      fromTechnique: false,
      techType
    };
    pushLastSymbol(ent, token.sym, token);
    return { ok: true, token, move: ent.validatedMove };
  }

  function getSnapshot() {
    const pTech = getTechniqueById(techs, state.player.techId);
    const eTech = getTechniqueById(techs, state.enemy.techId);
    const pPending = getTechniqueById(techs, state.player.pendingTechId);
    const pNextTech = pTech || pPending || null;
    const pStartIdx = pTech ? state.player.step : 0;
    const pTokens = getTechniqueTokens(pNextTech);
    const pNextIsReflex = pNextTech?.type === "reflex" || pNextTech?.category === "reflex";
    const pNextTokens = pTokens.length
      ? pTokens.slice(pStartIdx).map((raw, localIdx) => {
        const tok = normalizeToken(raw);
        if (!tok) return "-";
        const profile = classifySymbol(tok.sym);
        tok.multiplier = tokenMultiplierForMove(state.player, tok, profile, pNextIsReflex);
        tok.doubled = tok.multiplier === 2;
        return formatToken(tok);
      })
      : [];
    const eTokens = getTechniqueTokens(eTech);
    const eNextIsReflex = eTech?.type === "reflex" || eTech?.category === "reflex";
    return clone({
      turn: state.turn,
      initiative: state.initiative,
      timerSeconds: Math.min(
        state.initiative.player ?? 20,
        state.initiative.enemy ?? 20
      ),
      player: {
        ...state.player,
        techName: pTech?.name || "-",
        pendingTechName: pPending?.name || "-",
        nextSymbols: pNextTokens,
        lastSymbols: state.player.lastTokens.slice(-12),
        lastTokenObjects: state.player.lastTokenObjects.slice(-12),
        currentToken: state.player.currentToken
      },
      enemy: {
        ...state.enemy,
        techName: eTech?.name || "-",
        nextSymbols: eTokens.slice(state.enemy.step).map((raw, localIdx) => {
          const tok = normalizeToken(raw);
          if (!tok) return "-";
          const profile = classifySymbol(tok.sym);
          tok.multiplier = tokenMultiplierForMove(state.enemy, tok, profile, eNextIsReflex);
          tok.doubled = tok.multiplier === 2;
          return formatToken(tok);
        }),
        lastSymbols: state.enemy.lastTokens.slice(-12),
        lastTokenObjects: state.enemy.lastTokenObjects.slice(-12),
        currentToken: state.enemy.currentToken
      }
    });
  }

  function advanceTurn({ auto = false, prepaid = { player: false, enemy: false } } = {}) {
    const narration = [];
    const entries = [];

    applyRegen(state.player);
    applyRegen(state.enemy);

    narration.push(
      `Init ${state.player.name}=${state.initiative.player} | ${state.enemy.name}=${state.initiative.enemy}${auto ? " [auto]" : ""}`
    );

    const pMove = state.player.validatedMove || consumeTechniqueSymbol(state.player, techs);
    const eMove = state.enemy.validatedMove || consumeTechniqueSymbol(state.enemy, techs);

    const pBaseToken = normalizeToken(pMove.token) || normalizeToken({ sym: pMove.sym });
    const eBaseToken = normalizeToken(eMove.token) || normalizeToken({ sym: eMove.sym });
    const pPrefixes = [...(pMove.prefixes || pBaseToken?.prefixes || [])];
    const pSuffixes = [...(pMove.suffixes || pBaseToken?.suffixes || [])];
    const ePrefixes = [...(eMove.prefixes || eBaseToken?.prefixes || [])];
    const eSuffixes = [...(eMove.suffixes || eBaseToken?.suffixes || [])];
    if (pMove.sym && pMove.fromTechnique && state.player.cancelAfterSymbol) {
      if (!pSuffixes.includes("!")) pSuffixes.push("!");
      state.player.cancelAfterSymbol = false;
      pMove.techEnd = true;
      state.player.techId = null;
      state.player.step = 0;
    }

    const pProfile = classifySymbol(pMove.sym);
    const eProfile = classifySymbol(eMove.sym);

    const pIsReflex = (getTechniqueById(techs, pMove.techId)?.type === "reflex") || (getTechniqueById(techs, pMove.techId)?.category === "reflex");
    const eIsReflex = (getTechniqueById(techs, eMove.techId)?.type === "reflex") || (getTechniqueById(techs, eMove.techId)?.category === "reflex");
    const pMultiplier = ("multiplier" in pMove)
      ? Math.max(1, Number(pMove.multiplier || 1))
      : tokenMultiplierForMove(state.player, pBaseToken, pProfile, pIsReflex);
    const eMultiplier = ("multiplier" in eMove)
      ? Math.max(1, Number(eMove.multiplier || 1))
      : tokenMultiplierForMove(state.enemy, eBaseToken, eProfile, eIsReflex);
    const pDoubled = pMultiplier === 2;
    const eDoubled = eMultiplier === 2;
    const pEnergy = state.player.validatedMove ? { ok: true, cost: 0 } : updateEnergyForTurn(state.player, pMove, pMultiplier, !!prepaid.player);
    const eEnergy = state.enemy.validatedMove ? { ok: true, cost: 0 } : updateEnergyForTurn(state.enemy, eMove, eMultiplier, !!prepaid.enemy);

    if (!pEnergy.ok && pMove.sym) {
      narration.push(`${state.player.name} manque d'energie: technique interrompue, O force au prochain tour.`);
      forceTechniqueInterrupt(state.player);
      pMove.sym = null;
    }

    if (!eEnergy.ok && eMove.sym) {
      narration.push(`${state.enemy.name} manque d'energie: technique interrompue, O force au prochain tour.`);
      forceTechniqueInterrupt(state.enemy);
      eMove.sym = null;
    }

    state.player.energy = clamp(state.player.energy, 0, state.player.energyMax);
    state.enemy.energy = clamp(state.enemy.energy, 0, state.enemy.energyMax);

    state.player.currentToken = pMove.sym ? {
      prefixes: pPrefixes,
      sym: pMove.sym,
      suffixes: pSuffixes,
      doubled: pDoubled,
      multiplier: pMultiplier
    } : null;
    state.enemy.currentToken = eMove.sym ? {
      prefixes: ePrefixes,
      sym: eMove.sym,
      suffixes: eSuffixes,
      doubled: eDoubled,
      multiplier: eMultiplier
    } : null;

    const pAtkTotal = Math.max(0, Number(pProfile.atkFactor || 0)) * Math.max(0, Number(state.player.atkStat || 0));
    const pMitigation = Math.max(0, Number(pProfile.defFactor || 0)) * Math.max(0, Number(state.player.defStat || 0));
    const eAtkTotal = Math.max(0, Number(eProfile.atkFactor || 0)) * Math.max(0, Number(state.enemy.atkStat || 0));
    const eMitigation = Math.max(0, Number(eProfile.defFactor || 0)) * Math.max(0, Number(state.enemy.defStat || 0));

    // Deterministic damage model (no dice):
    // FINAL ignores defense (armor still applies). Other attacks use defense + armor.
    const pIgnoreDefense = normalizeSymbolKey(pMove.sym) === "FINAL";
    const eIgnoreDefense = normalizeSymbolKey(eMove.sym) === "FINAL";
    let dmgToEnemy = pIgnoreDefense
      ? Math.max(0, pAtkTotal - Math.max(0, Number(state.enemy.flatReduce || 0)))
      : Math.max(0, pAtkTotal - eMitigation - Math.max(0, Number(state.enemy.flatReduce || 0)));
    let dmgToPlayer = eIgnoreDefense
      ? Math.max(0, eAtkTotal - Math.max(0, Number(state.player.flatReduce || 0)))
      : Math.max(0, eAtkTotal - pMitigation - Math.max(0, Number(state.player.flatReduce || 0)));
    const pEsqPower = Math.max(0, Number(pProfile.esqFactor || 0)) * Math.max(0, Number(state.player.esqStat || 0));
    const eEsqPower = Math.max(0, Number(eProfile.esqFactor || 0)) * Math.max(0, Number(state.enemy.esqStat || 0));
    const pSpentEnergy = Math.max(0, Number(state.player.validatedMove?.energyCost ?? pEnergy.cost ?? 0));
    const eSpentEnergy = Math.max(0, Number(state.enemy.validatedMove?.energyCost ?? eEnergy.cost ?? 0));
    const offensiveDuel = Number(pProfile.atkFactor || 0) > 0 && Number(eProfile.atkFactor || 0) > 0;

    // Parry deterministic rule:
    // if defender parries an attack, it returns:
    // min(incoming attack power, 2xATK of parrying entity).
    let parryReturnToEnemy = 0;
    let parryReturnToPlayer = 0;
    if (eProfile.parry && pAtkTotal > 0) {
      const enemyParryPower = 2 * Math.max(0, Number(state.enemy.atkStat || 0));
      parryReturnToPlayer = Math.min(enemyParryPower, pAtkTotal);
      dmgToEnemy = 0;
    }
    if (pProfile.parry && eAtkTotal > 0) {
      const playerParryPower = 2 * Math.max(0, Number(state.player.atkStat || 0));
      parryReturnToEnemy = Math.min(playerParryPower, eAtkTotal);
      dmgToPlayer = 0;
    }

    if (offensiveDuel) {
      // Offensive duel (attack vs attack): only ATK delta applies, then armor reduction.
      const rawToEnemy = Math.max(0, pAtkTotal - eAtkTotal);
      const rawToPlayer = Math.max(0, eAtkTotal - pAtkTotal);
      dmgToEnemy = Math.max(0, rawToEnemy - Math.max(0, Number(state.enemy.flatReduce || 0)));
      dmgToPlayer = Math.max(0, rawToPlayer - Math.max(0, Number(state.player.flatReduce || 0)));
      parryReturnToEnemy = 0;
      parryReturnToPlayer = 0;
    }

    // Esquive deterministe:
    // ESQ fixe = facteur d'esquive * ESQ stat.
    // Si ESQ fixe > energie depensee par l'attaquant, l'attaque est esquivee.
    if (pEsqPower > eSpentEnergy && eAtkTotal > 0) {
      dmgToPlayer = 0;
      parryReturnToEnemy = 0;
    }
    if (eEsqPower > pSpentEnergy && pAtkTotal > 0) {
      dmgToEnemy = 0;
      parryReturnToPlayer = 0;
    }

    // Playing the Vulnerable symbol applies vulnerable to self for this turn.
    if (pProfile.selfVulnerable || isSelfVulnerableSymbol(pMove.sym)) state.player.states.vulnerable = true;
    if (eProfile.selfVulnerable || isSelfVulnerableSymbol(eMove.sym)) state.enemy.states.vulnerable = true;

    // Combat HP application is aligned to the runtime resolution authority.
    const core = computeResolutionCore({
      playerSym: pMove.sym || "O",
      enemySym: eMove.sym || "O",
      pAtk: Math.max(0, Number(state.player.atkStat || 0)),
      pDef: Math.max(0, Number(state.player.defStat || 0)),
      pEsq: Math.max(0, Number(state.player.esqStat || 0)),
      pArm: Math.max(0, Number(state.player.flatReduce || 0)),
      eAtk: Math.max(0, Number(state.enemy.atkStat || 0)),
      eDef: Math.max(0, Number(state.enemy.defStat || 0)),
      eEsq: Math.max(0, Number(state.enemy.esqStat || 0)),
      eArm: Math.max(0, Number(state.enemy.flatReduce || 0)),
      pSpentEnergy,
      eSpentEnergy
    });
    parryReturnToEnemy = Math.max(0, Number(core.parryReturnToEnemy || 0));
    parryReturnToPlayer = Math.max(0, Number(core.parryReturnToPlayer || 0));
    let totalToEnemy = Math.max(0, Number(core.dmgToEnemy || 0));
    let totalToPlayer = Math.max(0, Number(core.dmgToPlayer || 0));

    if (pProfile.applyVulnerableOnHit && totalToEnemy > 0) state.enemy.states.vulnerable = true;
    if (eProfile.applyVulnerableOnHit && totalToPlayer > 0) state.player.states.vulnerable = true;

    if (pProfile.interruptOnHit && dmgToEnemy > 0) {
      forceTechniqueInterrupt(state.enemy);
      narration.push(`${state.player.name} interrompt la technique adverse.`);
    }
    if (eProfile.interruptOnHit && dmgToPlayer > 0) {
      forceTechniqueInterrupt(state.player);
      narration.push(`${state.enemy.name} interrompt la technique adverse.`);
    }

    state.enemy.hp = clamp(state.enemy.hp - totalToEnemy, 0, state.enemy.hpMax);
    state.player.hp = clamp(state.player.hp - totalToPlayer, 0, state.player.hpMax);

    if (pMove.sym) {
      const atkLabel = Number(pProfile.atkFactor || 0) > 1 ? `ATK ${Math.max(0, Number(state.player.atkStat || 0))}x${Number(pProfile.atkFactor || 0)}=${pAtkTotal}` : `ATK ${pAtkTotal}`;
      const pTargetMit = pIgnoreDefense
        ? `ARM ${Math.max(0, Number(state.enemy.flatReduce || 0))}`
        : `DEF+ARM ${eMitigation + Math.max(0, Number(state.enemy.flatReduce || 0))}`;
      narration.push(`${state.player.name} ${pMove.sym} | ${atkLabel} vs ${pTargetMit} => ${dmgToEnemy} dmg`);
      if (offensiveDuel) narration.push(`Duel offensif: ${state.player.name} ${pAtkTotal} vs ${state.enemy.name} ${eAtkTotal}.`);
      if (parryReturnToPlayer > 0) {
        narration.push(`${state.enemy.name} pare et renvoie ${parryReturnToPlayer} dmg.`);
      }
      if (eEsqPower > pSpentEnergy && pAtkTotal > 0) {
        narration.push(`${state.enemy.name} esquive (ESQ ${eEsqPower} > energie attaquant ${pSpentEnergy}).`);
      } else if (eProfile.esqFactor > 0 && pAtkTotal > 0) {
        narration.push(`${state.enemy.name} rate l'esquive (ESQ ${eEsqPower} <= energie attaquant ${pSpentEnergy}): l'attaque passe entierement.`);
      }
    }
    if (eMove.sym) {
      const atkLabel = Number(eProfile.atkFactor || 0) > 1 ? `ATK ${Math.max(0, Number(state.enemy.atkStat || 0))}x${Number(eProfile.atkFactor || 0)}=${eAtkTotal}` : `ATK ${eAtkTotal}`;
      const eTargetMit = eIgnoreDefense
        ? `ARM ${Math.max(0, Number(state.player.flatReduce || 0))}`
        : `DEF+ARM ${pMitigation + Math.max(0, Number(state.player.flatReduce || 0))}`;
      narration.push(`${state.enemy.name} ${eMove.sym} | ${atkLabel} vs ${eTargetMit} => ${dmgToPlayer} dmg`);
      if (parryReturnToEnemy > 0) {
        narration.push(`${state.player.name} pare et renvoie ${parryReturnToEnemy} dmg.`);
      }
      if (pEsqPower > eSpentEnergy && eAtkTotal > 0) {
        narration.push(`${state.player.name} esquive (ESQ ${pEsqPower} > energie attaquant ${eSpentEnergy}).`);
      } else if (pProfile.esqFactor > 0 && eAtkTotal > 0) {
        narration.push(`${state.player.name} rate l'esquive (ESQ ${pEsqPower} <= energie attaquant ${eSpentEnergy}): l'attaque passe entierement.`);
      }
    }
    if (pProfile.selfVulnerable || isSelfVulnerableSymbol(pMove.sym)) narration.push(`${state.player.name} devient Vulnerable (degats recus x2 ce tour).`);
    if (eProfile.selfVulnerable || isSelfVulnerableSymbol(eMove.sym)) narration.push(`${state.enemy.name} devient Vulnerable (degats recus x2 ce tour).`);

    if (pProfile.observation) {
      state.player.states.observed = true;
      state.player.observedEnemyNext = nextSymbol(techs, state.enemy);
    } else {
      state.player.observedEnemyNext = null;
    }
    if (eProfile.observation) {
      state.enemy.states.observed = true;
      state.enemy.observedEnemyNext = nextSymbol(techs, state.player);
    } else {
      state.enemy.observedEnemyNext = null;
    }
    if (pMove.sym) applyAirborneTransition(state.player, pMove.sym);
    if (eMove.sym) applyAirborneTransition(state.enemy, eMove.sym);

    if (pMove.sym) entries.push({
      name: state.player.name,
      type: "symbol",
      techId: pMove.techId,
      prefixes: pPrefixes,
      sym: pMove.sym,
      doubled: pDoubled,
      multiplier: pMultiplier,
      suffixes: pSuffixes,
      techStart: !!pMove.techStart,
      techEnd: !!pMove.techEnd,
      techType: pIsReflex ? "reflex" : "normal"
    });
    if (eMove.sym) entries.push({
      name: state.enemy.name,
      type: "symbol",
      techId: eMove.techId,
      prefixes: ePrefixes,
      sym: eMove.sym,
      doubled: eDoubled,
      multiplier: eMultiplier,
      suffixes: eSuffixes,
      techStart: !!eMove.techStart,
      techEnd: !!eMove.techEnd,
      techType: eIsReflex ? "reflex" : "normal"
    });

    if (!state.player.validatedMove) pushLastSymbol(state.player, pMove.sym, state.player.currentToken);
    if (!state.enemy.validatedMove) pushLastSymbol(state.enemy, eMove.sym, state.enemy.currentToken);

    state.player.states.vulnerable = false;
    state.enemy.states.vulnerable = false;

    if (state.enemy.hp <= 0) narration.push(`${state.enemy.name} est vaincu.`);
    if (state.player.hp <= 0) narration.push(`${state.player.name} est KO.`);

    state.turn += 1;
    state.initiative = {
      player: nextInitiative(),
      enemy: nextInitiative()
    };
    state.player.validatedMove = null;
    state.enemy.validatedMove = null;

    return {
      narration,
      entries,
      snapshot: getSnapshot()
    };
  }

  function autoValidateTurn() {
    if (!state.player.techId) {
      const fallbackId = pickDefaultTechniqueId(state.player);
      if (fallbackId) {
        state.player.techId = fallbackId;
        state.player.pendingTechId = null;
        state.player.step = 0;
      }
    }
    return advanceTurn({ auto: true });
  }

  return {
    getSnapshot,
    registerTechnique,
    setPendingTechniqueForPlayer,
    requestPlayerCancel,
    advanceTurn,
    autoValidateTurn,
    validateEntityAction,
    validateSpecialAction,
    ensureTechniqueForEntity,
    previewCurrentTokenForEntity,
    payEnergyNow
  };
}
