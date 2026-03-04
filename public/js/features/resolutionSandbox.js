import { normalizeSymbolKey, resolveSymbolMeta } from "../data/symbolsV6.js";

function symbolProfile(sym) {
  const key = normalizeSymbolKey(sym);
  const meta = resolveSymbolMeta(key) || {};
  return {
    key,
    atkFactor: Math.max(0, Number(meta.atkFactor ?? meta.atkDice ?? 0)),
    defFactor: Math.max(0, Number(meta.defFactor ?? meta.defDice ?? 0)),
    esqFactor: Math.max(0, Number(meta.esqFactor ?? meta.esqDice ?? 0)),
    parry: !!meta.counterAtk,
    selfVulnerable: !!meta.selfVulnerable
  };
}

export function computeResolution({
  playerSym = "X",
  enemySym = "GUARD",
  pAtk = 4,
  pDef = 2,
  pEsq = 2,
  pArm = 1,
  eAtk = 4,
  eDef = 2,
  eEsq = 2,
  eArm = 1,
  pSpentEnergy,
  eSpentEnergy
} = {}) {
  const p = symbolProfile(playerSym);
  const e = symbolProfile(enemySym);
  const pCost = Math.max(0, Number(resolveSymbolMeta(playerSym)?.cost ?? 0));
  const eCost = Math.max(0, Number(resolveSymbolMeta(enemySym)?.cost ?? 0));
  const pSpent = Math.max(0, Number.isFinite(Number(pSpentEnergy)) ? Number(pSpentEnergy) : pCost);
  const eSpent = Math.max(0, Number.isFinite(Number(eSpentEnergy)) ? Number(eSpentEnergy) : eCost);

  const pAtkPower = p.atkFactor * Math.max(0, Number(pAtk || 0));
  const eAtkPower = e.atkFactor * Math.max(0, Number(eAtk || 0));
  const pMit = p.defFactor * Math.max(0, Number(pDef || 0));
  const eMit = e.defFactor * Math.max(0, Number(eDef || 0));
  const pEsqPower = p.esqFactor * Math.max(0, Number(pEsq || 0));
  const eEsqPower = e.esqFactor * Math.max(0, Number(eEsq || 0));
  const pIgnoreDefense = p.key === "FINAL";
  const eIgnoreDefense = e.key === "FINAL";
  const offensiveDuel = p.atkFactor > 0 && e.atkFactor > 0;
  let dmgToEnemy = pIgnoreDefense
    ? Math.max(0, pAtkPower - Math.max(0, Number(eArm || 0)))
    : Math.max(0, pAtkPower - (eMit + Math.max(0, Number(eArm || 0))));
  let dmgToPlayer = eIgnoreDefense
    ? Math.max(0, eAtkPower - Math.max(0, Number(pArm || 0)))
    : Math.max(0, eAtkPower - (pMit + Math.max(0, Number(pArm || 0))));
  let parryReturnToEnemy = 0;
  let parryReturnToPlayer = 0;

  if (e.parry && pAtkPower > 0) {
    const eParryPower = 2 * Math.max(0, Number(eAtk || 0));
    parryReturnToPlayer = Math.min(eParryPower, pAtkPower);
    dmgToEnemy = 0;
  }
  if (p.parry && eAtkPower > 0) {
    const pParryPower = 2 * Math.max(0, Number(pAtk || 0));
    parryReturnToEnemy = Math.min(pParryPower, eAtkPower);
    dmgToPlayer = 0;
  }

  if (offensiveDuel) {
    // Offensive duel (attack vs attack): only the ATK difference applies, then armor reduces it.
    const rawToEnemy = Math.max(0, pAtkPower - eAtkPower);
    const rawToPlayer = Math.max(0, eAtkPower - pAtkPower);
    dmgToEnemy = Math.max(0, rawToEnemy - Math.max(0, Number(eArm || 0)));
    dmgToPlayer = Math.max(0, rawToPlayer - Math.max(0, Number(pArm || 0)));
    parryReturnToEnemy = 0;
    parryReturnToPlayer = 0;
  }

  if (pEsqPower > eSpent && eAtkPower > 0) {
    dmgToPlayer = 0;
    parryReturnToEnemy = 0;
  }
  if (eEsqPower > pSpent && pAtkPower > 0) {
    dmgToEnemy = 0;
    parryReturnToPlayer = 0;
  }

  let totalToEnemy = dmgToEnemy + parryReturnToEnemy;
  let totalToPlayer = dmgToPlayer + parryReturnToPlayer;
  if (e.selfVulnerable) totalToEnemy *= 2;
  if (p.selfVulnerable) totalToPlayer *= 2;

  return {
    pAtkPower,
    eAtkPower,
    pMit,
    eMit,
    pCost,
    eCost,
    pSpentEnergy: pSpent,
    eSpentEnergy: eSpent,
    pEsqPower,
    eEsqPower,
    dmgToEnemy: totalToEnemy,
    dmgToPlayer: totalToPlayer,
    parryReturnToEnemy,
    parryReturnToPlayer
  };
}
