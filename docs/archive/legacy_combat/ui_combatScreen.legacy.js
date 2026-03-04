import { SYMBOLS, playSymbol, applyRegen, nextSymbol, maybeFinishTechnique, resolvePair, getTechniqueById } from "../features/combatEngine.js";
import { normalizeToken, renderTokenBlocks } from "../features/tokenModel.js";

/**
 * CombatScreen (plein écran) — respecte le croquis:
 * - Carrés/rectangles positionnés sur une grille (carreaux)
 * - Carrés d'information : bord jaune
 * - Boutons : bord bleu, rouge si sélection, hachuré si disabled
 * - LOG : notation V6 (techniques entre parenthèses, [ ] pour coût doublé, ! suffixe annulation)
 */

class LogLine {
  constructor(label){
    this.label = label;
    this.parts = [];
    this.techOpen = false;
    this.techType = "normal";
    this.multOpen = 1;
  }

  token(prefixes, sym, suffixes){
    return `${(prefixes||[]).join("")}${sym}${(suffixes||[]).join("")}`;
  }

  append({ prefixes=[], sym, suffixes=[], doubled=false, multiplier=0 }, { techStart=false, techEnd=false, techType="normal" } = {}){
    if (techStart){
      if (this.multOpen > 1){
        this.parts.push(this.multOpen >= 3 ? "}" : "]");
        this.multOpen = 1;
      }
      prefixes = [techType === "reflex" ? "[" : "(", ...prefixes];
      this.techType = techType === "reflex" ? "reflex" : "normal";
      this.techOpen = true;
    }

    if (techEnd){
      suffixes = [...suffixes, this.techType === "reflex" ? "]" : ")"];
      this.techOpen = false;
    }

    let mult = Number(multiplier || 0) || (doubled ? 2 : 1);
    if (this.techType === "reflex" && mult === 2) mult = 1;
    if (mult > 1 && this.multOpen !== mult){
      if (this.multOpen > 1) this.parts.push(this.multOpen >= 3 ? "}" : "]");
      this.parts.push(mult >= 3 ? "{" : "[");
      this.multOpen = mult;
    }
    if (mult === 1 && this.multOpen > 1){
      this.parts.push(this.multOpen >= 3 ? "}" : "]");
      this.multOpen = 1;
    }

    this.parts.push(this.token(prefixes, sym, suffixes));
  }

  finalize(){
    const closing = this.multOpen > 1 ? (this.multOpen >= 3 ? "}" : "]") : "";
    return `${this.label} ${this.parts.join("")}${closing}`;
  }
}

export function createCombatScreen({ dom, techniques, onExit }){
  let active = false;
  let data = null; // combat state

  function allBaseTech(){
    return techniques?.base || [];
  }
  function techById(id){
    return getTechniqueById(allBaseTech(), id);
  }
  function techName(id){
    return techById(id)?.name || "-";
  }

  function setMode(mode){
    document.body.dataset.mode = mode;
  }

  function show(){
    dom.combatOverlay.style.display = "flex";
    setMode("combat");
    active = true;
    applyScale();
  }

  function hide(){
    dom.combatOverlay.style.display = "none";
    setMode("map");
    active = false;
  }

  function applyScale(){
    if (!active) return;
    const board = dom.combatBoard;
    const rect = board.getBoundingClientRect();
    const vw = window.innerWidth - 24;
    const vh = window.innerHeight - 24;
    const scale = Math.min(vw / rect.width, vh / rect.height, 1);
    board.style.setProperty("--combatScale", String(scale));
    dom.combatOverlay.setAttribute("data-scale", "1");
  }

  window.addEventListener("resize", applyScale);

  function setupButtons(){
    dom.cbClose.onclick = () => { exit(); };

    dom.cbReveal.onclick = () => {
      stepTurn();
      render();
    };

    dom.cbSpecial.onclick = () => {
      // MVP: observation comme action spéciale
      data.player.forcedSymbol = "⊙";
      pushNarr(`Action spéciale : Observation sélectionnée (⊙).`);
      render();
    };
  }

  function exit(){
    hide();
    onExit?.();
  }

  function pushNarr(line){
    data.narr.push(line);
  }

  function initTutor(userState){
    data = {
      turn: 1,
      initRoll: null,
      target: "enemy",
      // LOG lines
      logPlayer: new LogLine("Joueur 1 :"),
      logEnemy: new LogLine("Gobelin :"),
      // last symbols
      lastP: [],
      // Entities
      player: {
        name: userState.name || userState.username || "Joueur 1",
        hp: userState.hp ?? 10,
        hpMax: userState.hpMax ?? 10,
        energy: 3, emax: 3, regen: 1,
        atkSides: 6, defSides: 4,
        techId: null, step: 0,
        pendingTechId: null,
        forcedSymbol: null,     // action spéciale
        cancelAfter: false,     // suffix !
        doubledAfter: false,    // [ ] (réflexe/air) — MVP toggle
        observed: null,
        learnedTechniques: userState.learnedTechniques || [],
        techSlots: userState.techSlots || { base: 3 },
      },
      enemy: {
        name: "Gobelin",
        hp: 8, hpMax: 8,
        energy: 2, emax: 2, regen: 2,
        atkSides: 4, defSides: 4,
        techId: "base_guard", step: 0,
        pendingTechId: null,
      },
      narr: []
    };

    // default technique
    if (!data.player.techId){
      data.player.techId = data.player.learnedTechniques?.[0] || "base_punch";
      data.player.step = 0;
    }

    setupButtons();
    setupTechButtons();
    render();
  }

  function setupTechButtons(){
    const btns = [dom.tech12, dom.tech13, dom.tech14, dom.tech15, dom.tech16, dom.tech17, dom.tech18, dom.tech19];
    btns.forEach(b => { b.onclick = null; b.classList.remove("disabled","active"); });

    const learned = data.player.learnedTechniques || [];
    const slots = data.player.techSlots?.base ?? 3;

    for (let i=0;i<btns.length;i++){
      const b = btns[i];
      const id = learned[i] || null;

      if (id && i < slots){
        const t = techById(id);
        b.textContent = t ? `${t.name}` : id;
        b.classList.remove("disabled");
        b.onclick = () => {
          data.player.pendingTechId = id;
          // visual active
          btns.forEach(x => x.classList.remove("active"));
          b.classList.add("active");
          pushNarr(`${data.player.name} met en attente : ${t?.name || id}`);
          render();
        };
      } else {
        b.textContent = id ? "—" : "—";
        b.classList.add("disabled");
        b.onclick = null;
      }
    }
  }

  function ensureTechnique(ent, fallback){
    if (ent.techId) return;
    ent.techId = fallback;
    ent.step = 0;
  }

  function techniqueStarts(ent){
    return !!ent.techId && ent.step === 0;
  }

  function techniqueEnds(ent){
    const t = techById(ent.techId);
    if (!t) return false;
    return ent.step >= (t.seq?.length || 0);
  }

  function stepTurn(){
    const p = data.player;
    const e = data.enemy;

    // Initiative deterministe (aucun hasard).
    data.initRoll = ((data.turn * 7) + (p.energy * 3) + (e.energy * 5)) % 20 + 1;
    pushNarr(`--- Tour ${data.turn} (initiative: ${data.initRoll}) ---`);

    // regen
    applyRegen(p);
    applyRegen(e);

    // ensure techniques
    ensureTechnique(p, p.techId || "base_punch");
    ensureTechnique(e, e.hp <= 3 ? "base_punch" : "base_guard");

    // log technique start markers
    const pTechStart = techniqueStarts(p);
    const eTechStart = techniqueStarts(e);

    // choose symbols (forcedSymbol overrides)
    const pMult = p.doubledAfter ? 2 : 1;
    const pSym = playSymbol(allBaseTech(), p, p.forcedSymbol, pMult);
    const eSym = playSymbol(allBaseTech(), e, null, 1);

    // reset forced symbol
    p.forcedSymbol = null;

    // token build
    const pToken = { prefixes: [], sym: pSym, suffixes: [] };
    const eToken = { prefixes: [], sym: eSym, suffixes: [] };

    // Determine technique end on this token
    let pWillEnd = false;
    let eWillEnd = false;

    const pT = techById(p.techId);
    if (pT && p.step >= (pT.seq?.length || 0)) pWillEnd = true;

    const eT = techById(e.techId);
    if (eT && e.step >= (eT.seq?.length || 0)) eWillEnd = true;

    // cancellation suffix
    if (p.cancelAfter){
      pToken.suffixes.push("!");
      pWillEnd = true; // annulation termine la technique
    }

    // LOG append (doubledAfter -> brackets)
    const pTechType = (techById(p.techId)?.type === "reflex" || techById(p.techId)?.category === "reflex") ? "reflex" : "normal";
    const eTechType = (techById(e.techId)?.type === "reflex" || techById(e.techId)?.category === "reflex") ? "reflex" : "normal";
    data.logPlayer.append(
      { ...pToken, doubled: p.doubledAfter, multiplier: p.doubledAfter ? 2 : 1 },
      { techStart: pTechStart, techEnd: pWillEnd, techType: pTechType }
    );
    data.logEnemy.append(
      { ...eToken, doubled: false, multiplier: 1 },
      { techStart: eTechStart, techEnd: eWillEnd, techType: eTechType }
    );

    // Store current symbols
    data.lastPlayerSym = pSym + (p.cancelAfter ? "!" : "");
    data.lastEnemySym = eSym;
// keep last symbols (player)
    data.lastP.push(pToken.sym + (pToken.suffixes.includes("!") ? "!" : ""));
    data.lastP = data.lastP.slice(-6);

    // observation effect
    if (pSym === "⊙"){
      const ns = nextSymbol(allBaseTech(), e) || "O";
      p.observed = ns;
      pushNarr(`${p.name} observe : prochain symbole ennemi = ${ns}`);
    } else {
      p.observed = null;
    }

    // resolve interactions (MVP target: player always targets enemy, enemy targets player)
    const pDef = SYMBOLS[pSym] || SYMBOLS["O"];
    const eDef = SYMBOLS[eSym] || SYMBOLS["O"];

    if (pDef.cat === "attack" && eDef.cat === "attack"){
      const out = resolvePair({
        attacker: p, defender: e,
        aSym: pSym, dSym: eSym,
        atkSides: p.atkSides, defSides: e.defSides
      });
      out.text.forEach(pushNarr);
      if (out.dmg > 0) e.hp = Math.max(0, e.hp - out.dmg);
      if (out.dmg < 0) p.hp = Math.max(0, p.hp - (-out.dmg));
    } else if (pDef.cat === "attack" && eDef.cat === "defense"){
      const out = resolvePair({
        attacker: p, defender: e,
        aSym: pSym, dSym: eSym,
        atkSides: p.atkSides, defSides: e.defSides
      });
      out.text.forEach(pushNarr);
      if (out.dmg > 0){
        e.hp = Math.max(0, e.hp - out.dmg);
        if (out.canceled){
          e.techId = null; e.step = 0;
          pushNarr(`${e.name} est interrompu.`);
        }
      }
      if (out.dmg < 0){ p.hp = Math.max(0, p.hp - (-out.dmg)); }
    } else if (eDef.cat === "attack" && pDef.cat === "defense"){
      const out = resolvePair({
        attacker: e, defender: p,
        aSym: eSym, dSym: pSym,
        atkSides: e.atkSides, defSides: p.defSides
      });
      out.text.forEach(pushNarr);
      if (out.dmg > 0){
        p.hp = Math.max(0, p.hp - out.dmg);
        if (out.canceled){
          p.techId = null; p.step = 0;
          pushNarr(`${p.name} est interrompu.`);
        }
      }
      if (out.dmg < 0){ e.hp = Math.max(0, e.hp - (-out.dmg)); }
    } else {
      pushNarr(`${p.name} joue ${pSym} ; ${e.name} joue ${eSym}.`);
    }


// cancellation interrupts technique after this symbol
if (p.cancelAfter){
  p.techId = null; p.step = 0; p.pendingTechId = null;
  p.cancelAfter = false;
  pushNarr(`${p.name} annule sa technique.`);
}

    // finish techniques
    maybeFinishTechnique(allBaseTech(), p);
    maybeFinishTechnique(allBaseTech(), e);

    // Technique ending marker is handled via techEnd on the last played token.

    // if player has pending and finished -> switch happens in maybeFinishTechnique already
    if (!p.techId && p.pendingTechId){
      p.techId = p.pendingTechId;
      p.pendingTechId = null;
      p.step = 0;
      setupTechButtons(); // clear active highlight
    }

    if (e.hp <= 0){
      pushNarr(`${e.name} OUT.`);
      data.logPlayer.parts.push("V");
      data.logEnemy.parts.push("OUT");
    }
    if (p.hp <= 0){
      pushNarr(`${p.name} OUT.`);
      data.logEnemy.parts.push("V");
      data.logPlayer.parts.push("OUT");
    }

    // trim narrative
    data.narr = data.narr.slice(-60);

    data.turn += 1;
  }

  function render(){
    const p = data.player;
    const e = data.enemy;

    // current symbol = last played token from log (approx)
    dom.cbPlayerSym.textContent = data.lastPlayerSym || "—";
    dom.cbEnemySym.textContent = data.lastEnemySym || "—";

    dom.cbPlayerHP.textContent = `PV ${p.hp}/${p.hpMax}`;
    dom.cbEnemyHP.textContent = `PV ${e.hp}/${e.hpMax}`;
    dom.cbPlayerEN.textContent = `EN ${p.energy}/${p.emax}`;

    dom.cbInit.textContent = `Init ${data.initRoll ?? "—"}`;

    // Next symbols: stream blocks with cost grammar (max 4 visible)
    const pt = techById(p.techId);
    const remTokens = pt
      ? (pt.seq || []).slice(p.step).map((sym) => normalizeToken({ sym, multiplier: 1 })).filter(Boolean)
      : [];
    const remBlocks = renderTokenBlocks(remTokens, { maxBlocks: 4 });
    const pending = p.pendingTechId ? techName(p.pendingTechId) : "-";
    dom.cbNext.textContent = `Prochains: ${remBlocks.join(" ") || "—"}\nEn attente: ${pending}`;

    const lastTokens = (data.lastP || []).slice(-4).map((sym) => normalizeToken({ sym, multiplier: 1 })).filter(Boolean);
    const lastBlocks = renderTokenBlocks(lastTokens, { maxBlocks: 4 });
    dom.cbLast.textContent = `Derniers: ${lastBlocks.join(" ") || "—"}`;

    dom.cbNarr.textContent = data.narr.join("\n");

    dom.cbLog.textContent = `${data.logPlayer.finalize()}\n${data.logEnemy.finalize()}`;

    // arrow (MVP)
    dom.cbTargetArrow.textContent = "→";

    // update technique buttons (active state)
    setupTechButtons();
  }

  function enterTutorCombat(userState){
    show();
    initTutor(userState);
  }

  return { enterTutorCombat, exit, show, hide, applyScale };
}
