import { createCombatSessionV6 } from "./combatEngine.js";
import { createLogState } from "./combatLog.js";
import { createTurnFlow } from "./turnFlow.js";
import { formatToken, getTechniqueTokens, normalizeToken } from "./tokenModel.js";
import { SYMBOLS_V6_UI } from "../data/symbolsV6.js";
import { computeResolution } from "./resolutionSandbox.js";

const BETA_TECHNIQUES = [
  { id: "beta_t1", name: "Technique 1", category: "normal", seq: ["X", "X", "O"], tokens: [{ sym: "X" }, { sym: "X" }, { sym: "O" }], type: "normal" },
  { id: "beta_t2", name: "Technique 2", category: "normal", seq: ["GUARD", "X", "O"], tokens: [{ sym: "GUARD" }, { sym: "X" }, { sym: "O" }], type: "normal" },
  { id: "beta_t3", name: "Technique 3", category: "normal", seq: ["X", "BULWARK", "X", "O"], tokens: [{ sym: "X" }, { sym: "BULWARK" }, { sym: "X" }, { sym: "O" }], type: "normal" },
  { id: "beta_r1", name: "Reflexe 1", category: "reflex", seq: ["X", "GUARD"], tokens: [{ sym: "X", doubled: true }, { sym: "GUARD", doubled: true }], type: "reflex", doubledCost: true }
];
const NARRATIVE_SYMBOL_SEQUENCE = (SYMBOLS_V6_UI || [])
  .map((s) => (typeof s?.symbol === "string" ? s.symbol : ""))
  .filter((s) => s.length > 0);
const ROLL_SPEED_MS = 45;
const MAX_ROLL_DELAY_MS = 260;

export function createCombatScreen({ hostEl, getPlayerName, getTechniques, getPlayerMeta, onOpen, onClose, onInitiativeReveal, onSpacePress, onNarrativeIntroStart, onOpenSettings, onCombatSyncPayload }) {
  if (!hostEl) throw new Error("combat_screen_missing_host");

  let rootEl = null;
  let escAttached = false;
  let resizeAttached = false;
  let resizeHandler = null;
  let ui = null;
  let session = null;
  let logState = null;
  let refs = null;
  let timerRemaining = 0;
  let equippedTechniques = [];
  let slotsTotal = 10;
  let playerLogName = "Joueur1";
  let enemyLogName = "Gobelin";
  let lastAppliedSignature = null;
  let flow = null;
  let revealedInit = { player: null, enemy: null };
  let rolledInit = { player: null, enemy: null };
  let actionValidated = { player: false, enemy: false };
  let paidThisTurn = { player: false, enemy: false };
  let currentPhase = "idle";
  let specialInventoryOpen = false;
  let specialPanelMode = null;
  let targetMode = null;
  let slotsDirty = true;
  let lastSlotsSignature = "";
  let pressedTimeout = null;
  let enemyPreset = { name: "Gobelin" };
  let selectedTargets = { player: null, enemy: null };
  let awaitingCombatStart = true;
  let pendingLockedForOpeningInit = true;
  let playerWindowCache = null;
  let initiativePulseUntilTick = 0;
  let initiativeTextHidden = false;
  let currentCycleInit = { player: null, enemy: null };
  let pendingNextInit = null;
  let initiativeMaskUntilTick = null;
  let initiativeAnimUntilTick = null;
  let initiativeRollingValue = null;
  let initiativeRollingPending = false;
  let initiativeRollDirection = null;
  let initiativeRollStopValue = null;
  let timerFlashGreenTicks = 0;
  let initiativeFlashRedTicks = 0;
  let lastRunTimerTick = null;
  let lastRunTimerValue = null;
  let initiativeSpinTimer = null;
  let initiativeSpinDelays = [];
  let initiativeSpinDelayIndex = 0;
  let initiativeRollLengthUnits = 6;
  let skipNextFlowResolve = false;
  let narrativeIntroInitialInit = null;
  let pvpInitialInit = null;
  let pvpSkipFirstReveal = false;
  let useNarrativeLoopTimer = false;
  let lastCombatSyncSignature = "";
  const specialSlotsStatic = [];
  const combatTimeConfigByType = {
    tutorial: { unitDurationMs: 500, phaseDurations: { askRoll: 10, revealRoll: 8, runTimer: 20, endWait: 10 } },
    narrative: { unitDurationMs: 526, phaseDurations: { askRoll: 10, revealRoll: 8, runTimer: 20, endWait: 10 } },
    pve: { unitDurationMs: 500, phaseDurations: { askRoll: 10, revealRoll: 5, runTimer: 20, endWait: 6 } },
    pvp: { unitDurationMs: 500, phaseDurations: { askRoll: 1, revealRoll: 10, runTimer: 20, endWait: 4 } }
  };
  let combatTimeConfig = combatTimeConfigByType.tutorial;
  let activeCombatType = "tutorial";
  let forceNarrativeOnlyUi = false;
  let forceNarrativeOnlyUiNoFade = false;
  let useNarrativeIntroSequence = false;
  let narrativeIntroTick = 0;
  let narrativeIntroTimer = null;
  let narrativeIntroFastRollTimer = null;
  let narrativeIntroSymbolCycleTimer = null;
  let narrativeIntroRunning = false;
  let narrativeIntroSymbolIndex = 0;
  let narrativeIntroSymbolValue = null;
  let techSlotsHatchedActive = false;
  let revealRollSpinTimer = null;
  let tutorialStep = "idle";
  let tutorialRankOrder = [];
  let tutorialRankIndex = 0;
  let tutorialInitRollTimers = [];

  function allTechniques() {
    const raw = typeof getTechniques === "function" ? getTechniques() : null;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    return raw.base || [];
  }

  function techniqueTokens(technique) {
    return getTechniqueTokens(technique);
  }

  function buildSlotsFromPlayerMeta() {
    const meta = typeof getPlayerMeta === "function" ? getPlayerMeta() || {} : {};
    const list = allTechniques();
    const catalog = [...BETA_TECHNIQUES, ...list].reduce((m, t) => {
      if (t?.id && !m.has(t.id)) m.set(t.id, t);
      return m;
    }, new Map());

    slotsTotal = Math.max(1, Math.min(10, Number(meta.techSlotsTotal ?? 10)));
    const rawSlots = Array.isArray(meta.techniquesBySlot)
      ? meta.techniquesBySlot
      : (Array.isArray(meta.equippedTechniques) ? meta.equippedTechniques : null);

    const out = Array.from({ length: slotsTotal }, () => null);
    if (rawSlots) {
      for (let i = 0; i < slotsTotal; i += 1) {
        const v = rawSlots[i];
        if (!v) continue;
        if (typeof v === "string") out[i] = catalog.get(v) || null;
        else if (v?.id) out[i] = catalog.get(v.id) || v;
      }
    } else {
      const learned = Array.isArray(meta.learnedTechniques) ? meta.learnedTechniques : [];
      let cursor = 0;
      for (const learnedEntry of learned) {
        const id = typeof learnedEntry === "string" ? learnedEntry : learnedEntry?.id;
        const tech = catalog.get(id) || (typeof learnedEntry === "object" ? learnedEntry : null);
        if (!tech) continue;
        if (cursor >= slotsTotal) break;
        out[cursor] = tech;
        cursor += 1;
      }
      meta.techSlotsTotal = slotsTotal;
      meta.techniquesBySlot = [...out];
      meta.equippedTechniques = [...out];
    }

    return out.map((t, i) => t || { id: `placeholder_${i + 1}`, name: "(vide)", seq: [], tokens: [], placeholder: true, empty: true });
  }

  function setNarration(lines) {
    ui.narration = Array.isArray(lines) ? lines.slice(0, 9) : [];
  }

  function pushNarration(line) {
    ui.narration.push(line);
    ui.narration = ui.narration.slice(0, 9);
  }

  function canManualCloseCombat() {
    const type = String(activeCombatType || "").toLowerCase();
    return !(type === "pve" || type === "pvp" || type === "narrative");
  }

  function syncManualCloseControl() {
    const closeBtn = rootEl?.querySelector('[data-action="close"]');
    if (!closeBtn) return;
    closeBtn.style.display = canManualCloseCombat() ? "" : "none";
  }

  function initState(options = {}) {
    if (flow) {
      flow.stop();
      flow = null;
    }
    const meta = typeof getPlayerMeta === "function" ? getPlayerMeta() || {} : {};
    const type = options?.combatType || meta?.combatConfig?.combatType || "tutorial";
    activeCombatType = type;
    forceNarrativeOnlyUi = !!options?.uiNarrativeOnly;
    forceNarrativeOnlyUiNoFade = !!options?.uiNarrativeOnlyNoFade;
    useNarrativeIntroSequence = !!options?.narrativeIntroSequence;
    useNarrativeLoopTimer = !!options?.narrativeLoopTimer;
    narrativeIntroInitialInit = null;
    pvpInitialInit = options?.pvpInitialInit || null;
    pvpSkipFirstReveal = !!options?.pvpSkipFirstReveal;
    narrativeIntroTick = 0;
    techSlotsHatchedActive = false;
    stopNarrativeIntroTimer();
    const typeConfig = combatTimeConfigByType[type] || combatTimeConfigByType.tutorial;
    const configuredMs = Number(
      options?.unitDurationMs
      ?? meta?.combatConfig?.unitDurationMs
      ?? typeConfig.unitDurationMs
      ?? combatTimeConfigByType.tutorial.unitDurationMs
    );
    const configuredDurations = options?.phaseDurations
      || meta?.combatConfig?.phaseDurations
      || typeConfig.phaseDurations
      || combatTimeConfigByType.tutorial.phaseDurations;
    const effectiveUnitMs = type === "tutorial" ? 500 : configuredMs;
    combatTimeConfig = {
      unitDurationMs: Math.max(50, effectiveUnitMs || 500),
      phaseDurations: {
        askRoll: Math.max(1, Number(configuredDurations?.askRoll ?? 10)),
        revealRoll: Math.max(1, Number(configuredDurations?.revealRoll ?? 8)),
        runTimer: Math.max(1, Number(configuredDurations?.runTimer ?? 20)),
        endWait: Math.max(0, Number(configuredDurations?.endWait ?? 10))
      }
    };

    const playerName = typeof getPlayerName === "function" ? getPlayerName() : "Vous";
    const techniques = buildSlotsFromPlayerMeta().map((t) => ({
      ...t,
      seq: Array.isArray(t.seq) ? [...t.seq] : [],
      tokens: techniqueTokens(t)
    }));
    equippedTechniques = techniques.map((t) => ({
      ...t,
      seq: Array.isArray(t.seq) ? [...t.seq] : [],
      tokens: techniqueTokens(t)
    }));

    enemyPreset = options.enemyPreset || enemyPreset;
    session = createCombatSessionV6({
      playerName: playerName || "Vous",
      enemyName: enemyPreset.name || "Gobelin",
      techniques,
      playerMeta: meta
    });

    const snap = session.getSnapshot();
    playerLogName = snap?.player?.name || "Joueur1";
    enemyLogName = snap?.enemy?.name || "Gobelin";
    logState = createLogState([playerLogName, enemyLogName]);
    lastAppliedSignature = null;
    actionValidated = { player: false, enemy: false };
    paidThisTurn = { player: false, enemy: false };
    rolledInit = { player: null, enemy: null };
    revealedInit = { player: null, enemy: null };
    currentCycleInit = { player: null, enemy: null };
    lastCombatSyncSignature = "";
    initiativeTextHidden = false;
    pendingNextInit = null;
    initiativeMaskUntilTick = null;
    initiativeAnimUntilTick = null;
    initiativeRollingValue = null;
    initiativeRollingPending = false;
    initiativeRollDirection = null;
    initiativeRollStopValue = null;
    timerFlashGreenTicks = 0;
    initiativeFlashRedTicks = 0;
    stopInitiativeSpin();
    stopTutorialInitRollAnimation();
    skipNextFlowResolve = false;
    tutorialStep = "idle";
    tutorialRankOrder = [];
    tutorialRankIndex = 0;

    ui = {
      techniques,
      specialMode: false,
      specialOpen: false,
      targetVisible: false,
      narration: ["Preparation du combat"],
      nextQueueFull: []
    };
    targetMode = null;
    selectedTargets = { player: null, enemy: null };
    awaitingCombatStart = true;
    pendingLockedForOpeningInit = true;
    playerWindowCache = null;
    specialPanelMode = null;
    slotsDirty = true;
    lastSlotsSignature = "";
    specialSlotsStatic.length = 0;
    specialSlotsStatic.push(
      { id: "sp_cancel", name: "! Annuler une technique", seq: ["!"], tokens: [{ sym: "!" }], special: true },
      { id: "sp_observe", name: "Observation", seq: ["?"], tokens: [{ sym: "?" }], special: true },
      { id: "sp_inventory", name: "Inventaire (potions)", seq: ["[]"], tokens: [{ sym: "[]" }], special: true },
      { id: "sp_notebook", name: "Regarder le carnet", seq: ["ITEM"], tokens: [{ sym: "ITEM" }], special: true }
    );
    while (specialSlotsStatic.length < slotsTotal) {
      specialSlotsStatic.push({ id: `sp_empty_${specialSlotsStatic.length + 1}`, name: "(vide)", seq: [], tokens: [], empty: true, special: true });
    }
  }

  function startCombatFlow() {
    awaitingCombatStart = false;
    if (activeCombatType === "tutorial") {
      startTutorialInitiativePrompt();
      return;
    }
    setNarration([
      "Le duel s'ouvre. Lis l'intention adverse.",
      "Appuie sur ESPACE pour engager l'initiative."
    ]);
    setupTurnFlow();
    render();
  }

  function refreshPlayerWindowCache() {
    if (!session) return;
    const snapshot = session.getSnapshot();
    playerWindowCache = computePlayerDisplayWindow(snapshot);
  }

  function isOneVsOne() {
    // Current beta combat screen is 1v1 (player card + one enemy card).
    return true;
  }

  function ensureAutoTargets() {
    if (!isOneVsOne()) return;
    selectedTargets.player = "enemy";
    selectedTargets.enemy = "player";
    if (!targetMode) setTargetMode("playerToEnemy");
  }

  function buildSpecialSlots() {
    return specialSlotsStatic;
  }

  function pulsePressed(el) {
    if (!(el instanceof HTMLElement)) return;
    el.classList.add("btnPressed");
    if (pressedTimeout) window.clearTimeout(pressedTimeout);
    pressedTimeout = window.setTimeout(() => el.classList.remove("btnPressed"), 180);
  }

  function renderTimerOnly() {
    if (!refs?.timer) return;
    if (activeCombatType === "tutorial") {
      refs.timer.textContent = "";
      return;
    }
    refs.timer.textContent = `${Math.max(0, timerRemaining)}`;
  }

  function stopTutorialInitRollAnimation() {
    for (const id of tutorialInitRollTimers) {
      window.clearTimeout(id);
    }
    tutorialInitRollTimers = [];
    refs?.initiative?.classList.remove("combatInitRolling");
  }

  function buildTutorialRollDelays(totalMs = 2000, steps = 26) {
    const n = Math.max(8, Number(steps) || 26);
    const target = Math.max(400, Number(totalMs) || 2000);
    const weights = [];
    let sum = 0;
    for (let i = 0; i < n; i += 1) {
      const t = (i + 1) / n;
      const w = 1 + (t * t * 3.8); // ease-out: fast start, slow finish
      weights.push(w);
      sum += w;
    }
    return weights.map((w) => Math.max(12, Math.round((w / sum) * target)));
  }

  function startTutorialInitRollAnimation() {
    stopTutorialInitRollAnimation();
    tutorialStep = "rolling_init";
    currentPhase = "revealRoll";
    initiativeTextHidden = false;
    refs?.initiative?.classList.add("combatInitRolling");

    const finalPlayer = rollD20();
    const finalEnemy = rollD20();
    const delays = buildTutorialRollDelays(2000, 26);
    let idx = 0;

    const step = () => {
      if (tutorialStep !== "rolling_init") return;
      if (idx < delays.length) {
        initiativeRollingValue = rollD20();
        renderTimerOnly();
        render();
        const id = window.setTimeout(step, delays[idx]);
        tutorialInitRollTimers.push(id);
        idx += 1;
        return;
      }

      stopTutorialInitRollAnimation();
      initiativeRollingValue = null;
      revealedInit.player = finalPlayer;
      revealedInit.enemy = finalEnemy;
      currentCycleInit = { player: revealedInit.player, enemy: revealedInit.enemy };
      onInitiativeReveal?.({
        turn: Number(session?.getSnapshot?.()?.turn || 1),
        player: revealedInit.player,
        enemy: revealedInit.enemy,
        combatType: activeCombatType
      });
      tutorialStep = "show_init_result";
      setNarration([
        `Tour ${Number(session?.getSnapshot?.()?.turn || 1)}`,
        `Resultat d'initiative: J ${revealedInit.player} / E ${revealedInit.enemy}.`,
        "Suivant -> ESPACE."
      ]);
      render();
    };

    step();
  }

  function computeTutorialRankOrder() {
    const p = Number(revealedInit.player ?? 0);
    const e = Number(revealedInit.enemy ?? 0);
    // Tutorial pacing: lower initiative acts first (rank 1).
    if (!Number.isFinite(p) || !Number.isFinite(e)) return ["enemy", "player"];
    if (p === e) return ["enemy", "player"];
    return p < e ? ["player", "enemy"] : ["enemy", "player"];
  }

  function startTutorialInitiativePrompt() {
    currentPhase = "askRoll";
    timerRemaining = 0;
    awaitingCombatStart = false;
    pendingLockedForOpeningInit = true;
    actionValidated = { player: false, enemy: false };
    paidThisTurn = { player: false, enemy: false };
    tutorialRankOrder = [];
    tutorialRankIndex = 0;
    tutorialStep = "await_init_roll";
    ensureAutoTargets();
    markEntityState("player", false);
    markEntityState("enemy", false);
    setNarration([
      `Tour ${Number(session?.getSnapshot?.()?.turn || 1)}`,
      "Tutoriel: lis le tempo avant d'agir.",
      "Appuie sur ESPACE pour lancer l'initiative."
    ]);
    slotsDirty = true;
    render();
    renderTimerOnly();
  }

  function startTutorialRankPhase() {
    currentPhase = "runTimer";
    timerRemaining = 0;
    pendingLockedForOpeningInit = false;
    actionValidated = { player: false, enemy: false };
    paidThisTurn = { player: false, enemy: false };
    tutorialRankOrder = computeTutorialRankOrder();
    tutorialRankIndex = 0;
    tutorialStep = "rank_phase";
    setInitiativePulseActive(false);
    setInitiativeAlertActive(false);
    ensureAutoTargets();
    markEntityState("player", false);
    markEntityState("enemy", false);
    const first = tutorialRankOrder[0] === "player" ? "Joueur" : "Ennemi";
    setNarration([
      `Tour ${Number(session?.getSnapshot?.()?.turn || 1)}`,
      `Initiative: J ${revealedInit.player} / E ${revealedInit.enemy}.`,
      `Rang 1: ${first} prend l'initiative.`,
      "Suivant -> ESPACE."
    ]);
    slotsDirty = true;
    render();
    renderTimerOnly();
  }

  function handleTutorialSpace() {
    if (!session) return;
    if (tutorialStep === "rolling_init") return;

    if (tutorialStep === "await_init_roll") {
      startTutorialInitRollAnimation();
      return;
    }

    if (tutorialStep === "show_init_result") {
      startTutorialRankPhase();
      return;
    }

    if (tutorialStep === "rank_phase") {
      const actor = tutorialRankOrder[tutorialRankIndex] || null;
      if (actor === "player") {
        ensureAutoTargets();
        if (!actionValidated.player && selectedTargets.player) validatePlayerAtInitiativeTick();
      } else if (actor === "enemy") {
        ensureAutoTargets();
        if (!actionValidated.enemy && selectedTargets.enemy) validateEntityAtTick("enemy");
      }
      tutorialRankIndex += 1;
      if (tutorialRankIndex >= tutorialRankOrder.length) {
        tutorialStep = "await_resolution";
        setNarration([
          `Tour ${Number(session?.getSnapshot?.()?.turn || 1)}`,
          "Les deux intentions sont engagees.",
          "Suivant -> ESPACE pour resoudre l'echange."
        ]);
      } else {
        const nextActor = tutorialRankOrder[tutorialRankIndex] === "player" ? "Joueur" : "Ennemi";
        setNarration([
          `Tour ${Number(session?.getSnapshot?.()?.turn || 1)}`,
          `Rang ${tutorialRankIndex}: action engagee.`,
          `Rang ${tutorialRankIndex + 1}: ${nextActor} entre dans l'echange.`,
          "Suivant -> ESPACE."
        ]);
      }
      render();
      return;
    }

    if (tutorialStep === "await_resolution") {
      resolveTurnNow();
      const snap = session?.getSnapshot?.();
      if (snap && Number(snap.player?.hp) > 0 && Number(snap.enemy?.hp) > 0) {
        tutorialStep = "post_resolution";
        setNarration([
          `Tour ${Number((snap?.turn || 2) - 1)}`,
          "Echange resolu. Lis la consequence.",
          "Suivant -> ESPACE pour ouvrir le tour suivant."
        ]);
        render();
      } else {
        tutorialStep = "idle";
      }
      return;
    }

    if (tutorialStep === "post_resolution") {
      startTutorialInitiativePrompt();
    }
  }

  function setPendingTechnique(techId) {
    if (pendingLockedForOpeningInit) {
      pushNarration("Choix verrouille tant que l'initiative n'est pas engagee.");
      render();
      return false;
    }
    if (!session?.setPendingTechniqueForPlayer) return false;
    // Pending selection is allowed during all phases (initiative included).
    let ok = session.setPendingTechniqueForPlayer(techId);
    if (!ok) {
      const source = (ui?.techniques || []).find((t) => t?.id === techId) || null;
      if (source && session?.registerTechnique?.(source)) {
        ok = session.setPendingTechniqueForPlayer(techId);
      }
    }
    if (!ok) return false;
    slotsDirty = true;
    refreshPlayerWindowCache();
    const snapshot = session.getSnapshot();
    renderTechButtons(snapshot);
    renderColumns(snapshot);
    return true;
  }

  function getDisplaySlots() {
    return ui.specialMode ? buildSpecialSlots() : ui.techniques;
  }

  function slotsSignature(snapshot) {
    const slots = getDisplaySlots();
    const mode = ui.specialMode ? "S" : "N";
    return `${mode}|${slots.map((t, i) => `${i}:${t?.id || "null"}:${techniqueTokens(t).map((tok) => tok.sym).join("")}:${snapshot.player.pendingTechId === t?.id ? "P" : ""}:${snapshot.player.techId === t?.id ? "C" : ""}`).join("|")}`;
  }

  function syncTechButtons(snapshot) {
    const slots = getDisplaySlots();
    const sig = slotsSignature(snapshot);
    if (!slotsDirty && sig === lastSlotsSignature) return;
    lastSlotsSignature = sig;
    slotsDirty = false;

    for (let i = 0; i < refs.techButtons.length; i += 1) {
      const btn = refs.techButtons[i];
      if (!(btn instanceof HTMLButtonElement)) continue;
      if (i >= slotsTotal) {
        btn.style.display = "none";
        continue;
      }
      btn.style.display = "";

      const tech = slots[i] || { id: `placeholder_${i + 1}`, name: "(vide)", seq: [], tokens: [], placeholder: true };
      const isEmpty = !!(tech.placeholder || tech.empty || !tech.id);
      const isInitLocked = !ui.specialMode && !!pendingLockedForOpeningInit;
      const wantedTitle = isEmpty ? "(vide)" : tech.name;

      if (btn.dataset.title !== wantedTitle) {
        btn.dataset.title = wantedTitle;
        btn.innerHTML = `<span class="combatTechName">${wantedTitle}</span>`;
      }

      btn.classList.add("btnAction");
      btn.classList.remove("btnDisabled");
      btn.classList.toggle("slot--empty", isEmpty);
      btn.classList.toggle("slot--locked-init", isInitLocked && !isEmpty);
      btn.classList.toggle("isPending", !ui.specialMode && snapshot.player.pendingTechId === tech.id);
      btn.classList.toggle("isCurrent", !ui.specialMode && snapshot.player.techId === tech.id);
      btn.disabled = isEmpty || isInitLocked;
    }
  }

  function applyTurnResult(result) {
    const signature = `${result?.snapshot?.turn || "-"}|${(result?.entries || []).map((e) => `${e.name}:${e.type}:${e.sym || ""}:${e.techId || ""}`).join("|")}`;
    if (signature === lastAppliedSignature) return;
    lastAppliedSignature = signature;

    const currentTurn = result?.snapshot?.turn ? Math.max(1, result.snapshot.turn - 1) : 1;
    setNarration([`Tour ${currentTurn}`, "L'echange se resolve."]);

    // Append only unresolved entities here; validated entities were already appended at reveal/auto-validate tick.
    const appendedByValidation = {
      [playerLogName]: !!actionValidated.player,
      [enemyLogName]: !!actionValidated.enemy
    };
    for (const entry of result?.entries || []) {
      if (entry?.type !== "symbol") continue;
      if (appendedByValidation[entry.name]) continue;
      logState.onSymbol(entry.name, entry);
    }

    for (const line of (result.narration || []).slice(0, 6)) pushNarration(line);
    slotsDirty = true;
  }

  function validateTurn({ auto = false } = {}) {
    const result = auto ? session.autoValidateTurn() : session.advanceTurn({ prepaid: paidThisTurn });
    applyTurnResult(result);
    actionValidated = { player: false, enemy: false };
    paidThisTurn = { player: false, enemy: false };
    initiativeTextHidden = false;
    initiativeMaskUntilTick = null;
    initiativeAnimUntilTick = null;
    initiativeRollingValue = null;
    initiativeRollingPending = false;
    timerFlashGreenTicks = 0;
    initiativeFlashRedTicks = 0;
    stopInitiativeSpin();
    setInitiativeAlertActive(false);
    refs?.initiative?.classList.remove("combatInitMasked");
    refs?.initiative?.classList.remove("combatInitRolling");
    refs?.initiative?.classList.remove("combatInitFlashRed");
    refs?.timer?.classList.remove("combatTimerFlashGreen");
  }

  function resolveTurnNow() {
    validateTurn({ auto: false });
    currentCycleInit = { player: revealedInit.player, enemy: revealedInit.enemy };
    const snap = session?.getSnapshot?.();
    if (snap && (Number(snap.player?.hp) <= 0 || Number(snap.enemy?.hp) <= 0)) {
      flow?.stop?.();
      currentPhase = "idle";
      setNarration(["Combat termine.", "Une entite ne peut plus tenir la ligne."]);
      render();
    }
  }

  function findTechById(id) {
    if (!id) return null;
    return (ui.techniques || []).find((t) => t?.id === id) || null;
  }

  function buildQueueEventsFromTech(tech, startIdx = 0, multiplierBase = 1, openOnFirst = true) {
    const tokens = techniqueTokens(tech);
    if (!tokens.length) return [];
    const out = [];
    const techType = (tech?.type === "reflex" || tech?.category === "reflex") ? "reflex" : "normal";
    for (let i = Math.max(0, startIdx); i < tokens.length; i += 1) {
      const token = normalizeToken(tokens[i]);
      if (!token) continue;
      const tokenMult = Number(token.multiplier || 0) || (token.doubled ? 2 : 1);
      const mult = Math.max(multiplierBase, tokenMult);
      out.push({
        techStart: !!openOnFirst && i === Math.max(0, startIdx),
        techEnd: i === tokens.length - 1,
        techType,
        token: {
          prefixes: [...token.prefixes],
          sym: token.sym,
          suffixes: [...token.suffixes],
          doubled: mult === 2,
          multiplier: mult
        }
      });
    }
    return out;
  }

  function computeEntityQueuedEvents(snapshot, entityKey) {
    const ent = snapshot?.[entityKey] || {};
    const currentTech = findTechById(ent.techId);
    const pendingTech = findTechById(ent.pendingTechId);
    const currentMultiplierBase = ent?.states?.airborne
      ? 3
      : ((currentTech?.type === "reflex" || currentTech?.category === "reflex") ? 2 : 1);
    const pendingMultiplierBase = ent?.states?.airborne
      ? 3
      : ((pendingTech?.type === "reflex" || pendingTech?.category === "reflex") ? 2 : 1);

    const futureCurrent = currentTech
      ? buildQueueEventsFromTech(currentTech, Number(ent.step || 0), currentMultiplierBase, Number(ent.step || 0) === 0)
      : [];
    const futurePending = pendingTech
      ? buildQueueEventsFromTech(pendingTech, 0, pendingMultiplierBase, true)
      : [];
    return [...futureCurrent, ...futurePending];
  }

  function tokenDisplayChunk(token) {
    if (!token) return "-";
    return formatToken({ ...token, doubled: false, multiplier: 1 });
  }

  function tokenMult(token) {
    if (!token) return 1;
    const mult = Number(token.multiplier || 0);
    if (mult >= 3) return 3;
    if (mult === 2 || token.doubled) return 2;
    return 1;
  }

  function tokenEquals(a, b) {
    const ta = normalizeToken(a);
    const tb = normalizeToken(b);
    if (!ta || !tb) return false;
    const ma = tokenMult(ta);
    const mb = tokenMult(tb);
    return ta.sym === tb.sym
      && ta.prefixes.join("") === tb.prefixes.join("")
      && ta.suffixes.join("") === tb.suffixes.join("")
      && ma === mb;
  }

  function renderWindowTokenSegments(events) {
    const list = (Array.isArray(events) ? events : []).filter((e) => e?.token?.sym);
    const out = [];
    let techOpen = false;
    let techCloseChar = ")";
    let techOpenType = "normal";
    let multOpen = 1;

    const closeMult = (m) => (m >= 3 ? "}" : "]");
    const openMult = (m) => (m >= 3 ? "{" : "[");

    for (const ev of list) {
      const cur = ev.token;
      if (!cur?.sym) continue;
      let chunk = "";

      if (ev.techStart) {
        if (multOpen > 1) {
          chunk += closeMult(multOpen);
          multOpen = 1;
        }
        if (techOpen) chunk += techCloseChar;
        if (ev.techType === "reflex") {
          chunk += "[";
          techCloseChar = "]";
          techOpenType = "reflex";
        } else {
          chunk += "(";
          techCloseChar = ")";
          techOpenType = "normal";
        }
        techOpen = true;
      }

      let m = tokenMult(cur);
      if (techOpenType === "reflex" && m === 2) m = 1;
      if (m > 1 && multOpen !== m) {
        if (multOpen > 1) chunk += closeMult(multOpen);
        chunk += openMult(m);
        multOpen = m;
      } else if (m === 1 && multOpen > 1) {
        chunk += closeMult(multOpen);
        multOpen = 1;
      }

      chunk += tokenDisplayChunk(cur);

      if (ev.techEnd) {
        if (multOpen > 1) {
          chunk += closeMult(multOpen);
          multOpen = 1;
        }
        if (techOpen) {
          chunk += techCloseChar;
          techOpen = false;
        }
      }

      out.push(chunk);
    }
    return out;
  }

  function computePlayerDisplayWindow(snapshot) {
    const allPastEvents = (logState?.getTokens?.(playerLogName) || []).filter((ev) => ev?.token?.sym);
    const future = computeEntityQueuedEvents(snapshot, "player");
    const wasValidated = !!actionValidated.player;
    let currentEvent = null;
    let past = [];

    if (wasValidated && allPastEvents.length) {
      // After validation, keep the validated symbol as current for this turn.
      currentEvent = allPastEvents[allPastEvents.length - 1];
      past = allPastEvents.slice(Math.max(0, allPastEvents.length - 5), allPastEvents.length - 1);
    } else {
      // Before validation, current is the next symbol to be played.
      currentEvent = future.length ? future.shift() : null;
      past = allPastEvents.slice(-4);
    }

    const next = future.slice(0, 4);
    const stream = [...past, ...(currentEvent ? [currentEvent] : []), ...next];
    const segments = renderWindowTokenSegments(stream);
    const pivot = past.length;
    return {
      last: segments.slice(0, pivot).slice(-4),
      current: segments[pivot] || "-",
      next: segments.slice(pivot + 1, pivot + 5)
    };
  }

  function computeEnemyDisplayWindow(snapshot) {
    const e = snapshot?.enemy || {};
    const allPastEvents = (logState?.getTokens?.(enemyLogName) || []).filter((ev) => ev?.token?.sym);
    let currentEvent = null;

    if (e.currentToken && allPastEvents.length) {
      const tail = allPastEvents[allPastEvents.length - 1];
      if (tokenEquals(tail?.token, e.currentToken)) {
        currentEvent = tail;
        allPastEvents.pop();
      }
    }
    if (!currentEvent && e.currentToken) {
      currentEvent = {
        techStart: false,
        techEnd: false,
        techType: "normal",
        token: normalizeToken(e.currentToken)
      };
    }

    const past = allPastEvents.slice(-4);
    const future = computeEntityQueuedEvents(snapshot, "enemy");
    const next = future.slice(0, 4);

    const stream = [...past, ...(currentEvent ? [currentEvent] : []), ...next];
    const segments = renderWindowTokenSegments(stream);
    const pivot = past.length;
    return {
      last: segments.slice(0, pivot).slice(-4),
      current: segments[pivot] || "-",
      next: segments.slice(pivot + 1, pivot + 5)
    };
  }

  function markEntityState(entity, played) {
    const el = entity === "player" ? rootEl.querySelector("#c1_player") : rootEl.querySelector("#c2_enemy");
    if (!el) return;
    el.classList.toggle("entityState--thinking", !played);
    el.classList.toggle("entityState--played", played);
  }

  function setInitiativePulseActive(active) {
    refs?.playerCard?.classList.toggle("entityState--initiativePulse", !!active);
    refs?.enemyCard?.classList.toggle("entityState--initiativePulse", !!active);
  }

  function syncInitiativePulse(timerTick) {
    const active = currentPhase === "runTimer"
      && Number.isFinite(Number(timerTick))
      && Number(timerTick) > 0
      && Number(timerTick) <= initiativePulseUntilTick;
    setInitiativePulseActive(active);
  }

  function setInitiativeAlertActive(active) {
    refs?.initiative?.classList.toggle("combatInitAlert", !!active);
  }

  function setNarrativeOnlyMode(active) {
    refs?.uiLeft?.classList.toggle("combatUiHiddenNoFade", !!forceNarrativeOnlyUiNoFade);
    refs?.uiTop?.classList.toggle("combatUiHiddenNoFade", !!forceNarrativeOnlyUiNoFade);
    refs?.uiCenter?.classList.toggle("combatUiHiddenNoFade", !!forceNarrativeOnlyUiNoFade);
    refs?.narrativeBox?.classList.toggle("combatNarrativeFocusNoFade", !!forceNarrativeOnlyUiNoFade);
    refs?.uiLeft?.classList.toggle("combatUiHidden", !!active);
    refs?.uiTop?.classList.toggle("combatUiHidden", !!active);
    refs?.uiCenter?.classList.toggle("combatUiHidden", !!active);
    refs?.narrativeBox?.classList.toggle("combatNarrativeFocus", !!active);
  }

  function setSectionVisible(node, visible) {
    if (!node) return;
    node.classList.add("combatUiHiddenNoFade");
    node.classList.toggle("combatUiHidden", !visible);
  }

  function setTechSlotsHatched(active) {
    const next = !!active;
    if (techSlotsHatchedActive === next) return;
    techSlotsHatchedActive = next;
    // Keep this hook for future intro variants, but never force a global hatch/disable.
    slotsDirty = true;
    lastSlotsSignature = "";
  }

  function setNarrativeSymbolsOnly(active) {
    const vis = active ? "hidden" : "";
    if (refs?.timer) refs.timer.style.visibility = vis;
    if (refs?.initiative) refs.initiative.style.visibility = vis;
    if (refs?.arrow) refs.arrow.style.visibility = vis;
    if (refs?.playerName) refs.playerName.style.visibility = vis;
    if (refs?.enemyName) refs.enemyName.style.visibility = vis;
    if (refs?.playerTech) refs.playerTech.style.visibility = vis;
    if (refs?.enemyTech) refs.enemyTech.style.visibility = vis;
    if (refs?.playerHp?.parentElement) refs.playerHp.parentElement.style.visibility = vis;
    if (refs?.enemyHp?.parentElement) refs.enemyHp.parentElement.style.visibility = vis;
    if (refs?.lastSymbols) refs.lastSymbols.style.visibility = vis;
    if (refs?.nextSymbols) refs.nextSymbols.style.visibility = vis;
    if (refs?.playerCard) refs.playerCard.style.visibility = "";
    if (refs?.enemyCard) refs.enemyCard.style.visibility = "";
    if (refs?.playerSymbol) refs.playerSymbol.style.visibility = "";
    if (refs?.enemySymbol) refs.enemySymbol.style.visibility = "";
  }

  function applyNarrativeIntroStage() {
    const t = Number(narrativeIntroTick || 0);
    const phaseInitOnly = t >= 16 && t < 32;
    const phasePlayerSymbol = t >= 32 && t < 48;
    const phaseUiNoTimer = t >= 48 && t < 64;

    const showLeft = phaseUiNoTimer;
    const showTop = phaseInitOnly || phasePlayerSymbol || phaseUiNoTimer;
    const showCenter = phasePlayerSymbol || phaseUiNoTimer;

    setSectionVisible(refs?.uiLeft, showLeft);
    setSectionVisible(refs?.uiTop, showTop);
    setSectionVisible(refs?.uiCenter, showCenter);
    refs?.narrativeBox?.classList.add("combatNarrativeFocusNoFade");
    refs?.narrativeBox?.classList.add("combatNarrativeFocus");

    // Timer is hidden for the whole intro (0..63u), appears only once intro ends.
    if (refs?.timer) refs.timer.style.visibility = "hidden";
    if (refs?.initiative) refs.initiative.style.visibility = showTop ? "visible" : "hidden";

    // Top enemy cluster.
    if (refs?.enemyCard) refs.enemyCard.style.visibility = phaseUiNoTimer ? "visible" : "hidden";
    if (refs?.arrow) refs.arrow.style.visibility = phaseUiNoTimer ? "visible" : "hidden";
    if (refs?.enemyHp?.parentElement) refs.enemyHp.parentElement.style.visibility = phaseUiNoTimer ? "visible" : "hidden";
    if (refs?.enemyName) refs.enemyName.style.visibility = phaseUiNoTimer ? "visible" : "hidden";
    if (refs?.enemyTech) refs.enemyTech.style.visibility = phaseUiNoTimer ? "visible" : "hidden";

    // Center player cluster: at 32u only current player symbol appears.
    if (refs?.playerCard) refs.playerCard.style.visibility = showCenter ? "visible" : "hidden";
    if (refs?.playerSymbol) refs.playerSymbol.style.visibility = showCenter ? "visible" : "hidden";
    if (refs?.playerName) refs.playerName.style.visibility = phaseUiNoTimer ? "visible" : "hidden";
    if (refs?.playerTech) refs.playerTech.style.visibility = phaseUiNoTimer ? "visible" : "hidden";
    if (refs?.playerHp?.parentElement) refs.playerHp.parentElement.style.visibility = phaseUiNoTimer ? "visible" : "hidden";
    if (refs?.lastSymbols) refs.lastSymbols.style.visibility = phaseUiNoTimer ? "visible" : "hidden";
    if (refs?.nextSymbols) refs.nextSymbols.style.visibility = phaseUiNoTimer ? "visible" : "hidden";

    setTechSlotsHatched(false);
  }

  function clearNarrativeIntroStage() {
    setSectionVisible(refs?.uiLeft, true);
    setSectionVisible(refs?.uiTop, true);
    setSectionVisible(refs?.uiCenter, true);
    refs?.narrativeBox?.classList.remove("combatNarrativeFocusNoFade");
    refs?.narrativeBox?.classList.remove("combatNarrativeFocus");

    if (refs?.timer) refs.timer.style.visibility = "";
    if (refs?.initiative) refs.initiative.style.visibility = "";
    if (refs?.enemyCard) refs.enemyCard.style.visibility = "";
    if (refs?.arrow) refs.arrow.style.visibility = "";
    if (refs?.enemyHp?.parentElement) refs.enemyHp.parentElement.style.visibility = "";
    setNarrativeSymbolsOnly(false);

    setTechSlotsHatched(false);
    slotsDirty = true;
    render();
  }

  function stopNarrativeIntroTimer() {
    if (narrativeIntroSymbolCycleTimer) window.clearInterval(narrativeIntroSymbolCycleTimer);
    narrativeIntroSymbolCycleTimer = null;
    if (narrativeIntroFastRollTimer) window.clearTimeout(narrativeIntroFastRollTimer);
    narrativeIntroFastRollTimer = null;
    if (narrativeIntroTimer) window.clearInterval(narrativeIntroTimer);
    narrativeIntroTimer = null;
    narrativeIntroSymbolValue = null;
    narrativeIntroRunning = false;
  }

  function stopRevealRollSpin() {
    if (revealRollSpinTimer) window.clearTimeout(revealRollSpinTimer);
    revealRollSpinTimer = null;
  }

  function buildProgressiveRollDelays(lengthUnits = 5, { stepsPerUnit = 6 } = {}) {
    const u = Math.max(1, Number(lengthUnits) || 1);
    const totalMs = Math.max(200, Math.round(u * Math.max(50, Number(combatTimeConfig?.unitDurationMs || 500))));
    const steps = Math.max(6, Math.min(140, Math.round(u * Math.max(2, Number(stepsPerUnit || 6)))));
    const weights = [];
    let totalWeight = 0;
    for (let i = 0; i < steps; i += 1) {
      const t = (i + 1) / steps;
      // Ease-out weighting: fast start, slower finish.
      const w = 1 + (t * t * 3.2);
      weights.push(w);
      totalWeight += w;
    }
    const delays = weights.map((w) => {
      const raw = Math.round((w / totalWeight) * totalMs);
      return Math.max(12, Math.min(MAX_ROLL_DELAY_MS, raw));
    });
    return delays.length ? delays : [ROLL_SPEED_MS];
  }

  function startRevealRollSpin(lengthUnits = combatTimeConfig?.phaseDurations?.revealRoll || 5) {
    if (revealRollSpinTimer) return;
    const delays = buildProgressiveRollDelays(lengthUnits, { stepsPerUnit: 7 });
    let idx = 0;
    const spinStep = () => {
      revealRollSpinTimer = null;
      if (currentPhase !== "revealRoll") return;
      if (!(activeCombatType === "pve" || activeCombatType === "pvp")) return;
      initiativeRollingValue = rollD20();
      renderTimerOnly();
      render();
      if (idx >= delays.length - 1) return;
      idx += 1;
      revealRollSpinTimer = window.setTimeout(spinStep, delays[idx]);
    };
    spinStep();
  }

  function completeNarrativeIntroAndStartCombat() {
    stopNarrativeIntroTimer();
    clearNarrativeIntroStage();
    forceNarrativeOnlyUi = false;
    setNarrativeOnlyMode(false);
    startCombatFlow();
    if (!useNarrativeLoopTimer && flow?.handleSpace?.()) {
      setNarration(["Initialisation terminee.", "Affichage des resultats d'initiative..."]);
      render();
    } else if (useNarrativeLoopTimer) {
      setNarration([
        "Demarrage combat narratif.",
        "Timer 1..32..0 actif."
      ]);
      render();
    }
  }

  function startNarrativeIntroSequence() {
    if (!useNarrativeIntroSequence || narrativeIntroRunning) return false;
    narrativeIntroRunning = true;
    narrativeIntroTick = 0;
    narrativeIntroSymbolIndex = 0;
    narrativeIntroSymbolValue = NARRATIVE_SYMBOL_SEQUENCE[0] || "X";
    onNarrativeIntroStart?.({ combatType: activeCombatType, tick: 0 });
    const introRollFinal = useNarrativeLoopTimer ? rollPlayerInitiativeNarrative() : rollD20();
    let introRollDisplay = useNarrativeLoopTimer ? rollD32() : rollD20();
    const initRollFinal = {
      player: introRollFinal,
      enemy: useNarrativeLoopTimer ? rollD32() : rollD20()
    };
    narrativeIntroInitialInit = { ...initRollFinal };
    const initRollDisplay = { player: initRollFinal.player, enemy: initRollFinal.enemy };
    // Intro roll animation with progressive slowdown (length=8u).
    {
      const introDelays = buildProgressiveRollDelays(8, { stepsPerUnit: 8 });
      let introIdx = 0;
      const introRollStep = () => {
        narrativeIntroFastRollTimer = null;
        if (!narrativeIntroRunning || narrativeIntroTick >= 8) return;
        introRollDisplay = useNarrativeLoopTimer ? rollD32() : rollD20();
        setNarration([
          `Intro (${narrativeIntroTick}/64u)`,
          `Roll narratif: ${introRollDisplay}`,
          "Animation en cours..."
        ]);
        render();
        if (introIdx >= introDelays.length - 1) return;
        introIdx += 1;
        narrativeIntroFastRollTimer = window.setTimeout(introRollStep, introDelays[introIdx]);
      };
      introRollStep();
    }
    setNarration([
      "Combat narratif.",
      "Sequence d'ouverture en cours..."
    ]);
    applyNarrativeIntroStage();
    render();
    narrativeIntroTimer = window.setInterval(() => {
      narrativeIntroTick += 1;
      if (narrativeIntroTick <= 8) {
        if (narrativeIntroTick === 8) {
          if (narrativeIntroFastRollTimer) window.clearTimeout(narrativeIntroFastRollTimer);
          narrativeIntroFastRollTimer = null;
          introRollDisplay = introRollFinal;
          // The very first intro result becomes the first player initiative shown in the square.
          revealedInit.player = introRollFinal;
          revealedInit.enemy = initRollFinal.enemy;
          currentCycleInit = { player: revealedInit.player, enemy: revealedInit.enemy };
          setNarration([
            `Intro (${narrativeIntroTick}/64u)`,
            `Roll narratif final: ${introRollDisplay}`,
            "Animation terminee."
          ]);
        }
      } else if (narrativeIntroTick <= 12) {
        const resultText = introRollDisplay >= 11 ? "succes narratif" : "echec narratif";
        setNarration([
          `Intro (${narrativeIntroTick}/64u)`,
          `Resultat: ${introRollDisplay}/20 (${resultText})`,
          narrativeIntroTick === 12 ? "Resultat affiche." : "Stabilisation du resultat..."
        ]);
      } else if (narrativeIntroTick < 64) {
        initRollDisplay.player = initRollFinal.player;
        initRollDisplay.enemy = initRollFinal.enemy;
        if (narrativeIntroTick >= 32 && narrativeIntroTick < 48) {
          if (!narrativeIntroSymbolCycleTimer) {
            narrativeIntroSymbolCycleTimer = window.setInterval(() => {
              if (!narrativeIntroRunning || narrativeIntroTick < 32 || narrativeIntroTick >= 48) return;
              narrativeIntroSymbolIndex = (narrativeIntroSymbolIndex + 1) % Math.max(1, NARRATIVE_SYMBOL_SEQUENCE.length);
              narrativeIntroSymbolValue = NARRATIVE_SYMBOL_SEQUENCE[narrativeIntroSymbolIndex] || "X";
              render();
            }, 85);
          }
        } else if (narrativeIntroSymbolCycleTimer) {
          window.clearInterval(narrativeIntroSymbolCycleTimer);
          narrativeIntroSymbolCycleTimer = null;
          narrativeIntroSymbolValue = null;
        }
        setNarration([
          `Intro (${narrativeIntroTick}/64u)`,
          "Resultat d'initiative:",
          `J=${initRollDisplay.player} / E=${initRollDisplay.enemy}`
        ]);
      }
      applyNarrativeIntroStage();
      render();
      if (narrativeIntroTick >= 64) {
        setNarration(["Fin de l'intro narrative.", "Demarrage du combat."]);
        completeNarrativeIntroAndStartCombat();
      }
    }, Math.max(50, Number(combatTimeConfig.unitDurationMs) || 500));
    return true;
  }

  function randomRollInRange(min, max) {
    const lo = Number(min);
    const hi = Number(max);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return 0;
    const a = Math.min(lo, hi);
    const b = Math.max(lo, hi);
    return a + Math.floor(Math.random() * (b - a + 1));
  }

  function rollD20() {
    return randomRollInRange(1, 20);
  }

  function rollD32() {
    return randomRollInRange(1, 32);
  }

  function stopInitiativeSpin() {
    if (initiativeSpinTimer) window.clearTimeout(initiativeSpinTimer);
    initiativeSpinTimer = null;
    initiativeSpinDelays = [];
    initiativeSpinDelayIndex = 0;
  }

  function startInitiativeSpin(lengthUnits = initiativeRollLengthUnits) {
    if (initiativeSpinTimer) return;
    initiativeSpinDelays = buildProgressiveRollDelays(lengthUnits, { stepsPerUnit: 5 });
    initiativeSpinDelayIndex = 0;
    const spinStep = () => {
      initiativeSpinTimer = null;
      if (!pendingNextInit) return;
      if (!refs?.initiative?.classList.contains("combatInitRolling")) return;
      initiativeRollingValue = rollD32();
      renderTimerOnly();
      render();
      const lastIdx = Math.max(0, initiativeSpinDelays.length - 1);
      const delay = initiativeSpinDelays[Math.min(initiativeSpinDelayIndex, lastIdx)] || ROLL_SPEED_MS;
      initiativeSpinDelayIndex = Math.min(lastIdx, initiativeSpinDelayIndex + 1);
      initiativeSpinTimer = window.setTimeout(spinStep, delay);
    };
    spinStep();
  }

  function rollPlayerInitiativeNarrative() {
    return randomRollInRange(8, 24);
  }

  function resolveTimerValue(timerTick) {
    const t = Number(timerTick);
    if (!useNarrativeLoopTimer) return t;
    if (!Number.isFinite(t)) return 0;
    if (t <= 32) return t;
    return Math.max(0, 64 - t);
  }

  function triggerInitiativeAlert({ timerTick, timerValue } = {}) {
    if (pendingNextInit) return;
    pendingNextInit = { player: rollPlayerInitiativeNarrative(), enemy: rollD32() };
    timerFlashGreenTicks = 1;
    initiativeFlashRedTicks = 1;
    initiativeMaskUntilTick = null;
    initiativeAnimUntilTick = null;
    initiativeRollingPending = true;
    if (useNarrativeLoopTimer) {
      const rawTick = Number(timerTick);
      const rawValue = Number(timerValue);
      if (Number.isFinite(rawTick)) initiativeRollDirection = rawTick <= 32 ? "up" : "down";
      else if (Number.isFinite(rawValue)) initiativeRollDirection = rawValue >= 16 ? "up" : "down";
      else initiativeRollDirection = "up";
      initiativeRollStopValue = initiativeRollDirection === "up" ? 32 : 0;
      const currentValue = Number.isFinite(rawValue) ? rawValue : (Number.isFinite(rawTick) ? resolveTimerValue(rawTick) : 0);
      initiativeRollLengthUnits = Math.max(1, Math.abs(Number(initiativeRollStopValue) - Number(currentValue)));
    } else {
      initiativeRollDirection = null;
      initiativeRollStopValue = null;
      initiativeRollLengthUnits = Math.max(1, Number(combatTimeConfig?.phaseDurations?.revealRoll || 5));
    }
    initiativeTextHidden = true;
    initiativeRollingValue = null;
    stopInitiativeSpin();
    setInitiativeAlertActive(true);
    refs?.initiative?.classList.add("combatInitMasked");
    refs?.initiative?.classList.remove("combatInitRolling");
    refs?.timer?.classList.add("combatTimerFlashGreen");
    refs?.initiative?.classList.add("combatInitFlashRed");
  }

  function updateInitiativeRevealOnTick(timerValue) {
    if ((timerFlashGreenTicks || 0) > 0) {
      timerFlashGreenTicks -= 1;
      if ((timerFlashGreenTicks || 0) <= 0) refs?.timer?.classList.remove("combatTimerFlashGreen");
    }
    if ((initiativeFlashRedTicks || 0) > 0) {
      initiativeFlashRedTicks -= 1;
      if ((initiativeFlashRedTicks || 0) <= 0) {
        refs?.initiative?.classList.remove("combatInitFlashRed");
        if (initiativeRollingPending) {
          initiativeRollingPending = false;
          initiativeMaskUntilTick = null;
          initiativeAnimUntilTick = null;
          initiativeTextHidden = false;
          refs?.initiative?.classList.remove("combatInitMasked");
          refs?.initiative?.classList.add("combatInitRolling");
          startInitiativeSpin(initiativeRollLengthUnits);
        }
      }
      render();
      return;
    }
    if (!pendingNextInit) return;
    const atBoundary = Number(timerValue) === 32 || Number(timerValue) === 0;
    if (useNarrativeLoopTimer) {
      const canRoll = initiativeRollDirection === "up"
        ? Number(timerValue) < Number(initiativeRollStopValue ?? 32)
        : Number(timerValue) > Number(initiativeRollStopValue ?? 0);
      if (canRoll && !atBoundary) {
        initiativeTextHidden = false;
        startInitiativeSpin(initiativeRollLengthUnits);
        refs?.initiative?.classList.remove("combatInitMasked");
        refs?.initiative?.classList.add("combatInitRolling");
        renderTimerOnly();
        render();
        return;
      }
      if (!atBoundary) {
        initiativeTextHidden = true;
        initiativeRollingValue = null;
        stopInitiativeSpin();
        refs?.initiative?.classList.add("combatInitMasked");
        refs?.initiative?.classList.remove("combatInitRolling");
        renderTimerOnly();
        render();
        return;
      }
    } else if ((initiativeAnimUntilTick || 0) > 0) {
      initiativeTextHidden = false;
      initiativeRollingValue = rollD32();
      refs?.initiative?.classList.remove("combatInitMasked");
      refs?.initiative?.classList.add("combatInitRolling");
      renderTimerOnly();
      render();
      initiativeAnimUntilTick -= 1;
      return;
    }

    // Reveal only on timer boundaries in narrative loop mode.
    if (useNarrativeLoopTimer && !atBoundary) return;

    // Reveal at boundaries and activate immediately for the next half-cycle.
    revealedInit.player = pendingNextInit.player;
    revealedInit.enemy = pendingNextInit.enemy;
    currentCycleInit = { player: revealedInit.player, enemy: revealedInit.enemy };
    pendingNextInit = null;
    initiativeMaskUntilTick = null;
    initiativeAnimUntilTick = null;
    initiativeRollingValue = null;
    initiativeRollingPending = false;
    initiativeRollDirection = null;
    initiativeRollStopValue = null;
    initiativeTextHidden = false;
    stopInitiativeSpin();
    setInitiativeAlertActive(false);
    refs?.initiative?.classList.remove("combatInitMasked");
    refs?.initiative?.classList.remove("combatInitRolling");
    render();
  }

  function maybeTriggerInitiativeRollOnPlayerValidation({ timerTick, timerValue } = {}) {
    if (!useNarrativeLoopTimer) return;
    if (pendingNextInit) return;
    const current = Number(currentCycleInit.player);
    const value = Number(timerValue);
    if (!Number.isFinite(current) || !Number.isFinite(value) || value !== current) return;
    triggerInitiativeAlert({
      timerTick: Number.isFinite(Number(timerTick)) ? Number(timerTick) : lastRunTimerTick,
      timerValue: Number.isFinite(Number(timerValue)) ? Number(timerValue) : lastRunTimerValue
    });
  }

  function validateEntityAtTick(entity) {
    if (actionValidated[entity]) return;
    const out = session.validateEntityAction(entity);
    const token = out?.token || null;
    paidThisTurn[entity] = !!out?.ok;
    actionValidated[entity] = true;
    markEntityState(entity, true);
    if (entity === "player") {
      setTargetMode("playerToEnemy");
      bindText(refs.playerSymbol, formatToken(token));
      if (token) {
        logState.onSymbol(playerLogName, {
          ...token,
          techStart: !!out?.move?.techStart,
          techEnd: !!out?.move?.techEnd,
          techType: out?.move?.techType || "normal"
        });
      }
      refreshPlayerWindowCache();
    } else {
      setTargetMode("enemyToPlayer");
      bindText(refs.enemySymbol, formatToken(token));
      if (token) {
        logState.onSymbol(enemyLogName, {
          ...token,
          techStart: !!out?.move?.techStart,
          techEnd: !!out?.move?.techEnd,
          techType: out?.move?.techType || "normal"
        });
      }
    }
    slotsDirty = true;
    render();
  }

  function validatePlayerAtInitiativeTick() {
    if (actionValidated.player) return;
    const snap = session?.getSnapshot?.();
    const hasActionQueued = !!(snap?.player?.pendingTechId || snap?.player?.techId);
    if (hasActionQueued) {
      validateEntityAtTick("player");
      return;
    }

    const out = session?.validateSpecialAction?.("player", { sym: "O", energyCost: 0, techType: "normal" });
    if (!out?.ok) {
      validateEntityAtTick("player");
      return;
    }
    paidThisTurn.player = true;
    actionValidated.player = true;
    markEntityState("player", true);
    setTargetMode("playerToEnemy");
    bindText(refs.playerSymbol, formatToken(out.token));
    logState.onSymbol(playerLogName, {
      ...out.token,
      techStart: false,
      techEnd: false,
      techType: "normal"
    });
    refreshPlayerWindowCache();
    slotsDirty = true;
    render();
  }

  function revealPlayerNow() {
    // Validation anticipee pendant le timer principal uniquement.
    if (awaitingCombatStart) return;
    if (currentPhase !== "runTimer") return;
    if (actionValidated.player) return;
    ensureAutoTargets();
    if (!selectedTargets.player) {
      pushNarration("Fixe ta cible avant de valider l'intention.");
      render();
      return;
    }
    validateEntityAtTick("player");
    maybeTriggerInitiativeRollOnPlayerValidation({});
    pushNarration("Ton intention est engagee.");
    render();
  }

  function setupTurnFlow() {
    if (flow) flow.stop();
    const runtimeUnitMs = useNarrativeLoopTimer
      ? Math.max(50, Math.floor(combatTimeConfig.unitDurationMs / 2))
      : combatTimeConfig.unitDurationMs;
    flow = createTurnFlow({
      unitDurationMs: runtimeUnitMs,
      phaseDurations: combatTimeConfig.phaseDurations,
      startTurn: 0,
      continuousRunTimer: useNarrativeLoopTimer,
      requireRollEveryTurn: activeCombatType === "pve",
      onPhaseEnter: ({ phase, turn }) => {
        currentPhase = phase;
        if (phase === "askRoll") {
          if (activeCombatType === "pvp" && turn === 0 && pvpSkipFirstReveal) {
            const initPlayer = Number(pvpInitialInit?.player);
            const initEnemy = Number(pvpInitialInit?.enemy);
            revealedInit.player = Number.isFinite(initPlayer) ? initPlayer : rollD20();
            revealedInit.enemy = Number.isFinite(initEnemy) ? initEnemy : rollD20();
            currentCycleInit = { player: revealedInit.player, enemy: revealedInit.enemy };
            pvpSkipFirstReveal = false;
            pvpInitialInit = null;
            onInitiativeReveal?.({
              turn,
              player: revealedInit.player,
              enemy: revealedInit.enemy,
              combatType: activeCombatType
            });
            setNarration([
              `Tour ${turn}`,
              `Resultat pre-combat: J ${revealedInit.player} / E ${revealedInit.enemy}.`,
              "Le rythme est fixe. La pression monte."
            ]);
            window.setTimeout(() => {
              flow?.setPhase?.("runTimer", combatTimeConfig.phaseDurations.runTimer);
            }, 0);
            slotsDirty = true;
            render();
            renderTimerOnly();
            return;
          }
          setNarrativeOnlyMode(forceNarrativeOnlyUi);
          timerRemaining = activeCombatType === "pve" ? 0 : combatTimeConfig.phaseDurations.askRoll;
          actionValidated = { player: false, enemy: false };
          paidThisTurn = { player: false, enemy: false };
          initiativePulseUntilTick = 0;
          initiativeTextHidden = false;
          initiativeMaskUntilTick = null;
          initiativeAnimUntilTick = null;
          initiativeRollingValue = null;
          pendingNextInit = null;
          stopInitiativeSpin();
          skipNextFlowResolve = false;
          setInitiativePulseActive(false);
          setInitiativeAlertActive(false);
          markEntityState("player", false);
          markEntityState("enemy", false);
          if (activeCombatType === "pve") {
            rolledInit.player = null;
            rolledInit.enemy = null;
          } else {
            rolledInit.player = useNarrativeLoopTimer ? rollPlayerInitiativeNarrative() : rollD20();
            rolledInit.enemy = useNarrativeLoopTimer ? rollD32() : rollD20();
          }
          const autoStartPvpFirstRoll = activeCombatType === "pvp" && turn === 0;
          const requirePlayerRollEveryTurn = activeCombatType === "pve";
          setNarration([
            `Tour ${turn}`,
            "Lis la posture adverse et prepare ton engagement.",
            autoStartPvpFirstRoll
              ? "Les deux camps sont prets: initiative automatique."
              : (requirePlayerRollEveryTurn
              ? "Appuie sur ESPACE pour engager ton initiative."
              : (turn === 0
              ? "Appuie sur ESPACE pour lancer la premiere initiative."
              : "Nouvelle initiative en preparation.")),
            "Choisis ton intention pendant cette fenetre."
          ]);
          if (autoStartPvpFirstRoll) {
            // PVP sync: timer starts without requiring local SPACE input.
            window.setTimeout(() => { flow?.handleSpace?.(); }, 0);
          }
        } else if (phase === "revealRoll") {
          setNarrativeOnlyMode(forceNarrativeOnlyUi);
          timerRemaining = combatTimeConfig.phaseDurations.revealRoll;
          if (activeCombatType === "pve" || activeCombatType === "pvp") {
            // 5u animation: spin initiative values before revealing final rolls.
            initiativeTextHidden = false;
            initiativeRollingValue = rollD20();
            refs?.initiative?.classList.remove("combatInitMasked");
            refs?.initiative?.classList.add("combatInitRolling");
            startRevealRollSpin(combatTimeConfig.phaseDurations.revealRoll);
            setNarration([
              `Tour ${turn}`,
              activeCombatType === "pvp"
                ? "Nouvelle initiative en cours..."
                : "Initiative en cours..."
            ]);
            render();
            renderTimerOnly();
            return;
          }
          revealedInit.player = rolledInit.player;
          revealedInit.enemy = rolledInit.enemy;
          currentCycleInit = { player: revealedInit.player, enemy: revealedInit.enemy };
          onInitiativeReveal?.({
            turn,
            player: revealedInit.player,
            enemy: revealedInit.enemy,
            combatType: activeCombatType
          });
          setNarration([
            `Tour ${turn}`,
            `Resultat d'initiative: J ${revealedInit.player} / E ${revealedInit.enemy}.`
          ]);
        } else if (phase === "runTimer") {
          stopRevealRollSpin();
          setNarrativeOnlyMode(forceNarrativeOnlyUi);
          timerRemaining = 0;
          if (turn === 0) pendingLockedForOpeningInit = false;
          ensureAutoTargets();
          if (useNarrativeLoopTimer && turn === 0) {
            revealedInit.player = narrativeIntroInitialInit?.player ?? rollPlayerInitiativeNarrative();
            revealedInit.enemy = narrativeIntroInitialInit?.enemy ?? rollD32();
            currentCycleInit = { player: revealedInit.player, enemy: revealedInit.enemy };
            narrativeIntroInitialInit = null;
            onInitiativeReveal?.({
              turn: 0,
              player: revealedInit.player,
              enemy: revealedInit.enemy,
              combatType: activeCombatType
            });
          }
          actionValidated = { player: false, enemy: false };
          paidThisTurn = { player: false, enemy: false };
          initiativePulseUntilTick = 0;
          setInitiativePulseActive(false);
          setInitiativeAlertActive(false);
          initiativeTextHidden = false;
          initiativeMaskUntilTick = null;
          initiativeAnimUntilTick = null;
          initiativeRollingValue = null;
          initiativeRollingPending = false;
          initiativeRollDirection = null;
          initiativeRollStopValue = null;
          timerFlashGreenTicks = 0;
          initiativeFlashRedTicks = 0;
          pendingNextInit = null;
          stopInitiativeSpin();
          skipNextFlowResolve = false;
          timerRemaining = 0;
          markEntityState("player", false);
          markEntityState("enemy", false);
          setNarration([
            `Tour ${turn}`,
            `Initiative: J ${revealedInit.player} / E ${revealedInit.enemy}.`,
            isOneVsOne()
              ? "Chaque camp engage son symbole sur son tempo."
              : "Le tempo de combat est actif."
          ]);
          refreshPlayerWindowCache();
        } else if (phase === "endWait") {
          stopRevealRollSpin();
          setNarrativeOnlyMode(forceNarrativeOnlyUi);
          timerRemaining = 0;
          initiativePulseUntilTick = 0;
          setInitiativePulseActive(false);
          setInitiativeAlertActive(false);
          initiativeTextHidden = false;
          setNarration(buildPostResolutionLines(session?.getSnapshot?.() || null));
          refreshPlayerWindowCache();
        }
        slotsDirty = true;
        render();
        renderTimerOnly();
      },
      onTick: ({ phase, phaseRemaining, timerTick, turn }) => {
        if (phase === "runTimer") {
          timerRemaining = resolveTimerValue(timerTick);
          lastRunTimerTick = Number(timerTick);
          lastRunTimerValue = Number(timerRemaining);
        }
        else if (phase === "endWait") timerRemaining = 0;
        else if (phase === "askRoll" && activeCombatType === "pve") timerRemaining = 0;
        else timerRemaining = phaseRemaining;
        if (phase === "revealRoll" && (activeCombatType === "pve" || activeCombatType === "pvp")) {
          initiativeTextHidden = false;
          refs?.initiative?.classList.remove("combatInitMasked");
          refs?.initiative?.classList.add("combatInitRolling");
          setNarration([
            `Tour ${turn}`,
            "L'initiative tourne..."
          ]);
          render();
        }
        syncInitiativePulse(timerTick);
        updateInitiativeRevealOnTick(resolveTimerValue(timerTick));
        renderTimerOnly();
      },
      onPhaseEnd: ({ phase, turn }) => {
        if (phase === "revealRoll" && (activeCombatType === "pve" || activeCombatType === "pvp")) {
          stopRevealRollSpin();
          revealedInit.player = rollD20();
          revealedInit.enemy = rollD20();
          currentCycleInit = { player: revealedInit.player, enemy: revealedInit.enemy };
          onInitiativeReveal?.({
            turn,
            player: revealedInit.player,
            enemy: revealedInit.enemy,
            combatType: activeCombatType
          });
          initiativeRollingValue = null;
          refs?.initiative?.classList.remove("combatInitRolling");
          setNarration([
            `Tour ${turn}`,
            `Resultat d'initiative: J ${revealedInit.player} / E ${revealedInit.enemy}.`
          ]);
          render();
          renderTimerOnly();
        }
      },
      onRunTimerTick: ({ timerTick }) => {
        const timerValue = resolveTimerValue(timerTick);
        maybeTriggerInitiativeRollOnPlayerValidation({ timerTick, timerValue });
        if (timerValue === currentCycleInit.player || timerValue === currentCycleInit.enemy) {
          initiativePulseUntilTick = Math.max(initiativePulseUntilTick, timerTick + 2);
          syncInitiativePulse(timerTick);
        }
        if (timerValue === currentCycleInit.player && !actionValidated.player) {
          ensureAutoTargets();
          if (selectedTargets.player) {
            validatePlayerAtInitiativeTick();
            maybeTriggerInitiativeRollOnPlayerValidation({ timerTick, timerValue });
          }
        }
        if (timerValue === currentCycleInit.enemy) {
          ensureAutoTargets();
          if (selectedTargets.enemy) validateEntityAtTick("enemy");
        }
        const atNarrativeBoundary = useNarrativeLoopTimer && (Number(timerValue) === 32 || Number(timerValue) === 0);
        if (atNarrativeBoundary) {
          ensureAutoTargets();
          if (!actionValidated.player && selectedTargets.player) {
            validatePlayerAtInitiativeTick();
            maybeTriggerInitiativeRollOnPlayerValidation({ timerTick, timerValue });
          }
          if (!actionValidated.enemy && selectedTargets.enemy) validateEntityAtTick("enemy");
          resolveTurnNow();
          if (Number(timerTick) === Number(combatTimeConfig.phaseDurations.runTimer)) {
            skipNextFlowResolve = true;
          }
          return;
        }
        if (!useNarrativeLoopTimer && timerTick === combatTimeConfig.phaseDurations.runTimer) {
          ensureAutoTargets();
          if (!actionValidated.player && selectedTargets.player) {
            validatePlayerAtInitiativeTick();
            maybeTriggerInitiativeRollOnPlayerValidation({ timerTick, timerValue });
          }
          if (!actionValidated.enemy && selectedTargets.enemy) validateEntityAtTick("enemy");
        }
      },
      onResolveTurn: () => {
        if (skipNextFlowResolve) {
          skipNextFlowResolve = false;
          return;
        }
        resolveTurnNow();
      }
    });
    flow.start();
  }

  function ensureArrowSvg() {
    if (!refs.arrow) return;
    if (refs.arrow.querySelector("svg")) return;
    refs.arrow.innerHTML = `
      <svg class="targetArrowSvg" aria-hidden="true">
        <line id="targetArrowLine" x1="0" y1="0" x2="0" y2="0"></line>
        <polygon id="targetArrowTip" points="0,0 0,0 0,0"></polygon>
      </svg>
    `;
  }

  function setTargetVisible(visible) {
    ui.targetVisible = !!visible;
    if (refs.arrow) refs.arrow.classList.toggle("isHidden", !ui.targetVisible);
  }

  function setTargetMode(mode) {
    targetMode = mode === "playerToEnemy" || mode === "enemyToPlayer" ? mode : null;
    setTargetVisible(!!targetMode);
    updateArrowPosition();
  }

  function updateArrowPosition() {
    if (!refs.arrow || !refs.pAnchor || !refs.eAnchor || !ui?.targetVisible || !targetMode) return;
    const shellRect = rootEl.querySelector(".combatAsciiRight")?.getBoundingClientRect();
    const pRect = refs.pAnchor.getBoundingClientRect();
    const eRect = refs.eAnchor.getBoundingClientRect();
    if (!shellRect || !shellRect.width || !shellRect.height) return;

    const playerX = pRect.left + pRect.width / 2 - shellRect.left;
    const playerY = pRect.top - shellRect.top;
    const enemyX = eRect.left + eRect.width / 2 - shellRect.left;
    const enemyY = eRect.bottom - shellRect.top;

    const x1 = targetMode === "playerToEnemy" ? playerX : enemyX;
    const y1 = targetMode === "playerToEnemy" ? playerY : enemyY;
    const x2 = targetMode === "playerToEnemy" ? enemyX : playerX;
    const y2 = targetMode === "playerToEnemy" ? enemyY : playerY;

    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    const w = Math.max(1, Math.abs(x2 - x1));
    const h = Math.max(1, Math.abs(y2 - y1));

    refs.arrow.style.left = `${minX}px`;
    refs.arrow.style.top = `${minY}px`;
    refs.arrow.style.width = `${w}px`;
    refs.arrow.style.height = `${h}px`;

    const x1l = x1 - minX;
    const y1l = y1 - minY;
    const x2l = x2 - minX;
    const y2l = y2 - minY;

    const svg = refs.arrow.querySelector("svg");
    if (svg) {
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      svg.setAttribute("width", `${w}`);
      svg.setAttribute("height", `${h}`);
    }

    const line = refs.arrow.querySelector("#targetArrowLine");
    if (line) {
      line.setAttribute("x1", `${x1l}`);
      line.setAttribute("y1", `${y1l}`);
      line.setAttribute("x2", `${x2l}`);
      line.setAttribute("y2", `${y2l}`);
    }

    const tip = refs.arrow.querySelector("#targetArrowTip");
    if (tip) {
      const dx = x2l - x1l;
      const dy = y2l - y1l;
      const len = Math.max(1, Math.hypot(dx, dy));
      const ux = dx / len;
      const uy = dy / len;
      const px = -uy;
      const py = ux;
      const headLen = 8;
      const halfBase = 3;
      const p1x = x2l;
      const p1y = y2l;
      const p2x = x2l - ux * headLen + px * halfBase;
      const p2y = y2l - uy * headLen + py * halfBase;
      const p3x = x2l - ux * headLen - px * halfBase;
      const p3y = y2l - uy * headLen - py * halfBase;
      tip.setAttribute("points", `${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y}`);
    }
  }

  function updateInitiativeBoxPosition() {
    if (!refs?.initiative || !refs?.lastSymbols || !rootEl) return;
    // Initiative box is now placed by CSS grid (no absolute positioning).
    if (window.getComputedStyle(refs.initiative).position !== "absolute") return;
    const shellRect = rootEl.querySelector(".combatAsciiRight")?.getBoundingClientRect();
    const lastRect = refs.lastSymbols.getBoundingClientRect();
    if (!shellRect || !lastRect || !shellRect.width || !lastRect.width) return;

    const gap = 1;
    const size = Math.max(42, Math.min(72, Math.floor(lastRect.height)));
    const left = Math.max(0, Math.floor(lastRect.left - shellRect.left - size - gap));
    const top = Math.max(0, Math.floor(lastRect.top - shellRect.top));

    refs.initiative.style.left = `${left}px`;
    refs.initiative.style.top = `${top}px`;
    refs.initiative.style.width = `${size}px`;
    refs.initiative.style.height = `${size}px`;
  }

  function ensureRoot() {
    if (rootEl) return;

    rootEl = document.createElement("section");
    rootEl.className = "combatOverlayGrid";
    rootEl.style.display = "none";
    rootEl.innerHTML = `
      <button type="button" class="btn combatCloseBtn box box--action" data-action="close" aria-label="Fermer">X</button>
      <button type="button" class="btn combatSettingsBtn box box--action" data-action="settings" aria-label="Parametres">Param</button>
      <div class="combatAscii">
        <section class="combatAsciiLeft">
          <div class="combatTechGrid">
            <button type="button" class="btn combatTechBtn box box--action" id="c12_tech" data-tech-slot="0"></button>
            <button type="button" class="btn combatTechBtn box box--action" id="c13_tech" data-tech-slot="1"></button>
            <button type="button" class="btn combatTechBtn box box--action" id="c14_tech" data-tech-slot="2"></button>
            <button type="button" class="btn combatTechBtn box box--action" id="c15_tech" data-tech-slot="3"></button>
            <button type="button" class="btn combatTechBtn box box--action" id="c16_tech" data-tech-slot="4"></button>
            <button type="button" class="btn combatTechBtn box box--action" id="c17_tech" data-tech-slot="5"></button>
            <button type="button" class="btn combatTechBtn box box--action" id="c18_tech" data-tech-slot="6"></button>
            <button type="button" class="btn combatTechBtn box box--action" id="c19_tech" data-tech-slot="7"></button>
            <button type="button" class="btn combatTechBtn box box--action" id="c23_tech" data-tech-slot="8"></button>
            <button type="button" class="btn combatTechBtn box box--action" id="c24_tech" data-tech-slot="9"></button>
          </div>

          <div class="combatActionRow">
            <button type="button" class="btn box box--action" id="c20_special" data-action="toggle-special">Action speciale</button>
            <div id="c21_energy" class="combatRect combatEnergyBox box box--info">
              <div class="small" data-bind="energyText">Energie : -/-</div>
            </div>
          </div>

          <div id="c_special_panel" class="combatRect combatSpecialPanel box box--info" hidden>
            <div class="combatTitleLine">Panneau speciaux</div>
            <div class="small">Placeholder des actions speciales.</div>
          </div>

          <div id="c11_log" class="combatRect combatLogBox box box--info" data-bind="logBox"></div>
        </section>

        <section class="combatAsciiRight">
          <div class="combatRightTop">
            <div id="c6_timer" class="combatSquare combatSquareInfo box box--info">-</div>
            <div id="c7_initiative" class="combatSquare combatSquareInfo box box--info" data-bind="initiative">-</div>

            <div id="c2_enemy" class="combatSquare combatSquareLarge box box--enemy">
              <span class="combatTurnRank combatEnemyOrderBadge box box--action" data-bind="enemyLastSymbol">-</span>
              <div class="small" data-bind="enemyName"></div>
              <div class="combatMainSymbol symbolUnified soaraSymbol" data-bind="enemySymbol">-</div>
              <div class="small" data-bind="enemyTech">-</div>
            </div>

            <div id="c4_hp_enemy" class="combatRect combatHpInfo box box--info">
              <span data-bind="enemyHp">-</span>
              <span class="combatTurnRank box box--action" data-bind="enemyOrder">-</span>
              <div class="targetAnchor" id="e_anchor" aria-hidden="true"></div>
            </div>
            <div id="c5_arrow" class="combatArrow box box--info" aria-hidden="true"></div>
          </div>

          <div class="combatCenterLine">
            <div class="combatPlayerCluster">
              <div class="combatPlayerTopRow">
                <div id="c3_hp_player" class="combatRect combatHpInfo box box--info">
                  <span data-bind="playerHp">-</span>
                  <span class="combatTurnRank box box--action" data-bind="playerOrder">-</span>
                  <div class="targetAnchor" id="p_anchor" aria-hidden="true"></div>
                </div>
              </div>
              <div class="combatPlayerMainRow">
                <div id="c9_last_symbols" class="combatRect combatSymbolsPanel box box--info" data-bind="lastSymbols">-</div>
                <div id="c1_player" class="combatSquare combatSquareLarge box box--info">
                  <div class="small" data-bind="playerName"></div>
                  <div class="combatMainSymbol symbolUnified soaraSymbol" data-bind="playerSymbol">-</div>
                  <div class="small" data-bind="playerTech">-</div>
                </div>
                <div id="c8_next_symbols" class="combatRect combatSymbolsPanel box box--info" data-bind="nextSymbols">-</div>
              </div>
            </div>
          </div>

          <div id="c10_narrative" class="combatRect combatNarrativeBox box box--info">
            <div data-bind="narrativeBody"></div>
            <div class="combatNarrativeHint">Espace = initialiser la premiere initiative. Resolution deterministe hors initiative.</div>
          </div>
        </section>
      </div>
    `;

    refs = {
      energyText: rootEl.querySelector('[data-bind="energyText"]'),
      logBox: rootEl.querySelector('[data-bind="logBox"]'),
      narrativeBody: rootEl.querySelector('[data-bind="narrativeBody"]'),
      playerName: rootEl.querySelector('[data-bind="playerName"]'),
      enemyName: rootEl.querySelector('[data-bind="enemyName"]'),
      playerSymbol: rootEl.querySelector('[data-bind="playerSymbol"]'),
      enemySymbol: rootEl.querySelector('[data-bind="enemySymbol"]'),
      playerCard: rootEl.querySelector("#c1_player"),
      enemyCard: rootEl.querySelector("#c2_enemy"),
      playerTech: rootEl.querySelector('[data-bind="playerTech"]'),
      enemyTech: rootEl.querySelector('[data-bind="enemyTech"]'),
      playerHp: rootEl.querySelector('[data-bind="playerHp"]'),
      enemyHp: rootEl.querySelector('[data-bind="enemyHp"]'),
      playerOrder: rootEl.querySelector('[data-bind="playerOrder"]'),
      enemyOrder: rootEl.querySelector('[data-bind="enemyOrder"]'),
      enemyLastSymbol: rootEl.querySelector('[data-bind="enemyLastSymbol"]'),
      initiative: rootEl.querySelector('[data-bind="initiative"]'),
      timer: rootEl.querySelector("#c6_timer"),
      uiLeft: rootEl.querySelector(".combatAsciiLeft"),
      uiTop: rootEl.querySelector(".combatRightTop"),
      uiCenter: rootEl.querySelector(".combatCenterLine"),
      narrativeBox: rootEl.querySelector("#c10_narrative"),
      nextSymbols: rootEl.querySelector('[data-bind="nextSymbols"]'),
      lastSymbols: rootEl.querySelector('[data-bind="lastSymbols"]'),
      specialPanel: rootEl.querySelector("#c_special_panel"),
      arrow: rootEl.querySelector("#c5_arrow"),
      pAnchor: rootEl.querySelector("#p_anchor"),
      eAnchor: rootEl.querySelector("#e_anchor"),
      techButtons: Array.from(rootEl.querySelectorAll("[data-tech-slot]"))
    };

    rootEl.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !session) return;

      const action = target.dataset.action;
      if (action === "close") {
        if (!canManualCloseCombat()) return;
        close();
        return;
      }
      if (action === "settings") {
        onOpenSettings?.();
        return;
      }
      if (action === "toggle-special") {
        pulsePressed(target);
        ui.specialMode = !ui.specialMode;
        specialInventoryOpen = false;
        specialPanelMode = null;
        slotsDirty = true;
        render();
        return;
      }

      if (target.closest("#c2_enemy")) {
        selectedTargets.player = "enemy";
        setTargetMode("playerToEnemy");
        pushNarration("Cible verrouillee: ennemi.");
        render();
        return;
      }
      if (target.closest("#c1_player")) {
        selectedTargets.enemy = "player";
        setTargetMode("enemyToPlayer");
        render();
        return;
      }

      const techButton = target.closest("[data-tech-slot]");
      if (!(techButton instanceof HTMLElement)) return;
      const slot = Number(techButton.dataset.techSlot || "-1");
      const displaySlots = getDisplaySlots();
      const tech = displaySlots[slot] || null;
      if (!tech || techniqueTokens(tech).length === 0) return;

      if (ui.specialMode) {
        pulsePressed(techButton);
        if (tech.id === "sp_cancel") {
          session.requestPlayerCancel();
          ui.narration = ["Action speciale engagee.", "Ta sequence est annulee."];
        } else if (tech.id === "sp_observe") {
          ui.narration = ["Tu observes la ligne adverse."];
        } else if (tech.id === "sp_inventory") {
          specialInventoryOpen = true;
          specialPanelMode = "inventory";
          ui.narration = ["Inventaire rapide.", "Choisis ton outil de soutien."];
        } else if (tech.id === "sp_notebook") {
          if (currentPhase !== "runTimer") {
            ui.narration = ["Le carnet s'ouvre pendant la phase d'engagement."];
            render();
            return;
          }
          if (actionValidated.player) {
            ui.narration = ["Ton action est deja engagee pour ce tour."];
            render();
            return;
          }
          const out = session.validateSpecialAction?.("player", { sym: "ITEM", energyCost: 1, techType: "normal" });
          if (!out?.ok) {
            ui.narration = ["Energie insuffisante.", "Le carnet demande 1 energie."];
            render();
            return;
          }
          paidThisTurn.player = true;
          actionValidated.player = true;
          markEntityState("player", true);
          setTargetMode("playerToEnemy");
          bindText(refs.playerSymbol, formatToken(out.token));
          logState.onSymbol(playerLogName, {
            ...out.token,
            techStart: false,
            techEnd: false,
            techType: "normal"
          });
          specialInventoryOpen = true;
          specialPanelMode = "notebook";
          ui.narration = ["Carnet ouvert.", "Tu engages 1 energie et consumes ton tour."];
        }
        render();
        return;
      }

      pulsePressed(techButton);
      if (setPendingTechnique(tech.id)) {
        pushNarration(`Intention preparee: ${tech.name}.`);
        render();
      }
    });

    hostEl.appendChild(rootEl);
    ensureArrowSvg();
  }

  function bindText(node, text) {
    if (node) node.textContent = text;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function phaseLabel(phase) {
    const key = String(phase || "").toLowerCase();
    if (key === "ask_roll") return "Preparation";
    if (key === "reveal_roll") return "Initiative";
    if (key === "run_timer") return "Resolution";
    if (key === "end_wait") return "Transition";
    if (key === "idle") return "Attente";
    return key || "-";
  }

  function buildResolutionNarrative(resolution, snapshot, playerSym, enemySym) {
    if (!resolution) return [];
    const pName = escapeHtml(snapshot?.player?.name || "Joueur");
    const eName = escapeHtml(snapshot?.enemy?.name || "Ennemi");
    const pSym = escapeHtml(playerSym || "-");
    const eSym = escapeHtml(enemySym || "-");
    const pAtk = Number(resolution.pAtkPower || 0);
    const eAtk = Number(resolution.eAtkPower || 0);
    const pMit = Number(resolution.pMit || 0);
    const eMit = Number(resolution.eMit || 0);
    const toEnemy = Number(resolution.dmgToEnemy || 0);
    const toPlayer = Number(resolution.dmgToPlayer || 0);
    const pParry = Number(resolution.parryReturnToEnemy || 0);
    const eParry = Number(resolution.parryReturnToPlayer || 0);
    const pEsqOk = Number(resolution.pEsqPower || 0) > Number(resolution.eSpentEnergy || 0);
    const eEsqOk = Number(resolution.eEsqPower || 0) > Number(resolution.pSpentEnergy || 0);
    const offensiveDuel = pAtk > 0 && eAtk > 0;

    let lectureLine = "Les deux camps tiennent la ligne et encaissent l'echange.";
    if (offensiveDuel) {
      if (pAtk > eAtk) lectureLine = `${pName} prend l'ascendant dans le duel offensif.`;
      else if (eAtk > pAtk) lectureLine = `${eName} prend l'ascendant dans le duel offensif.`;
      else lectureLine = "Duel offensif equilibre: aucun camp ne prend l'avantage net.";
    } else if (pEsqOk || eEsqOk) {
      lectureLine = `${pName} ${pEsqOk ? "trouve l'angle" : "reste sous pression"} ; ${eName} ${eEsqOk ? "trouve l'angle" : "reste sous pression"}.`;
    } else if (pMit > 0 || eMit > 0) {
      lectureLine = "Les gardes absorbent une partie de l'impact.";
    }

    let eventLine = "";
    if (pParry > 0 && eParry > 0) eventLine = "Double parade: les deux attaques sont renvoyees.";
    else if (pParry > 0) eventLine = `${pName} lit l'impact et renvoie la pression.`;
    else if (eParry > 0) eventLine = `${eName} lit l'impact et renvoie la pression.`;
    else if (pEsqOk && eEsqOk) eventLine = "Double esquive: l'echange ne trouve pas la cible.";
    else if (pEsqOk) eventLine = `${pName} rompt la ligne et evite l'impact.`;
    else if (eEsqOk) eventLine = `${eName} rompt la ligne et evite l'impact.`;

    let consequenceLine = `Consequence immediate: ${eName} perd ${toEnemy} PV ; ${pName} perd ${toPlayer} PV.`;
    if (toEnemy === 0 && toPlayer === 0) consequenceLine = "Consequence immediate: aucun degat net sur cet echange.";
    else if (toEnemy > 0 && toPlayer === 0) consequenceLine = `Consequence immediate: ${eName} cede ${toEnemy} PV, ${pName} tient la ligne.`;
    else if (toPlayer > 0 && toEnemy === 0) consequenceLine = `Consequence immediate: ${pName} cede ${toPlayer} PV, ${eName} tient la ligne.`;

    const rows = [
      `<div class="small"><b>Lecture de l'echange</b></div>`,
      `<div class="small">${pName} engage ${pSym}. ${eName} repond avec ${eSym}.</div>`,
      `<div class="small">${lectureLine}</div>`
    ];
    if (eventLine) rows.push(`<div class="small">${eventLine}</div>`);
    rows.push(`<div class="small">${consequenceLine}</div>`);
    return rows;
  }

  function buildPostResolutionLines(snapshot) {
    const pName = String(snapshot?.player?.name || "Joueur");
    const eName = String(snapshot?.enemy?.name || "Ennemi");
    const pSym = snapshot?.player?.currentToken?.sym || "-";
    const eSym = snapshot?.enemy?.currentToken?.sym || "-";
    if (pSym === "-" || eSym === "-") {
      return [
        "Fin d'echange.",
        "Consulte le log pour relire la consequence."
      ];
    }
    const resolution = computeResolution({
      playerSym: pSym,
      enemySym: eSym,
      pAtk: Number(snapshot?.player?.atkStat ?? 0),
      pDef: Number(snapshot?.player?.defStat ?? 0),
      pEsq: Number(snapshot?.player?.esqStat ?? 0),
      pArm: Number(snapshot?.player?.flatReduce ?? 0),
      eAtk: Number(snapshot?.enemy?.atkStat ?? 0),
      eDef: Number(snapshot?.enemy?.defStat ?? 0),
      eEsq: Number(snapshot?.enemy?.esqStat ?? 0),
      eArm: Number(snapshot?.enemy?.flatReduce ?? 0)
    });
    const pEsqOk = Number(resolution.pEsqPower || 0) > Number(resolution.eSpentEnergy || 0);
    const eEsqOk = Number(resolution.eEsqPower || 0) > Number(resolution.pSpentEnergy || 0);
    return [
      "Debrief de l'echange.",
      `${pName} engage ${pSym}. ${eName} repond avec ${eSym}.`,
      `Energie engagee: ${pName} ${Number(resolution.pSpentEnergy || 0)} | ${eName} ${Number(resolution.eSpentEnergy || 0)}.`,
      `Lecture d'esquive: ${pName} ${pEsqOk ? "prend l'angle" : "reste sous pression"} | ${eName} ${eEsqOk ? "prend l'angle" : "reste sous pression"}.`,
      `Consequence: ${eName} -${Number(resolution.dmgToEnemy || 0)} PV | ${pName} -${Number(resolution.dmgToPlayer || 0)} PV.`
    ];
  }

  function renderSymbolPanel(node, title, blocks, { rightFill = false } = {}) {
    if (!node) return;
    const raw = Array.isArray(blocks) ? blocks.slice(0, 4) : [];
    const cells = rightFill
      ? Array.from({ length: 4 }, (_, i) => raw[raw.length - 4 + i] || "")
      : Array.from({ length: 4 }, (_, i) => raw[i] || "");
    const flowClass = rightFill ? " combatSeqRightFill" : "";
    node.innerHTML = `
      <div class="combatTitleLine">${title}</div>
      <div class="combatSeqBlock combatSeqInline symbolUnified soaraSymbol${flowClass}">
        ${cells.map((c) => `<span class="combatTokenCell">${c || "&nbsp;"}</span>`).join("")}
      </div>
    `;
  }

  function renderTechButtons(snapshot) {
    syncTechButtons(snapshot);
  }

  function renderColumns(snapshot) {
    const pendingLabel = snapshot.player.pendingTechName || "-";
    const currentLabel = snapshot.player.techName || "-";

    const win = playerWindowCache || computePlayerDisplayWindow(snapshot);
    const winEnemy = computeEnemyDisplayWindow(snapshot);
    // Always keep player "Derniers/Prochains" synced so pending technique is visible immediately.
    if (refs.lastSymbols) renderSymbolPanel(refs.lastSymbols, "Derniers", win.last, { rightFill: true });
    if (refs.nextSymbols) renderSymbolPanel(refs.nextSymbols, "Prochains", win.next);
    const playerValidated = !!actionValidated.player;
    const enemyValidated = !!actionValidated.enemy;
    const playerSym = snapshot?.player?.currentToken?.sym || win.current || null;
    const enemySym = snapshot?.enemy?.currentToken?.sym || winEnemy.current || null;
    const resolution = (playerSym && enemySym)
      ? computeResolution({
        playerSym,
        enemySym,
        pAtk: Number(snapshot?.player?.atkStat ?? 0),
        pDef: Number(snapshot?.player?.defStat ?? 0),
        pEsq: Number(snapshot?.player?.esqStat ?? 0),
        pArm: Number(snapshot?.player?.flatReduce ?? 0),
        eAtk: Number(snapshot?.enemy?.atkStat ?? 0),
        eDef: Number(snapshot?.enemy?.defStat ?? 0),
        eEsq: Number(snapshot?.enemy?.esqStat ?? 0),
        eArm: Number(snapshot?.enemy?.flatReduce ?? 0)
      })
      : null;

    const isResolutionMoment = activeCombatType === "tutorial"
      ? (tutorialStep === "await_resolution" || tutorialStep === "post_resolution")
      : (currentPhase === "endWait");
    const showEnemySymbolNow = enemyValidated || isResolutionMoment;

    // Entity view: current symbol is visible during all phases.
    bindText(refs.playerSymbol, win.current || "?");
    refs.playerSymbol?.classList.toggle("combatSymbolHidden", false);
    refs.playerCard?.classList.toggle("entityState--played", playerValidated);
    refs.playerCard?.classList.toggle("entityState--thinking", !playerValidated);
    refs.playerCard?.classList.remove("entityState--hidden");

    // Another entity's symbol is visible only after that entity validates.
    bindText(refs.enemySymbol, showEnemySymbolNow ? (winEnemy.current || "?") : " ");
    refs.enemySymbol?.classList.toggle("combatSymbolHidden", false);
    refs.enemyCard?.classList.toggle("entityState--played", showEnemySymbolNow);
    refs.enemyCard?.classList.toggle("entityState--thinking", !showEnemySymbolNow);
    refs.enemyCard?.classList.remove("entityState--hidden");

    if (refs.logBox) {
      const lines = logState.toLines();
      refs.logBox.innerHTML = `
        <div class="combatTitleLine">Log</div>
        <div class="combatMonoLog"></div>
      `;
      const mono = refs.logBox.querySelector(".combatMonoLog");
      if (mono) {
        mono.textContent = lines.join("\n");
        mono.scrollTop = mono.scrollHeight;
      }
    }

    if (refs.narrativeBody) {
      const rows = ui.narration.slice(0, 8);
      const shouldShowResolutionNarrative = activeCombatType === "tutorial"
        ? (tutorialStep === "await_resolution" || tutorialStep === "post_resolution")
        : (currentPhase === "runTimer" || currentPhase === "endWait");
      const explainRows = shouldShowResolutionNarrative
        ? buildResolutionNarrative(resolution, snapshot, playerSym, enemySym)
        : [];
      refs.narrativeBody.innerHTML = `
        <div class="combatTitleLine">Brief narratif</div>
        ${explainRows.length ? `${explainRows.join("")}<div style="height:6px"></div>` : ""}
        ${rows.map((x) => `<div>${escapeHtml(x)}</div>`).join("")}
      `;
      refs.narrativeBody.scrollTop = refs.narrativeBody.scrollHeight;
    }

    bindText(refs.enemyTech, `Tech: ${snapshot.enemy.techName || "-"}`);
    bindText(
      refs.playerTech,
      resolution
        ? `Current: ${currentLabel} | Pending: ${pendingLabel} | Table: ->E ${resolution.dmgToEnemy} / ->J ${resolution.dmgToPlayer}`
        : `Current: ${currentLabel} | Pending: ${pendingLabel}`
    );
  }

  function emitCombatSyncPayload(snapshot) {
    if (typeof onCombatSyncPayload !== "function") return;
    const playerSym = snapshot?.player?.currentToken?.sym || null;
    const enemySym = snapshot?.enemy?.currentToken?.sym || null;
    const resolutionPreview = (playerSym && enemySym)
      ? computeResolution({
        playerSym,
        enemySym,
        pAtk: Number(snapshot?.player?.atkStat ?? 0),
        pDef: Number(snapshot?.player?.defStat ?? 0),
        pEsq: Number(snapshot?.player?.esqStat ?? 0),
        pArm: Number(snapshot?.player?.flatReduce ?? 0),
        eAtk: Number(snapshot?.enemy?.atkStat ?? 0),
        eDef: Number(snapshot?.enemy?.defStat ?? 0),
        eEsq: Number(snapshot?.enemy?.esqStat ?? 0),
        eArm: Number(snapshot?.enemy?.flatReduce ?? 0)
      })
      : null;
    const payload = {
      combatType: activeCombatType,
      phase: currentPhase,
      timer: Number(timerRemaining || 0),
      initiative: {
        player: revealedInit.player ?? null,
        enemy: revealedInit.enemy ?? null
      },
      techniques: {
        player: (getEquippedTechniques() || []).map((t) => t?.id || null),
        enemyCurrent: snapshot?.enemy?.techId || null
      },
      resolutionPreview,
      player: {
        hp: Number(snapshot?.player?.hp ?? 0),
        hpMax: Number(snapshot?.player?.hpMax ?? 0),
        techId: snapshot?.player?.techId || null,
        pendingTechId: snapshot?.player?.pendingTechId || null,
        symbol: playerSym
      },
      enemy: {
        hp: Number(snapshot?.enemy?.hp ?? 0),
        hpMax: Number(snapshot?.enemy?.hpMax ?? 0),
        techId: snapshot?.enemy?.techId || null,
        pendingTechId: snapshot?.enemy?.pendingTechId || null,
        symbol: enemySym
      }
    };
    const signature = JSON.stringify(payload);
    if (signature === lastCombatSyncSignature) return;
    lastCombatSyncSignature = signature;
    onCombatSyncPayload(payload);
  }

  function render() {
    if (!rootEl || !session) return;
    syncManualCloseControl();
    const snapshot = session.getSnapshot();

    bindText(refs.playerName, snapshot.player.name);
    bindText(refs.enemyName, snapshot.enemy.name);
    bindText(refs.playerHp, `PV ${snapshot.player.hp}/${snapshot.player.hpMax}`);
    bindText(refs.enemyHp, `PV ${snapshot.enemy.hp}/${snapshot.enemy.hpMax}`);

    const pInit = Number(revealedInit.player);
    const eInit = Number(revealedInit.enemy);
    let pOrder = "-";
    let eOrder = "-";
    if (activeCombatType === "tutorial") {
      if (Array.isArray(tutorialRankOrder) && tutorialRankOrder.length) {
        const pIdx = tutorialRankOrder.indexOf("player");
        const eIdx = tutorialRankOrder.indexOf("enemy");
        pOrder = pIdx >= 0 ? String(pIdx + 1) : "-";
        eOrder = eIdx >= 0 ? String(eIdx + 1) : "-";
      } else if (Number.isFinite(pInit) && Number.isFinite(eInit)) {
        const order = computeTutorialRankOrder();
        const pIdx = order.indexOf("player");
        const eIdx = order.indexOf("enemy");
        pOrder = pIdx >= 0 ? String(pIdx + 1) : "-";
        eOrder = eIdx >= 0 ? String(eIdx + 1) : "-";
      }
    } else if (Number.isFinite(pInit) && Number.isFinite(eInit)) {
      if (pInit === eInit) {
        pOrder = "1";
        eOrder = "1";
      } else if (pInit < eInit) {
        pOrder = "1";
        eOrder = "2";
      } else {
        pOrder = "2";
        eOrder = "1";
      }
    }
    bindText(refs.playerOrder, pOrder);
    bindText(refs.enemyOrder, eOrder);
    const lastEnemyToken = Array.isArray(snapshot.enemy?.lastTokenObjects) && snapshot.enemy.lastTokenObjects.length
      ? snapshot.enemy.lastTokenObjects[snapshot.enemy.lastTokenObjects.length - 1]
      : null;
    const lastEnemySymbol = lastEnemyToken?.sym ? formatToken(lastEnemyToken) : "-";
    bindText(refs.enemyLastSymbol, lastEnemySymbol);

    const initiativeDisplay = initiativeTextHidden
      ? ""
      : `${initiativeRollingValue != null ? initiativeRollingValue : (revealedInit.player ?? "-")}`;
    bindText(refs.initiative, initiativeDisplay);

    bindText(refs.energyText, `Energie : ${snapshot.player.energy}/${snapshot.player.energyMax}`);
    renderTimerOnly();

    if (refs.specialPanel) refs.specialPanel.hidden = !specialInventoryOpen;
    if (!refs.specialPanel?.hidden) {
      if (specialPanelMode === "notebook") {
        const lines = (logState?.toLines?.() || []).slice(0, 12);
        refs.specialPanel.innerHTML = `
          <div class="combatTitleLine">Carnet</div>
          <div class="small">Notes de combat:</div>
          ${lines.map((l) => `<div class="small">${l}</div>`).join("") || `<div class="small">-</div>`}
        `;
      } else {
        refs.specialPanel.innerHTML = `
          <div class="combatTitleLine">Inventaire</div>
          <div class="small">Potion Soin x2</div>
          <div class="small">Elixir Energie x1</div>
          <div class="small">Antidote x1</div>
        `;
      }
    }
    const specialBtn = rootEl.querySelector("#c20_special");
    if (specialBtn) {
      specialBtn.textContent = ui.specialMode ? "Techniques" : "Action speciale";
      specialBtn.classList.toggle("btnActive", ui.specialMode);
      specialBtn.classList.add("btnAction");
    }
    setTargetVisible(ui.targetVisible);

    renderTechButtons(snapshot);
    renderColumns(snapshot);
    if (narrativeIntroRunning && narrativeIntroTick >= 32 && narrativeIntroTick < 48 && narrativeIntroSymbolValue) {
      bindText(refs.playerSymbol, narrativeIntroSymbolValue);
    }
    emitCombatSyncPayload(snapshot);
    updateArrowPosition();
    updateInitiativeBoxPosition();
  }

  function getEquippedTechniques() {
    const source = ui?.techniques || equippedTechniques;
    return source.slice(0, slotsTotal).map((t) => ({
      ...t,
      seq: Array.isArray(t.seq) ? [...t.seq] : [],
      tokens: techniqueTokens(t)
    }));
  }

  function expectedTechniqueLengthRange(technique) {
    if (!technique) return null;
    const isReflex = technique?.type === "reflex" || technique?.category === "reflex";
    if (isReflex) return { min: 2, max: 2 };
    const tier = String(technique?.tier || "base").toLowerCase();
    if (tier === "base") return { min: 3, max: 4 };
    if (tier === "advanced") return { min: 4, max: 6 };
    if (tier === "expert") return { min: 7, max: 7 };
    return { min: 7, max: 9 };
  }

  function setEquippedTechniqueAt(slot, technique) {
    const i = Number(slot);
    if (!Number.isInteger(i) || i < 0 || i >= slotsTotal) return false;
    const incomingTokens = techniqueTokens(technique);
    if (!technique || !technique.id || !incomingTokens.length) return false;
    const expectedLen = expectedTechniqueLengthRange(technique);
    if (expectedLen && Number.isFinite(Number(expectedLen.min)) && Number.isFinite(Number(expectedLen.max))) {
      const len = Number(incomingTokens.length || 0);
      if (len < Number(expectedLen.min) || len > Number(expectedLen.max)) return false;
    }
    const incomingId = String(technique.id);
    const duplicateAt = equippedTechniques.findIndex((t, idx) => idx !== i && t?.id === incomingId);
    if (duplicateAt >= 0) return false;
    equippedTechniques[i] = { ...technique, seq: Array.isArray(technique.seq) ? [...technique.seq] : incomingTokens.map((t) => t.sym), tokens: incomingTokens };
    if (ui?.techniques) ui.techniques[i] = { ...equippedTechniques[i] };
    const meta = typeof getPlayerMeta === "function" ? getPlayerMeta() || {} : {};
    const nextSlots = Array.from({ length: slotsTotal }, (_, idx) => equippedTechniques[idx]?.id || null);
    meta.techSlotsTotal = slotsTotal;
    meta.techniquesBySlot = nextSlots;
    meta.equippedTechniques = nextSlots;
    slotsDirty = true;
    if (rootEl?.style.display !== "none") render();
    return true;
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      if (!canManualCloseCombat()) return;
      close();
      return;
    }
    if (event.code === "Space" && rootEl?.style.display !== "none") {
      event.preventDefault();
      onSpacePress?.();
      if (activeCombatType === "tutorial") {
        handleTutorialSpace();
        return;
      }
      if (useNarrativeIntroSequence && !narrativeIntroRunning && awaitingCombatStart) {
        if (startNarrativeIntroSequence()) render();
        return;
      }
      if (flow?.handleSpace()) {
        if (currentPhase === "askRoll") {
          setNarration(["Initiative engagee.", "Le resultat est en lecture..."]);
        }
        render();
      }
    }
  }

  function open(options = {}) {
    ensureRoot();
    initState(options);
    hostEl.style.pointerEvents = "auto";
    rootEl.style.display = "block";
    syncManualCloseControl();

    if (!escAttached) {
      document.addEventListener("keydown", onKeyDown);
      escAttached = true;
    }
    if (!resizeAttached) {
      resizeHandler = () => {
        updateArrowPosition();
        updateInitiativeBoxPosition();
      };
      window.addEventListener("resize", resizeHandler);
      resizeAttached = true;
    }

    ensureAutoTargets();
    if (useNarrativeIntroSequence) {
      setNarrativeOnlyMode(true);
      setNarration([
        "Combat narratif.",
        "Appuie sur ESPACE pour lancer l'ouverture."
      ]);
      applyNarrativeIntroStage();
      render();
    } else {
      setNarrativeOnlyMode(forceNarrativeOnlyUi);
      setNarration([
        "Pret au combat.",
        activeCombatType === "pvp"
          ? "En PVP, l'initiative part des que les deux camps sont prets."
          : "Appuie sur ESPACE pour engager la premiere initiative."
      ]);
      startCombatFlow();
      render();
    }
    onOpen?.(options);
  }

  function close() {
    if (!rootEl) return;
    rootEl.style.display = "none";
    hostEl.style.pointerEvents = "none";

    if (escAttached) {
      document.removeEventListener("keydown", onKeyDown);
      escAttached = false;
    }
    if (resizeAttached) {
      window.removeEventListener("resize", resizeHandler || updateArrowPosition);
      resizeHandler = null;
      resizeAttached = false;
    }
    if (flow) flow.stop();
    stopRevealRollSpin();
    stopInitiativeSpin();
    stopTutorialInitRollAnimation();
    stopNarrativeIntroTimer();
    clearNarrativeIntroStage();
    onClose?.();
  }

  function toggle() {
    ensureRoot();
    if (rootEl.style.display === "none") {
      open();
      return;
    }
    close();
  }

  return { open, close, toggle, setTargetVisible, getEquippedTechniques, setEquippedTechniqueAt };
}




