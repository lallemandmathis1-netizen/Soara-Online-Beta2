import { SYMBOLS, playSymbol, applyRegen, nextSymbol, maybeFinishTechnique, resolvePair, getTechniqueById } from "./combatEngine.js";

/**
 * LOG (Historique long)
 * - Une technique est entre parenthèses:
 *   début: préfixe "(" avant le 1er symbole
 *   fin: suffixe ")" ajouté au DERNIER symbole de la technique
 * - Coûts doublés (air / réflexe) : entre crochets [ ].
 *   Si plusieurs symboles consécutifs sont doublés, on les regroupe: [XXO]
 * - Annulation : suffixe "!" (ex: X!)
 * - Un symbole est un token: {prefixes}{sym}{suffixes}
 *   (couleurs buffs seront ajoutées plus tard)
 */

class LogLineBuilder {
  constructor(label){
    this.label = label;
    this.parts = [];
    this._inBracket = false;
    this._techOpenPending = false;
  }
  openTechnique(){
    this._techOpenPending = true;
  }
  closeBracketIfOpen(){
    if (this._inBracket){
      this.parts.push("]");
      this._inBracket = false;
    }
  }
  closeTechniqueOnToken(token){
    token.suffixes.push(")");
  }
  renderToken(token){
    const pfx = (token.prefixes || []).join("");
    const sfx = (token.suffixes || []).join("");
    return `${pfx}${token.sym}${sfx}`;
  }
  addToken(token, doubled=false){
    if (this._techOpenPending){
      token.prefixes = ["(", ...(token.prefixes || [])];
      this._techOpenPending = false;
    }
    const txt = this.renderToken(token);

    if (doubled && !this._inBracket){
      this.parts.push("[");
      this._inBracket = true;
    }
    if (!doubled && this._inBracket){
      this.parts.push("]");
      this._inBracket = false;
    }
    this.parts.push(txt);
  }
  finalize(){
    this.closeBracketIfOpen();
    return `${this.label} ${this.parts.join("")}`;
  }
}

export function createCombatTutorialUI({ modal }){
  let techniques = null; // { base, advanced, expert }
  function setTechniques(t){ techniques = t; }

  let combat = null;

  function allTechniques(){ return techniques?.base || []; }
  function techById(id){ return getTechniqueById(allTechniques(), id); }
  function techName(id){ return techById(id)?.name || "-"; }

  function initCombat(playerName){
    combat = {
      turn: 1,
      narration: [],
      log: {
        player: new LogLineBuilder("Joueur 1 :"),
        enemy: new LogLineBuilder("Gobelin :"),
      },
      player: {
        name: playerName || "Vous",
        hp: 10, hpMax: 10,
        energy: 3, emax: 3, regen: 1,
        atkSides: 6, defSides: 4,
        techId: null, step: 0,
        pendingTechId: null,
        observed: null,
        cancelAfter: false,
        reflexAfter: false, // prochain symbole coûte x2 => [ ]
      },
      enemy: {
        name: "Gobelin",
        hp: 8, hpMax: 8,
        energy: 2, emax: 2, regen: 2,
        atkSides: 4, defSides: 4,
        techId: "base_guard", step: 0,
        pendingTechId: null,
      },
    };
  }

  function ensureTechnique(ent, fallbackId){
    if (ent.techId) return;
    ent.techId = fallbackId;
    ent.step = 0;
  }

  function isTechniqueStarting(ent){
    return !!ent.techId && ent.step === 0;
  }
  function isTechniqueEnding(ent){
    const t = techById(ent.techId);
    if (!t) return false;
    return ent.step >= (t.seq?.length || 0);
  }

  function advanceTurn(){
    const p = combat.player;
    const e = combat.enemy;

    combat.narration.push(`--- Tour ${combat.turn} ---`);

    applyRegen(p);
    applyRegen(e);

    ensureTechnique(p, "base_punch");
    ensureTechnique(e, e.hp <= 3 ? "base_punch" : "base_guard");

    if (isTechniqueStarting(p)) combat.log.player.openTechnique();
    if (isTechniqueStarting(e)) combat.log.enemy.openTechnique();

    const pMult = p.reflexAfter ? 2 : 1;
    const pSym = playSymbol(allTechniques(), p, null, pMult);
    const eSym = playSymbol(allTechniques(), e, null, 1);

    const pToken = { prefixes: [], sym: pSym, suffixes: [] };
    const eToken = { prefixes: [], sym: eSym, suffixes: [] };

    if (p.cancelAfter) pToken.suffixes.push("!");

    // If technique ends naturally this symbol, we'll close after we know end; for cancellation we close here.
    combat.log.player.addToken(pToken, p.reflexAfter);
    combat.log.enemy.addToken(eToken, false);

    // Observation
    if (pSym === "⊙"){
      const ns = nextSymbol(allTechniques(), e) || "O";
      p.observed = ns;
      combat.narration.push(`${p.name} observe : prochain symbole ennemi = ${ns}`);
    } else {
      p.observed = null;
    }

    // Resolve
    const pDef = SYMBOLS[pSym] || SYMBOLS["O"];
    const eDef = SYMBOLS[eSym] || SYMBOLS["O"];

    if (pDef.cat === "attack" && eDef.cat === "attack"){
      const out = resolvePair({
        attacker: p, defender: e, aSym: pSym, dSym: eSym,
        atkSides: p.atkSides, defSides: e.defSides
      });
      combat.narration.push(...out.text);
      if (out.dmg > 0) e.hp = Math.max(0, e.hp - out.dmg);
      if (out.dmg < 0) p.hp = Math.max(0, p.hp - (-out.dmg));
    } else if (pDef.cat === "attack" && eDef.cat === "defense"){
      const out = resolvePair({
        attacker: p, defender: e, aSym: pSym, dSym: eSym,
        atkSides: p.atkSides, defSides: e.defSides
      });
      combat.narration.push(...out.text);
      if (out.dmg > 0){
        e.hp = Math.max(0, e.hp - out.dmg);
        if (out.canceled){ e.techId = null; e.step = 0; combat.narration.push(`${e.name} est interrompu.`); }
      }
      if (out.dmg < 0) p.hp = Math.max(0, p.hp - (-out.dmg));
    } else if (eDef.cat === "attack" && pDef.cat === "defense"){
      const out = resolvePair({
        attacker: e, defender: p, aSym: eSym, dSym: pSym,
        atkSides: e.atkSides, defSides: p.defSides
      });
      combat.narration.push(...out.text);
      if (out.dmg > 0){
        p.hp = Math.max(0, p.hp - out.dmg);
        if (out.canceled){ p.techId = null; p.step = 0; combat.narration.push(`${p.name} est interrompu.`); }
      }
      if (out.dmg < 0) e.hp = Math.max(0, e.hp - (-out.dmg));
    } else {
      combat.narration.push(`${p.name} joue ${pSym} ; ${e.name} joue ${eSym}.`);
    }

    // Cancellation ends technique now (close on this token)
    if (p.cancelAfter){
      combat.log.player.closeTechniqueOnToken(pToken);
      p.techId = null; p.step = 0; p.pendingTechId = null;
      p.cancelAfter = false;
      combat.narration.push(`${p.name} annule sa technique.`);
    }

    maybeFinishTechnique(allTechniques(), p);
    maybeFinishTechnique(allTechniques(), e);

    // Close techniques if ending naturally (suffix on last token)
    if (!pToken.suffixes.includes(")") && isTechniqueEnding(p)){
      combat.log.player.closeTechniqueOnToken(pToken);
    }
    if (!eToken.suffixes.includes(")") && isTechniqueEnding(e)){
      combat.log.enemy.closeTechniqueOnToken(eToken);
    }

    p.reflexAfter = false;

    if (!e.techId){
      e.techId = e.hp <= 3 ? "base_punch" : "base_guard";
      e.step = 0;
    }

    if (e.hp <= 0) combat.narration.push(`${e.name} est vaincu.`);
    if (p.hp <= 0) combat.narration.push(`${p.name} est KO. Recommence.`);

    combat.turn += 1;
  }

  function render(){
    const p = combat.player;
    const e = combat.enemy;

    const pNext = nextSymbol(allTechniques(), p) || "O";
    const obs = p.observed ? p.observed : "—";

    const list = allTechniques().slice(0, 30);

    const logPlayer = combat.log.player.finalize();
    const logEnemy = combat.log.enemy.finalize();

    modal.open("Mentor — Tutoriel combat", `
      <div class="pinCard">
        <div class="infoCard">
          <div><b>LOG</b></div>
          <div class="small" style="margin-top:6px; white-space:pre-wrap;">${logPlayer}</div>
          <div class="small" style="margin-top:6px; white-space:pre-wrap;">${logEnemy}</div>
          <div class="small" style="margin-top:10px;">
            Notation: <b>(</b> début technique, <b>)</b> fin (suffixe), <b>[ ]</b> coût doublé (air/réflexe), <b>!</b> annulation (suffixe).
          </div>
        </div>

        <div style="height:12px"></div>
        <div class="row">
          <div class="card" style="flex:1; min-width:320px;">
            <div><b>${p.name}</b> — PV ${p.hp}/${p.hpMax} — Énergie ${p.energy}/${p.emax}</div>
            <div class="small">Technique : <b>${techName(p.techId)}</b> | En attente : <b>${techName(p.pendingTechId)}</b></div>
            <div class="small">Prochain : <b>${pNext}</b> | Observation : <b>${obs}</b></div>
          </div>
          <div class="card" style="flex:1; min-width:320px;">
            <div><b>${e.name}</b> — PV ${e.hp}/${e.hpMax} — Énergie ${e.energy}/${e.emax}</div>
            <div class="small">Technique : <b>${techName(e.techId)}</b></div>
          </div>
        </div>

        <div style="height:10px"></div>
        <div class="row" style="gap:0;">
          <button class="btn" id="btnStep" style="flex:1;">Révéler / Avancer 1 tour</button>
          <button class="btn" id="btnCancel" style="flex:1;">Annuler (!)</button>
          <button class="btn" id="btnReflex" style="flex:1;">Réflexe (x2)</button>
          <button class="btn" id="btnReset" style="flex:1;">Recommencer</button>
        </div>

        <div style="height:14px"></div>
        <div class="card">
          <div><b>Bibliothèque de techniques (Base)</b></div>
          <div class="small">Cliquer = mettre en attente (remplace l'ancienne).</div>
          <div id="techGrid" class="row" style="gap:0; margin-top:10px;"></div>
        </div>

        <div style="height:14px"></div>
        <div class="card">
          <div><b>Narration</b></div>
          <div class="small" style="max-height:220px; overflow:auto;">
            ${combat.narration.slice(-24).map(x=>`<div>${x}</div>`).join("") || "—"}
          </div>
        </div>
      </div>
    `);

    const btnStep = document.getElementById("btnStep");
    const btnReset = document.getElementById("btnReset");
    const btnCancel = document.getElementById("btnCancel");
    const btnReflex = document.getElementById("btnReflex");

    btnStep.onclick = () => { advanceTurn(); render(); };
    btnReset.onclick = () => { initCombat(p.name); render(); };
    btnCancel.onclick = () => { p.cancelAfter = true; render(); };
    btnReflex.onclick = () => { p.reflexAfter = true; render(); };

    if (e.hp <= 0 || p.hp <= 0) btnStep.disabled = true;

    const grid = document.getElementById("techGrid");
    for (const t of list){
      const b = document.createElement("button");
      b.className = "btn";
      b.style.flex = "1 0 320px";
      b.textContent = `${t.name} : ${(t.seq||[]).join("")}`; /* no spaces -> matches LOG style */
      b.onclick = () => {
        p.pendingTechId = t.id;
        combat.narration.push(`${p.name} met "${t.name}" en attente.`);
        if (!p.techId){
          p.techId = t.id;
          p.step = 0;
          p.pendingTechId = null;
        }
        render();
      };
      grid.appendChild(b);
    }
  }

  function open(playerName){
    if (!techniques) techniques = { base: [] };
    initCombat(playerName);
    render();
  }

  return { open, setTechniques };
}
