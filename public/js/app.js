import { createApiClient } from "./services/apiClient.js";
import { createAuthService } from "./services/authService.js";
import { createDataService } from "./services/dataService.js";
import { createStateService } from "./services/stateService.js";

import { getDomRefs } from "./ui/dom.js";
import { createModal } from "./ui/modal.js";
import { mountAuthGate } from "./ui/authGate.js";
import { mountHud } from "./ui/hud.js";
import { createPinModal } from "./ui/pinModal.js";

import { createPixiRoot } from "./pixi/pixiRoot.js";
import { createMapView } from "./pixi/mapView.js";
import { createCameraController } from "./pixi/cameraController.js";
import { createPinsRenderer } from "./pixi/pinsRenderer.js";
import { createVisitedOverlay } from "./pixi/visitedOverlay.js";

import { createCombatScreen } from "./features/combatScreen.js";
import { createPlayerState } from "./state/playerState.js";
import { TECH_CATALOGUE, buildCatalogueMap, buildRuntimeCatalogue } from "./data/techCatalogue.js";
import { formatTechniqueSequence } from "./features/tokenModel.js";
import { SYMBOLS_V6_UI } from "./data/symbolsV6.js";
import { computeEquipmentStats, getEquipmentLabel, STARTER_EQUIPMENT } from "./data/equipmentBase.js";
import { resolveInventoryObject } from "./data/inventoryObjects.js";
import { computeResolution } from "./features/resolutionSandbox.js";
import { escapeHtml } from "./utils/escapeHtml.js";

let runtimeTechCatalogue = [...TECH_CATALOGUE];
let CATALOGUE_MAP = buildCatalogueMap(runtimeTechCatalogue);
const CAMPAIGN_C01_POS = { x: 0.5, y: 0.58 };
const PLAYER_SPAWN_POS = { x: CAMPAIGN_C01_POS.x, y: CAMPAIGN_C01_POS.y };
const MAP_REVEAL_RADIUS_NORM = 0.12;
const MAX_EXPLORED_POINTS = 800;
const ENABLE_MULTI_MODE = false;
const PROGRESS_MARKERS = {
  dialogue: "prog_dialogue_done_v1",
  tutorial: "prog_t_done_v1",
  pveU: "prog_u_done_v1",
  narrativeN: "prog_n_done_v1"
};
const REWARD_TECHNIQUES = {
  tutorial: "base_003",
  pveU: "base_008",
  narrativeN: "base_009"
};
const REWARD_ITEMS = {
  c01Food: "food_bread_ration",
  c01FoodCount: 3
};
const PROGRESS_ITEM_MARKERS = {
  c01Food: "prog_c01_food_reward_v1"
};
const RACE_STARTER_PACKS = {
  humain: {
    techniques: ["base_punch", "base_guard", "base_wait"],
    reflex: "r_base_009"
  },
  gobelin: {
    techniques: ["base_quick", "base_feint", "base_024"],
    reflex: "r_base_010"
  },
  orc: {
    techniques: ["base_double", "base_turtle", "base_027"],
    reflex: "r_base_004"
  }
};

  function createNarrativeMusicController() {
  const VOLUME_KEY = "soara_music_volume";
  const DEFAULT_VOLUME = 0.03;
  const TRACK_URL = "/assets/narrative_combat.mp3";
  const audio = new Audio(TRACK_URL);
  audio.loop = true;
  audio.preload = "auto";

  function clampVolume(v) {
    return Math.max(0, Math.min(1, Number(v)));
  }

  function readStoredVolume() {
    const raw = window.localStorage.getItem(VOLUME_KEY);
    if (raw == null) {
      window.localStorage.setItem(VOLUME_KEY, String(DEFAULT_VOLUME));
      return DEFAULT_VOLUME;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      window.localStorage.setItem(VOLUME_KEY, String(DEFAULT_VOLUME));
      return DEFAULT_VOLUME;
    }
    const v = clampVolume(n);
    if (v !== n) window.localStorage.setItem(VOLUME_KEY, String(v));
    return v;
  }

  function setVolume(v) {
    const volume = clampVolume(v);
    audio.volume = volume;
    window.localStorage.setItem(VOLUME_KEY, String(volume));
    return volume;
  }

  function getVolume() {
    return clampVolume(audio.volume);
  }

  async function start() {
    audio.volume = readStoredVolume();
    if (!audio.paused) return true;
    try {
      await audio.play();
      return true;
    } catch {
      // Playback can fail if browser blocks autoplay; it retries on next user interaction.
      return false;
    }
  }

  function stop() {
    audio.pause();
    audio.currentTime = 0;
  }

  async function primeByGesture() {
    audio.volume = readStoredVolume();
    try {
      if (audio.paused) {
        await audio.play();
      }
      audio.pause();
      audio.currentTime = 0;
      return true;
    } catch {
      return false;
    }
  }

  audio.volume = readStoredVolume();
  return { start, stop, setVolume, getVolume, primeByGesture };
}

(async function bootstrap(){
  let mapOnlyMode = false;

  function setAuthMode(isAuthed){
    document.body.dataset.auth = isAuthed ? "0" : "1";
  }
  function setMapOnlyMode(enabled){
    mapOnlyMode = !!enabled;
    document.body.dataset.mapOnly = mapOnlyMode ? "1" : "0";
  }
  function isMapOnlyModeEnabled() {
    return !!mapOnlyMode;
  }

  const dom = getDomRefs();
  const mapDialogueEl = document.getElementById("mapDialogue");
  const mapDialogueTitleEl = document.getElementById("mapDialogueTitle");
  const mapDialogueBodyEl = document.getElementById("mapDialogueBody");

  const api = createApiClient();
  const auth = createAuthService({ api, storageKey: "soara_token" });
  const dataSvc = createDataService({ basePath: "/data" });
  const stateSvc = createStateService({ api });
  const pvpApi = {
    create: ({ pinId, pinX, pinY }) => api.request("/api/pvp/create", {
      method: "POST",
      body: JSON.stringify({ pinId, pinX, pinY })
    }),
    join: (code) => api.request("/api/pvp/join", {
      method: "POST",
      body: JSON.stringify({ code })
    }),
    listRooms: (pinId) => api.request(`/api/pvp/rooms?pinId=${encodeURIComponent(String(pinId || ""))}`),
    status: (code) => api.request(`/api/pvp/status/${encodeURIComponent(String(code || "").trim().toUpperCase())}`),
    ready: (code, ready) => api.request("/api/pvp/ready", {
      method: "POST",
      body: JSON.stringify({ code, ready: !!ready })
    }),
    start: (code) => api.request("/api/pvp/start", {
      method: "POST",
      body: JSON.stringify({ code })
    }),
    leave: (code) => api.request("/api/pvp/leave", {
      method: "POST",
      body: JSON.stringify({ code })
    })
  };

  const modal = createModal(dom);

  let staticData = null;
  let userState = null;
  const playerState = createPlayerState({});
  playerState.load();

  const pixi = createPixiRoot({ canvasHost: dom.canvasWrap });
  const visitedOverlay = createVisitedOverlay();

  let mapView = null;
  let camera = null;
  let pins = null;
  let multiHeartbeatTimer = null;
  let multiPlayersTimer = null;
  let multiApiAvailable = true;
  let lastCombatSyncSnapshot = null;
  const narrativeMusic = createNarrativeMusicController();
  let musicRequestedByCombatOpen = false;
  let musicStartedForCurrentCombat = false;
  let pendingProgressCombat = null;
  let travelInProgress = false;
  let sessionExploredPoints = [];
  const progressionRewardInFlight = new Set();
  const POS_CACHE_PREFIX = "soara_last_pos_v1:";

  function posCacheKeyForUser(usernameLike) {
    const u = String(usernameLike || "").trim().toLowerCase();
    return u ? `${POS_CACHE_PREFIX}${u}` : "";
  }

  function readCachedPosForUser(usernameLike) {
    const key = posCacheKeyForUser(usernameLike);
    if (!key) return null;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const x = Number(parsed?.x);
      const y = Number(parsed?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { x, y };
    } catch {
      return null;
    }
  }

  function cacheCurrentPos(pos = null) {
    const key = posCacheKeyForUser(userState?.username || userState?.name || "");
    if (!key) return;
    const x = Number((pos || userState?.pos)?.x);
    const y = Number((pos || userState?.pos)?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    window.localStorage.setItem(key, JSON.stringify({ x, y, t: Date.now() }));
  }

  async function tryStartNarrativeMusic() {
    const ok = await narrativeMusic.start();
    musicStartedForCurrentCombat = !!ok;
    return ok;
  }

  const combatScreen = createCombatScreen({
    hostEl: dom.screenFrame,
    getPlayerName: () => playerState.get().player.displayName || userState?.name || userState?.username || "Vous",
    getTechniques: () => runtimeTechCatalogue,
    getPlayerMeta: () => {
      const ps = playerState.get().player;
      const eqStats = computeEquipmentStats(ps.equipment || {});
      return {
        ...userState,
        hp: ps.stats.hp,
        hpMax: ps.stats.hpMax,
        energy: ps.stats.energy,
        energyMax: ps.stats.energyMax,
        energyRegen: ps.stats.regen,
        techSlotsTotal: ps.techSlotsTotal,
        techniquesBySlot: ps.techniquesBySlot,
        learnedTechniques: (ps.learnedTechniques || []).map((t) => (typeof t === "string" ? t : t?.id)).filter(Boolean),
        combatConfig: ps.combatConfig,
        atkStat: Number(eqStats.atk || 0),
        defStat: Number(eqStats.def || 0),
        esqStat: Number(eqStats.esq || 0)
      };
    },
    onOpen: () => {
      musicStartedForCurrentCombat = false;
    },
    onTempoReveal: ({ turn, combatType }) => {
      if (!musicRequestedByCombatOpen) return;
      if (combatType !== "narrative") return;
      if (turn !== 0) return;
      if (musicStartedForCurrentCombat) return;
      void tryStartNarrativeMusic();
    },
    onNarrativeIntroStart: ({ combatType, tick }) => {
      if (!musicRequestedByCombatOpen) return;
      if (combatType !== "narrative") return;
      if (tick !== 0) return;
      if (musicStartedForCurrentCombat) return;
      void tryStartNarrativeMusic();
    },
    onSpacePress: async () => {
      if (!musicRequestedByCombatOpen) return;
      if (musicStartedForCurrentCombat) return;
      // First attempt directly in user gesture context.
      const startedNow = await tryStartNarrativeMusic();
      if (startedNow) return;
      // If blocked, prime then retry.
      await narrativeMusic.primeByGesture();
      if (!musicStartedForCurrentCombat) {
        void tryStartNarrativeMusic();
      }
    },
    onClose: () => {
      const completedStage = pendingProgressCombat;
      const snap = lastCombatSyncSnapshot;
      pendingProgressCombat = null;
      narrativeMusic.stop();
      musicRequestedByCombatOpen = false;
      musicStartedForCurrentCombat = false;
      const p = snap?.snapshot?.player;
      const e = snap?.snapshot?.enemy;
      const combatType = String(snap?.combatType || completedStage || "combat");
      if (p && e) {
        const summary = `${combatType.toUpperCase()} | ${String(p.name || "Joueur")} PV ${Number(p.hp || 0)}/${Number(p.hpMax || 0)} vs ${String(e.name || "Ennemi")} PV ${Number(e.hp || 0)}/${Number(e.hpMax || 0)}`;
        void appendCombatHistoryEntry(summary);
      }
      if (completedStage) void applyProgressionReward(completedStage);
    },
    onOpenSettings: openSettings,
    onCombatSyncPayload: (payload) => {
      // Reserved for future multiplayer sync layer.
      lastCombatSyncSnapshot = payload;
    }
  });

  function applyRuntimeModeNotice() {
    const legend = document.getElementById("mapLegend");
    if (!legend) return;
    let note = document.getElementById("runtimeModeNotice");
    if (!note) {
      note = document.createElement("span");
      note.id = "runtimeModeNotice";
      legend.appendChild(note);
    }
    note.innerHTML = ENABLE_MULTI_MODE
      ? "<b>Mode</b> Escarmouche multi active"
      : "<b>Mode</b> Solo tactique (multi en preparation)";
  }

  function openCombatScreen(options = {}) {
    musicRequestedByCombatOpen = !!options?.withMusic;
    musicStartedForCurrentCombat = false;
    if (!musicRequestedByCombatOpen) narrativeMusic.stop();
    combatScreen.open(options);
  }

  const multiApi = {
    heartbeat: (pos) => api.request("/api/multi/heartbeat", {
      method: "POST",
      body: JSON.stringify({ pos })
    }),
    listPlayers: () => api.request("/api/multi/players")
  };

  function stopMultiSync() {
    if (multiHeartbeatTimer) window.clearInterval(multiHeartbeatTimer);
    if (multiPlayersTimer) window.clearInterval(multiPlayersTimer);
    multiHeartbeatTimer = null;
    multiPlayersTimer = null;
  }

  function handleMultiApiError(err) {
    if (Number(err?.status) === 404) {
      // Server does not expose /api/multi routes yet -> disable polling to avoid lag.
      multiApiAvailable = false;
      stopMultiSync();
    }
  }

  function startMultiSync() {
    if (!ENABLE_MULTI_MODE) return;
    if (!multiApiAvailable) return;
    stopMultiSync();
    const tick = async () => {
      try {
        const pos = userState?.pos || null;
        await multiApi.heartbeat(pos);
      } catch (e) {
        handleMultiApiError(e);
      }
      try {
        const out = await multiApi.listPlayers();
        mapView?.setRemotePlayers?.(out?.players || [], userState?.username);
      } catch (e) {
        handleMultiApiError(e);
      }
    };
    void tick();
    multiHeartbeatTimer = window.setInterval(() => {
      void multiApi.heartbeat(userState?.pos || null).catch((e) => handleMultiApiError(e));
    }, 3000);
    multiPlayersTimer = window.setInterval(() => {
      void multiApi.listPlayers()
        .then((out) => mapView?.setRemotePlayers?.(out?.players || [], userState?.username))
        .catch((e) => handleMultiApiError(e));
    }, 1000);
  }

  function getKnownTechniquesForUi(){
    const ps = getPlayerSnapshot();
    const catalog = runtimeTechCatalogue;
    const byId = CATALOGUE_MAP;
    const learnedIds = (Array.isArray(ps.learnedTechniques) ? ps.learnedTechniques : [])
      .map((t) => (typeof t === "string" ? t : t?.id))
      .filter(Boolean);
    const learned = learnedIds.map((id) => byId.get(id)).filter(Boolean);
    const baseKnown = learned.filter((t) => t.type !== "reflex");
    const reflexKnown = learned.filter((t) => t.type === "reflex");
    return { baseKnown, reflexKnown, learnedIds, catalog, byId };
  }

  function formatSeq(tokens, kind){
    return formatTechniqueSequence(tokens, {
      techType: kind === "reflex" ? "reflex" : "normal",
      maxBlocks: 6
    });
  }

  function getPlayerSnapshot() {
    return playerState.get().player;
  }

  function isAlkaneUser() {
    const playerName = String(getPlayerSnapshot()?.displayName || "").trim().toLowerCase();
    const username = String(userState?.username || "").trim().toLowerCase();
    const name = String(userState?.name || "").trim().toLowerCase();
    return username === "alkane" || name === "alkane" || playerName === "alkane";
  }

  function getUserHistory() {
    return Array.isArray(userState?.history) ? userState.history : [];
  }

  function getCombatHistoryEntries(limit = 20) {
    const hist = getUserHistory();
    return hist.filter((x) => String(x || "").startsWith("[combat]")).slice(-Math.max(1, Number(limit || 20)));
  }

  function hasHistoryMarker(marker) {
    return getUserHistory().includes(marker);
  }

  function getProgressFlags() {
    return {
      dialogueDone: hasHistoryMarker(PROGRESS_MARKERS.dialogue),
      tutorialDone: hasHistoryMarker(PROGRESS_MARKERS.tutorial),
      pveUDone: hasHistoryMarker(PROGRESS_MARKERS.pveU),
      narrativeNDone: hasHistoryMarker(PROGRESS_MARKERS.narrativeN)
    };
  }

  async function appendHistoryEntries(entries) {
    const current = getUserHistory();
    const next = [...current];
    for (const item of entries) {
      if (!item || next.includes(item)) continue;
      next.push(item);
    }
    if (next.length === current.length) return true;
    try {
      await stateSvc.patchState({ history: next });
      userState = { ...(userState || {}), history: next };
      return true;
    } catch (e) {
      console.warn("Echec mise a jour historique progression:", e);
      return false;
    }
  }

  function grantTechniqueIfMissing(techId) {
    if (!techId || !CATALOGUE_MAP.has(techId)) return;
    playerState.patch((s) => {
      const learned = Array.isArray(s.player.learnedTechniques) ? [...s.player.learnedTechniques] : [];
      if (!learned.includes(techId)) learned.push(techId);
      s.player.learnedTechniques = learned;
      if (!Array.isArray(s.player.techniquesBySlot)) {
        s.player.techniquesBySlot = Array.from({ length: Number(s.player.techSlotsTotal || 10) }, () => null);
      }
      if (!s.player.techniquesBySlot.includes(techId)) {
        const slot = s.player.techniquesBySlot.findIndex((id) => !id);
        if (slot >= 0) s.player.techniquesBySlot[slot] = techId;
      }
    });
  }

  function applyEquipmentReward({ rightHand, leftHand, accessory } = {}) {
    playerState.patch((s) => {
      if (!s.player.equipment || typeof s.player.equipment !== "object") s.player.equipment = {};
      if (rightHand) s.player.equipment.rightHand = rightHand;
      if (leftHand) s.player.equipment.leftHand = leftHand;
      if (accessory) s.player.equipment.accessory = accessory;
    });
  }

  function refreshProgressionUi() {
    hud.render(userState || {});
    renderPinsUi();
  }

  async function appendCombatHistoryEntry(line) {
    const txt = String(line || "").trim();
    if (!txt) return false;
    return appendHistoryEntries([`[combat] ${txt}`]);
  }

  async function applyProgressionReward(stage) {
    const stageKey = String(stage || "").trim();
    if (!stageKey) return;
    if (progressionRewardInFlight.has(stageKey)) return;
    progressionRewardInFlight.add(stageKey);
    try {
    if (stage === "dialogue") {
      if (!hasHistoryMarker(PROGRESS_MARKERS.dialogue)) {
        applyEquipmentReward({ rightHand: "weapon_training_sword" });
        const requestedFood = Math.max(1, Number(REWARD_ITEMS.c01FoodCount || 1));
        const grantedFood = grantInventoryItemsIfSpace(REWARD_ITEMS.c01Food, requestedFood);
        const missingFood = Math.max(0, requestedFood - grantedFood);
        let rewardLine = "";
        if (grantedFood >= requestedFood) {
          rewardLine = `Recompense: epee en bois (+2 ATK) + ${grantedFood} rations de pain.`;
        } else if (grantedFood > 0) {
          rewardLine = `Recompense: epee en bois (+2 ATK) + ${grantedFood} ration(s) de pain. Inventaire plein: ${missingFood} non ajoutee(s).`;
        } else {
          rewardLine = "Recompense: epee en bois (+2 ATK). Inventaire plein: rations non ajoutees.";
        }
        await syncInventoryToAccount({ silent: true });
        await appendHistoryEntries([
          PROGRESS_MARKERS.dialogue,
          PROGRESS_ITEM_MARKERS.c01Food,
          rewardLine
        ]);
        refreshProgressionUi();
      }
      return;
    }
    if (stage === "tutorial") {
      if (!hasHistoryMarker(PROGRESS_MARKERS.tutorial)) {
        applyEquipmentReward({ leftHand: "offhand_wood_shield" });
        grantTechniqueIfMissing(REWARD_TECHNIQUES.tutorial);
        await syncTechniquesToAccount({ silent: true });
        await appendHistoryEntries([PROGRESS_MARKERS.tutorial, "Recompense T: technique commune + bouclier (+2 DEF)."]);
        refreshProgressionUi();
      }
      return;
    }
    if (stage === "pveU") {
      if (!hasHistoryMarker(PROGRESS_MARKERS.pveU)) {
        applyEquipmentReward({ accessory: "accessory_training_gloves" });
        grantTechniqueIfMissing(REWARD_TECHNIQUES.pveU);
        await syncTechniquesToAccount({ silent: true });
        await appendHistoryEntries([PROGRESS_MARKERS.pveU, "Recompense U: technique commune + gants (+1 ESQ)."]);
        refreshProgressionUi();
      }
      return;
    }
    if (stage === "narrativeN") {
      if (!hasHistoryMarker(PROGRESS_MARKERS.narrativeN)) {
        grantTechniqueIfMissing(REWARD_TECHNIQUES.narrativeN);
        await syncTechniquesToAccount({ silent: true });
        await appendHistoryEntries([PROGRESS_MARKERS.narrativeN, "Recompense N: technique commune."]);
        refreshProgressionUi();
      }
    }
    } finally {
      progressionRewardInFlight.delete(stageKey);
    }
  }

  async function applyProgressionFromHistory() {
    const flags = getProgressFlags();
    playerState.patch((s) => {
      s.player.equipment = { ...STARTER_EQUIPMENT };
    });
    if (flags.dialogueDone) applyEquipmentReward({ rightHand: "weapon_training_sword" });
    if (flags.tutorialDone) {
      applyEquipmentReward({ leftHand: "offhand_wood_shield" });
      grantTechniqueIfMissing(REWARD_TECHNIQUES.tutorial);
    }
    if (flags.pveUDone) {
      applyEquipmentReward({ accessory: "accessory_training_gloves" });
      grantTechniqueIfMissing(REWARD_TECHNIQUES.pveU);
    }
    if (flags.narrativeNDone) {
      grantTechniqueIfMissing(REWARD_TECHNIQUES.narrativeN);
    }
    await syncTechniquesToAccount({ silent: true });
  }

  function normalizeTechniqueProfileFromAccount(stateLike) {
    const learnedSet = new Set(
      (Array.isArray(stateLike?.learnedTechniques) ? stateLike.learnedTechniques : [])
        .map((x) => (typeof x === "string" ? x : x?.id))
        .filter((id) => typeof id === "string" && CATALOGUE_MAP.has(id))
    );
    const techSlotsTotal = Math.max(1, Math.min(10, Number(stateLike?.techSlotsTotal ?? 10)));
    const rawSlots = Array.isArray(stateLike?.techniquesBySlot) ? stateLike.techniquesBySlot : [];
    const techniquesBySlot = Array.from({ length: techSlotsTotal }, (_, i) => {
      const raw = rawSlots[i];
      if (raw == null) return null;
      const id = typeof raw === "string" ? raw : raw?.id;
      return (typeof id === "string" && CATALOGUE_MAP.has(id)) ? id : null;
    });

    // Legacy fallback: old accounts had learned techniques but no equipped slots.
    if (!techniquesBySlot.some(Boolean) && learnedSet.size > 0) {
      const starter = [...learnedSet].slice(0, Math.min(4, techSlotsTotal));
      for (let i = 0; i < starter.length; i += 1) techniquesBySlot[i] = starter[i];
    }
    for (const id of techniquesBySlot) {
      if (id) learnedSet.add(id);
    }
    return {
      learnedTechniques: [...learnedSet],
      techniquesBySlot,
      techSlotsTotal,
      hasStarterKitV2: true
    };
  }

  function buildTechniquePatchFromPlayer(playerLike) {
    const normalized = normalizeTechniqueProfileFromAccount(playerLike);
    return {
      learnedTechniques: normalized.learnedTechniques,
      techniquesBySlot: normalized.techniquesBySlot,
      techSlotsTotal: normalized.techSlotsTotal,
      hasStarterKitV2: true
    };
  }

  async function syncTechniquesToAccount({ silent = false } = {}) {
    const payload = buildTechniquePatchFromPlayer(getPlayerSnapshot());
    try {
      await stateSvc.patchState(payload);
      userState = { ...(userState || {}), ...payload };
      return true;
    } catch (e) {
      if (!silent) {
        console.warn("Echec synchro techniques compte:", e);
      }
      return false;
    }
  }

  function tutorialCombatPin() {
    return {
      id: "pin_tutorial_combat",
      type: "tutorialCombat",
      name: "Tutoriel Combat",
      x: 0.54,
      y: 0.56,
      icon: "T",
      enemyEntityId: "entity_dummy_training_v1"
    };
  }

  function normalizePinOverridesMap(raw) {
    const out = {};
    const src = raw && typeof raw === "object" ? raw : {};
    for (const [rawId, rawPos] of Object.entries(src)) {
      const id = String(rawId || "").trim();
      const x = Number(rawPos?.x);
      const y = Number(rawPos?.y);
      if (!id) continue;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      out[id] = { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
    }
    return out;
  }

  function getPinOverridesMap() {
    return normalizePinOverridesMap(userState?.pinOverrides);
  }

  function applyPinOverride(pin, overrides) {
    const id = String(pin?.id || "").trim();
    if (!id) return { ...pin };
    const ov = overrides?.[id];
    if (!ov) return { ...pin };
    return { ...pin, x: Number(ov.x), y: Number(ov.y) };
  }

  function getEntitySheetById(entityId) {
    const id = String(entityId || "").trim();
    if (!id) return null;
    const rows = Array.isArray(staticData?.entitySheets) ? staticData.entitySheets : [];
    return rows.find((e) => String(e?.id || "").trim() === id) || null;
  }

  function buildEnemyPresetFromEntitySheet(entityId, fallbackName = "Ennemi") {
    const sheet = getEntitySheetById(entityId);
    if (!sheet) return { name: fallbackName };
    const stats = sheet?.stats || {};
    const info = sheet?.information || {};
    const ai = sheet?.aiProfile || {};
    const rawTechs = Array.isArray(info?.techniquesEquipees) ? info.techniquesEquipees : [];
    const techniques = rawTechs
      .map((x) => String(x || "").trim())
      .filter((id) => id && CATALOGUE_MAP.has(id));
    const mode = String(ai?.mode || "").trim();
    return {
      name: String(sheet?.identity?.nom || fallbackName),
      hp: Number.isFinite(Number(stats?.pv)) ? Number(stats.pv) : undefined,
      hpMax: Number.isFinite(Number(stats?.pvMax)) ? Number(stats.pvMax) : undefined,
      energy: Number.isFinite(Number(stats?.energie)) ? Number(stats.energie) : undefined,
      energyMax: Number.isFinite(Number(stats?.energieMax)) ? Number(stats.energieMax) : undefined,
      regen: Number.isFinite(Number(stats?.regenEnergie)) ? Number(stats.regenEnergie) : undefined,
      atkStat: Number.isFinite(Number(stats?.atk)) ? Number(stats.atk) : undefined,
      defStat: Number.isFinite(Number(stats?.def)) ? Number(stats.def) : undefined,
      esqStat: Number.isFinite(Number(stats?.esq)) ? Number(stats.esq) : undefined,
      aiProfile: { mode },
      preferredTechniques: techniques,
      forcedSymbol: mode === "scripted" ? "O" : undefined
    };
  }

  function distanceNorm(a, b) {
    const ax = Number(a?.x);
    const ay = Number(a?.y);
    const bx = Number(b?.x);
    const by = Number(b?.y);
    if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(bx) || !Number.isFinite(by)) {
      return Number.POSITIVE_INFINITY;
    }
    return Math.hypot(ax - bx, ay - by);
  }

  function getDiscoveredPinsSet() {
    const list = Array.isArray(userState?.discoveredPins) ? userState.discoveredPins : [];
    return new Set(list.map((x) => String(x || "").trim()).filter(Boolean));
  }

  function normalizeExploredPoints(rows) {
    const out = [];
    for (const p of (Array.isArray(rows) ? rows : [])) {
      const x = Number(p?.x);
      const y = Number(p?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      out.push({ x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) });
    }
    return out.slice(-MAX_EXPLORED_POINTS);
  }

  function getExploredPoints() {
    const persisted = normalizeExploredPoints(userState?.exploredPoints);
    const merged = [...persisted, ...normalizeExploredPoints(sessionExploredPoints)];
    // Dedup by coarse grid to keep size stable.
    const seen = new Set();
    const out = [];
    for (const p of merged) {
      const kx = Math.round(Number(p.x) * 1000);
      const ky = Math.round(Number(p.y) * 1000);
      const key = `${kx}:${ky}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
    return out.slice(-MAX_EXPLORED_POINTS);
  }

  function pushSessionExploredPoint(pos, spacing = MAP_REVEAL_RADIUS_NORM * 0.22) {
    const x = Number(pos?.x);
    const y = Number(pos?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const points = normalizeExploredPoints(sessionExploredPoints);
    const near = points.some((p) => distanceNorm(p, { x, y }) <= spacing);
    if (near) return false;
    points.push({ x, y });
    sessionExploredPoints = points.slice(-MAX_EXPLORED_POINTS);
    return true;
  }

  async function flushSessionExploredPoints() {
    const local = normalizeExploredPoints(sessionExploredPoints);
    if (!local.length) return false;
    const persisted = normalizeExploredPoints(userState?.exploredPoints);
    const merged = [...persisted];
    for (const p of local) {
      const near = merged.some((q) => distanceNorm(p, q) <= (MAP_REVEAL_RADIUS_NORM * 0.2));
      if (!near) merged.push(p);
    }
    const exploredPoints = merged.slice(-MAX_EXPLORED_POINTS);
    await stateSvc.patchState({ exploredPoints });
    userState = { ...(userState || {}), exploredPoints };
    sessionExploredPoints = [];
    return true;
  }

  function isPinRevealed(pin, discoveredSet = getDiscoveredPinsSet()) {
    const id = String(pin?.id || "").trim();
    if (id && discoveredSet.has(id)) return true;
    if (distanceNorm(userState?.pos, pin) <= MAP_REVEAL_RADIUS_NORM) return true;
    const explored = getExploredPoints();
    for (const p of explored) {
      if (distanceNorm(p, pin) <= MAP_REVEAL_RADIUS_NORM) return true;
    }
    return false;
  }

  function getRevealedPoints() {
    return getExploredPoints();
  }

  async function ensureDiscoveryState() {
    const current = getDiscoveredPinsSet();
    const next = new Set(current);
    if (!next.size) next.add("C");
    for (const pin of getRuntimePins()) {
      if (distanceNorm(userState?.pos, pin) <= 0.012) {
        next.add(String(pin.id || ""));
      }
    }
    const currentPoints = getExploredPoints();
    const pos = userState?.pos;
    let exploredPoints = [...currentPoints];
    if (Number.isFinite(Number(pos?.x)) && Number.isFinite(Number(pos?.y))) {
      const nearest = exploredPoints.some((p) => distanceNorm(p, pos) <= (MAP_REVEAL_RADIUS_NORM * 0.22));
      if (!nearest) exploredPoints.push({ x: Number(pos.x), y: Number(pos.y) });
      exploredPoints = exploredPoints.slice(-MAX_EXPLORED_POINTS);
    }

    const pinsChanged = next.size !== current.size;
    const pointsChanged = exploredPoints.length !== currentPoints.length;
    if (!pinsChanged && !pointsChanged) return;

    const discoveredPins = [...next].filter(Boolean);
    const patch = { discoveredPins, exploredPoints };
    try {
      await stateSvc.patchState(patch);
      userState = { ...(userState || {}), ...patch };
    } catch (e) {
      console.warn("Echec sync exploration:", e);
    }
  }

  function isPlayerOnPin(pin, threshold = 0.012) {
    return distanceNorm(userState?.pos, pin) <= threshold;
  }

  function hasTravelFood() {
    const inventory = Array.isArray(userState?.inventory)
      ? Array.from({ length: 9 }, (_, i) => userState.inventory[i] ?? null)
      : [];
    for (const raw of inventory) {
      const obj = resolveInventoryObject(raw);
      if (String(obj?.id || "") === "food_bread_ration") return true;
    }
    return false;
  }

  async function travelToPin(pin) {
    if (travelInProgress) return { ok: false, reason: "travel_in_progress" };
    const inventory = Array.isArray(userState?.inventory)
      ? Array.from({ length: 9 }, (_, i) => userState.inventory[i] ?? null)
      : Array.from({ length: 9 }, () => null);
    let consumeIndex = -1;
    for (let i = 0; i < inventory.length; i += 1) {
      const obj = resolveInventoryObject(inventory[i]);
      if (String(obj?.id || "") === "food_bread_ration") {
        consumeIndex = i;
        break;
      }
    }
    if (consumeIndex < 0) return { ok: false, reason: "no_food" };

    const consumedObj = resolveInventoryObject(inventory[consumeIndex]);
    inventory[consumeIndex] = null;
    const nextPos = { x: Number(pin?.x), y: Number(pin?.y) };
    if (!Number.isFinite(nextPos.x) || !Number.isFinite(nextPos.y)) {
      return { ok: false, reason: "invalid_pin_pos" };
    }

    const discoveredPins = [...getDiscoveredPinsSet(), String(pin?.id || "")]
      .map((x) => String(x || "").trim())
      .filter(Boolean)
      .filter((v, idx, arr) => arr.indexOf(v) === idx);
    const exploredPoints = (() => {
      const points = getExploredPoints();
      const nearest = points.some((p) => distanceNorm(p, nextPos) <= (MAP_REVEAL_RADIUS_NORM * 0.45));
      if (!nearest) points.push({ x: nextPos.x, y: nextPos.y });
      return points.slice(-MAX_EXPLORED_POINTS);
    })();

    const patch = { pos: nextPos, inventory, discoveredPins, exploredPoints };
    const startPos = { x: Number(userState?.pos?.x), y: Number(userState?.pos?.y) };
    const hasStart = Number.isFinite(startPos.x) && Number.isFinite(startPos.y);
    const distance = hasStart ? Math.hypot(nextPos.x - startPos.x, nextPos.y - startPos.y) : 0;
    const speedNormPerSec = 0.03;
    const durationMs = Math.max(1200, Math.min(45000, (distance / speedNormPerSec) * 1000));

    travelInProgress = true;
    try {
      // Commit food consumption first (server-authoritative) before movement.
      await stateSvc.patchState({ inventory });
      userState = { ...(userState || {}), inventory };
      playerState.patch((s) => {
        s.player.inventorySlots = [...inventory];
      });

      // Persist destination early so a page refresh during long travel keeps the new pin.
      // Final sync still runs at travel end to keep state authoritative.
      try {
        await stateSvc.patchState({ pos: nextPos, discoveredPins, exploredPoints });
      } catch (e) {
        console.warn("Echec pre-sync position voyage:", e);
      }

      if (hasStart && mapView?.setPlayerPosNorm) {
        await new Promise((resolve) => {
          const t0 = performance.now();
          const step = (tNow) => {
            const p = Math.max(0, Math.min(1, (tNow - t0) / durationMs));
            const x = startPos.x + (nextPos.x - startPos.x) * p;
            const y = startPos.y + (nextPos.y - startPos.y) * p;
            userState = { ...(userState || {}), pos: { x, y } };
            cacheCurrentPos({ x, y });
            mapView.setPlayerPosNorm({ x, y });
            mapView.appendTrailPointNorm?.({ x, y });
            pushSessionExploredPoint({ x, y });
            mapView.centerOnPlayer?.();
            visitedOverlay.update({
              playerPos: { x, y },
              exploredPoints: getRevealedPoints(),
              revealRadiusNorm: MAP_REVEAL_RADIUS_NORM
            });
            if (p >= 1) {
              resolve();
              return;
            }
            requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        });
      }

      await stateSvc.patchState({ pos: nextPos, discoveredPins, exploredPoints });
      userState = { ...(userState || {}), ...patch };
      cacheCurrentPos(nextPos);
      await flushSessionExploredPoints().catch(() => {});
      mapView?.setPlayerPosNorm?.(nextPos);
      mapView?.appendTrailPointNorm?.(nextPos);
      mapView?.centerOnPlayer?.();
      renderPinsUi();
    } finally {
      travelInProgress = false;
    }
    return { ok: true, consumedName: consumedObj?.name || "Vivre" };
  }

  function normalizeRaceKey(input) {
    const txt = String(input || "").trim().toLowerCase();
    if (!txt) return "";
    const ascii = txt
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (ascii === "humain" || ascii === "human") return "humain";
    if (ascii === "gobelin" || ascii === "goblin") return "gobelin";
    if (ascii === "orc" || ascii === "orque") return "orc";
    return ascii;
  }

  function getRaceStarterPack(race) {
    const key = normalizeRaceKey(race);
    return { key, pack: RACE_STARTER_PACKS[key] || null };
  }

  async function applyRaceStarterPackIfNeeded() {
    const { key: raceKey, pack } = getRaceStarterPack(userState?.race);
    if (!pack) return false;
    if (String(userState?.starterRacePackV1 || "") === raceKey) return false;

    const techSlotsTotal = Math.max(4, Math.min(10, Number(userState?.techSlotsTotal || 10) || 10));
    const preferredStarter = [...pack.techniques, pack.reflex]
      .map((id) => String(id || "").trim())
      .filter((id) => id && CATALOGUE_MAP.has(id))
      .slice(0, 4);
    if (!preferredStarter.length) return false;

    const previousLearned = Array.isArray(userState?.learnedTechniques)
      ? userState.learnedTechniques.map((x) => (typeof x === "string" ? x : x?.id)).filter(Boolean)
      : [];
    const learnedTechniques = [...new Set([...previousLearned, ...preferredStarter])];
    const slots = Array.isArray(userState?.techniquesBySlot)
      ? [...userState.techniquesBySlot]
      : Array.from({ length: techSlotsTotal }, () => null);
    while (slots.length < techSlotsTotal) slots.push(null);
    for (let i = 0; i < preferredStarter.length && i < techSlotsTotal; i += 1) {
      slots[i] = preferredStarter[i];
    }

    const previousReflexes = Array.isArray(userState?.learnedReflexes)
      ? userState.learnedReflexes.map((x) => String(x || "").trim()).filter(Boolean)
      : [];
    const learnedReflexes = pack.reflex
      ? [...new Set([...previousReflexes, pack.reflex])]
      : previousReflexes;

    const patch = {
      learnedTechniques,
      techniquesBySlot: slots.slice(0, techSlotsTotal),
      techSlotsTotal,
      learnedReflexes,
      hasStarterKitV2: true,
      starterRacePackV1: raceKey
    };

    try {
      await stateSvc.patchState(patch);
      userState = { ...(userState || {}), ...patch };
    } catch (e) {
      const msg = String(e?.data?.message || e?.data?.error || e?.message || "");
      const shouldRetryWithoutMarker = msg.includes("starterRacePackV1") || msg.includes("unknown_fields");
      if (!shouldRetryWithoutMarker) throw e;
      const fallbackPatch = { ...patch };
      delete fallbackPatch.starterRacePackV1;
      await stateSvc.patchState(fallbackPatch);
      userState = { ...(userState || {}), ...fallbackPatch };
    }

    playerState.patch((s) => {
      s.player.learnedTechniques = [...learnedTechniques];
      s.player.techniquesBySlot = [...patch.techniquesBySlot];
      s.player.techSlotsTotal = techSlotsTotal;
      s.player.hasStarterKitV2 = true;
    });
    return true;
  }

  function getRuntimePinsBase() {
    const flags = getProgressFlags();
    const sourcePins = Array.isArray(staticData?.pins) ? staticData.pins : [];
    const campPin = sourcePins.find((pin) => pin?.id === "C");
    const pvePin = sourcePins.find((pin) => pin?.id === "U");
    const narrativePin = sourcePins.find((pin) => pin?.id === "N");
    const out = [];
    if (campPin) out.push({ ...campPin });
    if (flags.dialogueDone) out.push(tutorialCombatPin());
    if (flags.tutorialDone && pvePin) out.push({ ...pvePin });
    if (flags.pveUDone && narrativePin) out.push({ ...narrativePin });
    return out;
  }

  function getRuntimePins() {
    const base = getRuntimePinsBase();
    if (!isAlkaneUser()) return base;
    const overrides = getPinOverridesMap();
    return base.map((pin) => applyPinOverride(pin, overrides));
  }

  function renderPinsUi() {
    if (!pins || !staticData) return;
    const runtimePins = getRuntimePins();
    const revealedPins = runtimePins.filter((pin) => isPinRevealed(pin));
    pins.render(revealedPins, userState || {});
    visitedOverlay.update({
      playerPos: userState?.pos || null,
      exploredPoints: getRevealedPoints(),
      revealRadiusNorm: MAP_REVEAL_RADIUS_NORM
    });
    if (selectedPinId) {
      const selected = revealedPins.find((p) => String(p?.id || "") === selectedPinId);
      if (selected) selectPinAndRenderDialogue(selected);
      else renderDefaultMapDialogue();
    }
  }

  function onStateChanged(next){
    userState = next;
    cacheCurrentPos(userState?.pos);
    hud.render(userState);
    renderPinsUi();
  }

  function hasCompleteCharacterProfile(stateLike) {
    const name = String(stateLike?.name || "").trim();
    const race = String(stateLike?.race || "").trim();
    return !!(name && race);
  }

  function normalizeInventoryFromAccount(value) {
    if (!Array.isArray(value)) return Array.from({ length: 9 }, () => null);
    const out = Array.from({ length: 9 }, (_, i) => {
      const v = value[i];
      if (v == null) return null;
      return String(v).trim() || null;
    });
    return out;
  }

  function sanitizeInventoryForProgress(rawInventory) {
    const inv = normalizeInventoryFromAccount(rawInventory);
    const hasFoodReward = hasHistoryMarker(PROGRESS_ITEM_MARKERS.c01Food);
    if (hasFoodReward) return inv;
    let changed = false;
    const next = inv.map((entry) => {
      const obj = resolveInventoryObject(entry);
      if (obj?.type === "food") {
        changed = true;
        return null;
      }
      return entry;
    });
    return changed ? next : inv;
  }

  function sanitizeTravelFoodInventory(rawInventory) {
    const inv = normalizeInventoryFromAccount(rawInventory);
    const hasRationReward = hasHistoryMarker(PROGRESS_ITEM_MARKERS.c01Food);
    let changed = false;
    const next = inv.map((entry) => {
      const obj = resolveInventoryObject(entry);
      if (obj?.type !== "food") return entry;
      if (String(obj?.id || "") === "food_bread_ration" && hasRationReward) return entry;
      changed = true;
      return null;
    });
    return changed ? next : inv;
  }

  function buildInventoryCounts(inventory) {
    const counts = new Map();
    const inv = Array.isArray(inventory) ? inventory : [];
    for (const raw of inv) {
      const item = resolveInventoryObject(raw);
      const key = String(item?.id || item?.name || "").trim();
      if (!key) continue;
      counts.set(key, Number(counts.get(key) || 0) + 1);
    }
    return counts;
  }

  function formatInventoryItemLabel(raw, countsMap) {
    const item = resolveInventoryObject(raw);
    const key = String(item?.id || item?.name || "").trim();
    if (!key || !item?.name) return "";
    const count = Number(countsMap?.get(key) || 0);
    const qty = Math.max(1, count);
    return `x${qty} ${item.name}`;
  }

  async function syncInventoryToAccount({ silent = false } = {}) {
    const inv = Array.from({ length: 9 }, (_, i) => getPlayerSnapshot()?.inventorySlots?.[i] ?? null);
    try {
      await stateSvc.patchState({ inventory: inv });
      userState = { ...(userState || {}), inventory: inv };
      return true;
    } catch (e) {
      if (!silent) console.warn("Echec synchro inventaire compte:", e);
      return false;
    }
  }

  function grantInventoryItemIfSpace(itemId) {
    const id = String(itemId || "").trim();
    if (!id) return false;
    let granted = false;
    playerState.patch((s) => {
      const inv = Array.isArray(s.player.inventorySlots)
        ? Array.from({ length: 9 }, (_, i) => s.player.inventorySlots[i] ?? null)
        : Array.from({ length: 9 }, () => null);
      const emptyIndex = inv.findIndex((x) => x == null);
      if (emptyIndex < 0) return;
      inv[emptyIndex] = id;
      s.player.inventorySlots = inv;
      granted = true;
    });
    return granted;
  }

  function grantInventoryItemsIfSpace(itemId, count) {
    const qty = Math.max(0, Number(count) || 0);
    if (!qty) return 0;
    let granted = 0;
    for (let i = 0; i < qty; i += 1) {
      if (!grantInventoryItemIfSpace(itemId)) break;
      granted += 1;
    }
    return granted;
  }

  async function ensureCharacterProfileOnGate() {
    if (hasCompleteCharacterProfile(userState)) return;
    if (!dom.characterGate) return;

    setAuthMode(false);
    dom.characterName.value = String(userState?.name || userState?.username || "").trim();
    dom.characterRace.value = String(userState?.race || "Humain");
    dom.characterMsg.textContent = "";
    dom.characterGate.style.display = "block";

    await new Promise((resolve) => {
      const submit = async () => {
        try {
          const name = String(dom.characterName?.value || "").trim();
          const race = String(dom.characterRace?.value || "").trim();
          if (!name) {
            dom.characterMsg.textContent = "Nom requis.";
            return;
          }
          if (!race) {
            dom.characterMsg.textContent = "Espece requise.";
            return;
          }
          dom.characterMsg.textContent = "";
          const patch = { name, race };
          await stateSvc.patchState(patch);
          userState = { ...(userState || {}), ...patch };
          playerState.patch((s) => {
            s.player.displayName = name || s.player.displayName;
          });
          dom.characterGate.style.display = "none";
          setAuthMode(true);
          resolve();
        } catch (e) {
          dom.characterMsg.textContent = String(e?.data?.message || e?.data?.error || e?.message || "Erreur de validation.");
        }
      };

      dom.btnCharacterSubmit.onclick = () => { void submit(); };
      dom.characterName.onkeydown = (ev) => {
        if (ev.key !== "Enter") return;
        ev.preventDefault();
        void submit();
      };
    });
  }

  const pinModal = createPinModal({
    modal,
    getCampaigns: () => (staticData?.campaigns || {}),
    campaignRunner: { start: () => {} },
    openCombatScreen: (options) => openCombatScreen(options),
    pvpApi,
    onCombatLaunch: (stage) => {
      if (stage === "tutorial") pendingProgressCombat = "tutorial";
      if (stage === "pve") pendingProgressCombat = "pveU";
      if (stage === "narrative") pendingProgressCombat = "narrativeN";
    }
  });

  let selectedPinId = null;
  let mapDialogueActions = new Map();

  function normalizeMapDialogueType(type) {
    const key = String(type || "info").toLowerCase();
    if (key === "dialogue") return "dialogue";
    if (key === "carte") return "carte";
    if (key === "tutoriel") return "tutoriel";
    return "info";
  }

  function renderMapDialogue({ type = "info", title = "Boite de dialogue", lines = [], choices = [], dialogue = null } = {}) {
    if (!mapDialogueEl || !mapDialogueTitleEl || !mapDialogueBodyEl) return;
    const uiType = normalizeMapDialogueType(type);
    mapDialogueEl.setAttribute("data-type", uiType);
    mapDialogueTitleEl.textContent = String(title || "Boite de dialogue");
    mapDialogueActions = new Map();

    const safeLines = Array.isArray(lines) ? lines : [];
    const safeChoices = Array.isArray(choices) ? choices : [];
    const renderChoices = (asLines = false) => safeChoices.map((choice, i) => {
      const key = `choice_${i}`;
      mapDialogueActions.set(key, choice?.onClick);
      if (asLines) {
        return `<div class="mapDialogueLine"><button class="mapDialogueChoice" data-choice="${key}">${escapeHtml(String(choice?.label || "Choix"))}</button></div>`;
      }
      return `<button class="mapDialogueChoice" data-choice="${key}">${escapeHtml(String(choice?.label || "Choix"))}</button>`;
    }).join("");
    let htmlBody = "";

    if (uiType === "dialogue") {
      const leftEntity = escapeHtml(String(dialogue?.leftEntity || "Entite A"));
      const rightEntity = escapeHtml(String(dialogue?.rightEntity || "Entite B"));
      const leftLines = Array.isArray(dialogue?.leftLines) ? dialogue.leftLines : [];
      const rightLines = Array.isArray(dialogue?.rightLines) ? dialogue.rightLines : [];
      htmlBody += `
        <div class="mapDialogueSplit">
          <section class="mapDialoguePane">
            <div class="mapDialogueSpeaker">${leftEntity}</div>
            ${leftLines.map((line) => `<div class="mapDialogueLine">${escapeHtml(String(line || ""))}</div>`).join("")}
            ${safeChoices.length ? `<div class="mapDialogueChoices mapDialogueChoicesInPane">${renderChoices(true)}</div>` : ``}
          </section>
          <section class="mapDialoguePane">
            <div class="mapDialogueSpeaker">${rightEntity}</div>
            ${rightLines.map((line) => `<div class="mapDialogueLine">${escapeHtml(String(line || ""))}</div>`).join("")}
          </section>
        </div>
      `;
    } else {
      htmlBody += safeLines.map((line) => `<div class="mapDialogueLine">${escapeHtml(String(line || ""))}</div>`).join("");
    }

    if (safeChoices.length && uiType !== "dialogue") {
      htmlBody += `<div class="mapDialogueChoices">${renderChoices()}</div>`;
    }
    mapDialogueBodyEl.innerHTML = htmlBody;

    for (const btn of Array.from(mapDialogueBodyEl.querySelectorAll(".mapDialogueChoice"))) {
      btn.onclick = () => {
        const key = String(btn.getAttribute("data-choice") || "");
        const fn = mapDialogueActions.get(key);
        if (typeof fn === "function") fn();
      };
    }
  }

  function renderDefaultMapDialogue() {
    selectedPinId = null;
    renderMapDialogue({
      type: "info",
      title: "Boite de dialogue",
      lines: [
        "Clique sur un pin pour afficher ses informations et ses choix."
      ],
      choices: []
    });
  }

  function ensureCampaignState(campaignId, startNode) {
    if (!userState) return;
    if (!userState.campaign || typeof userState.campaign !== "object") userState.campaign = {};
    if (!userState.campaign[campaignId]) userState.campaign[campaignId] = { node: startNode, completed: false };
    if (!userState.campaign[campaignId].node) userState.campaign[campaignId].node = startNode;
  }

  async function applyCampaignPatch(patch) {
    if (!userState || !patch || typeof patch !== "object") return;
    Object.assign(userState, patch);
    if (patch.campaign) {
      userState.campaign = { ...(userState.campaign || {}), ...patch.campaign };
    }
    await stateSvc.patchState(patch);
    onStateChanged(userState);
  }

  async function handleCampaignChoiceInMap(campaign, nodeId, choice) {
    if (!campaign || !choice) return;
    const patch = {};
    let grantedLoadoutPatch = null;
    if (choice.effects && typeof choice.effects === "object") {
      for (const [k, v] of Object.entries(choice.effects)) {
        if (k === "grantLoadout") {
          const grant = v && typeof v === "object" ? v : {};
          const baseTechs = Array.isArray(grant.techniques)
            ? grant.techniques.filter((x) => typeof x === "string" && x.trim())
            : [];
          const reflexId = typeof grant.reflex === "string" && grant.reflex.trim() ? grant.reflex : null;
          const grantedTechniques = reflexId ? [...baseTechs, reflexId] : [...baseTechs];
          const techSlotsTotal = Math.max(4, Number(userState?.techSlotsTotal || 10) || 10);
          const previousLearned = Array.isArray(userState?.learnedTechniques) ? userState.learnedTechniques : [];
          const learnedTechniques = [...new Set([...previousLearned, ...grantedTechniques])];
          const slots = Array.isArray(userState?.techniquesBySlot)
            ? [...userState.techniquesBySlot]
            : Array.from({ length: techSlotsTotal }, () => null);
          while (slots.length < techSlotsTotal) slots.push(null);
          const starterSlots = [...baseTechs, reflexId].filter(Boolean).slice(0, techSlotsTotal);
          for (let i = 0; i < starterSlots.length; i += 1) slots[i] = starterSlots[i];
          const previousReflexes = Array.isArray(userState?.learnedReflexes) ? userState.learnedReflexes : [];
          const learnedReflexes = reflexId ? [...new Set([...previousReflexes, reflexId])] : previousReflexes;
          grantedLoadoutPatch = {
            learnedTechniques,
            techniquesBySlot: slots.slice(0, techSlotsTotal),
            techSlotsTotal,
            learnedReflexes,
            hasStarterKitV2: true
          };
          continue;
        }
        if (k === "historiqueC01") {
          const previous = Array.isArray(userState?.historiqueC01) ? userState.historiqueC01 : [];
          const nextItems = Array.isArray(v) ? v : (v == null ? [] : [v]);
          patch.historiqueC01 = [...previous, ...nextItems].map((x) => String(x));
          continue;
        }
        if (k === "tagsProfil" && v && typeof v === "object") {
          patch.tagsProfil = { ...(userState?.tagsProfil || {}), ...v };
          continue;
        }
        if (k === "complete") continue;
        patch[k] = v;
      }
    }

    ensureCampaignState(campaign.id, campaign.start || "n0");
    const nextNode = choice.next || nodeId;
    const newProg = { ...userState.campaign[campaign.id], node: nextNode };
    if (choice.effects?.complete === true) {
      newProg.completed = true;
      newProg.node = "end";
    }
    patch.campaign = { [campaign.id]: newProg };
    if (grantedLoadoutPatch) Object.assign(patch, grantedLoadoutPatch);

    await applyCampaignPatch(patch);
    if (grantedLoadoutPatch) {
      playerState.patch((s) => {
        s.player.learnedTechniques = Array.isArray(grantedLoadoutPatch.learnedTechniques)
          ? [...grantedLoadoutPatch.learnedTechniques]
          : s.player.learnedTechniques;
        s.player.techniquesBySlot = Array.isArray(grantedLoadoutPatch.techniquesBySlot)
          ? [...grantedLoadoutPatch.techniquesBySlot]
          : s.player.techniquesBySlot;
        s.player.techSlotsTotal = Number.isFinite(Number(grantedLoadoutPatch.techSlotsTotal))
          ? Number(grantedLoadoutPatch.techSlotsTotal)
          : s.player.techSlotsTotal;
      });
      await syncTechniquesToAccount({ silent: true });
    }
    if (choice.effects?.complete === true) {
      await applyProgressionReward("dialogue");
    }
    renderCampaignNodeInMap(campaign);
  }

  function renderCampaignNodeInMap(campaign) {
    if (!campaign || !campaign.nodes) return;
    ensureCampaignState(campaign.id, campaign.start || "n0");
    const prog = userState?.campaign?.[campaign.id] || { node: campaign.start || "n0", completed: false };
    const nodeId = String(prog.node || campaign.start || "n0");
    const node = campaign.nodes[nodeId];
    if (!node) {
      renderMapDialogue({
        type: "dialogue",
        title: campaign.title || "Campagne",
        dialogue: {
          leftEntity: "Soara",
          leftLines: [`Noeud introuvable: ${nodeId}`],
          rightEntity: "Joueur",
          rightLines: ["Retour carte"]
        },
        choices: []
      });
      return;
    }

    const nodeChoices = Array.isArray(node.choices) ? node.choices : [];
    const leftLines = (Array.isArray(node.text) ? node.text : [])
      .map((line) => String(line && typeof line === "object" ? line.text || "" : line || ""))
      .filter(Boolean);
    const rightLines = nodeChoices.length
      ? ["Choisissez une reponse dans votre panneau."]
      : ["Le joueur est en attente de la suite."];
    const choices = nodeChoices.map((c) => ({
      label: String(c?.label || "Choix"),
      onClick: () => { void handleCampaignChoiceInMap(campaign, nodeId, c); }
    }));

    renderMapDialogue({
      type: "dialogue",
      title: campaign.title || "Campagne",
      dialogue: {
        leftEntity: (userState?.name || userState?.username || "Joueur"),
        leftLines: rightLines,
        rightEntity: "Soara",
        rightLines: leftLines.length ? leftLines : ["..."]
      },
      choices
    });
  }

  function openPinFromDialogue(pin) {
    if (travelInProgress) {
      renderMapDialogue({
        type: "carte",
        title: String(pin?.name || "Voyage"),
        lines: ["Voyage en cours..."],
        choices: []
      });
      return;
    }
    if (!isPlayerOnPin(pin)) {
      const canTravel = hasTravelFood();
      renderMapDialogue({
        type: "carte",
        title: String(pin?.name || "Voyage"),
        lines: [
          "Vous n'etes pas sur ce pin.",
          "Voyagez d'abord pour interagir.",
          `Deplacement: ${canTravel ? "possible" : "impossible (aucun vivre)"}.`
        ],
        choices: [
          {
            label: "Voyager (consomme 1 vivre)",
            onClick: () => {
              void (async () => {
                const moved = await travelToPin(pin);
                if (!moved.ok) {
                  renderMapDialogue({
                    type: "carte",
                    title: String(pin?.name || "Voyage"),
                    lines: [
                      moved.reason === "travel_in_progress"
                        ? "Voyage deja en cours."
                        : "Voyage impossible: aucun vivre disponible."
                    ],
                    choices: []
                  });
                  return;
                }
                renderPinsUi();
                renderMapDialogue({
                  type: "carte",
                  title: String(pin?.name || "Voyage"),
                  lines: [`Voyage termine. Vivre consomme: ${String(moved.consumedName || "Vivre")}.`],
                  choices: [
                    { label: "Interagir avec le pin", onClick: () => openPinFromDialogue(pin) }
                  ]
                });
              })();
            }
          }
        ]
      });
      return;
    }

    const pinKind = String(pin?.kind || pin?.type || "").toLowerCase();

    if (pinKind === "campaign") {
      const campaigns = staticData?.campaigns || {};
      const camp = campaigns[pin?.campaignId];
      if (!camp) {
        renderMapDialogue({
          type: "carte",
          title: pin?.name || "Campagne",
          lines: [`Campagne introuvable: ${String(pin?.campaignId || "-")}`],
          choices: []
        });
        return;
      }
      renderCampaignNodeInMap(camp);
      return;
    }

    if (pinKind === "combat_pve") {
      pendingProgressCombat = "pveU";
      const enemyPreset = buildEnemyPresetFromEntitySheet(pin?.enemyEntityId, "Loup");
      openCombatScreen({
        combatType: "pve",
        phaseDurations: { askRoll: 1, revealRoll: 5, runTimer: 20, endWait: 6 },
        enemyPreset
      });
      return;
    }

    if (pinKind === "combat_narrative_music") {
      pendingProgressCombat = "narrativeN";
      openCombatScreen({
        combatType: "narrative",
        withMusic: true,
        uiNarrativeOnly: true,
        uiNarrativeOnlyNoFade: true,
        narrativeIntroSequence: true,
        narrativeLoopTimer: true,
        unitDurationMs: 526,
        phaseDurations: { askRoll: 10, revealRoll: 8, runTimer: 64, endWait: 0 },
        enemyPreset: { name: "Conteur spectral" }
      });
      return;
    }

    if (pinKind === "combat_pvp") {
      pinModal.open(pin, userState);
      return;
    }

    if (pin?.type === "tutorialCombat" || pinKind === "combat_tutorial") {
      pendingProgressCombat = "tutorial";
      const enemyPreset = buildEnemyPresetFromEntitySheet(pin?.enemyEntityId, "DUMMY");
      openCombatScreen({ enemyPreset });
      return;
    }
  }

  function describePinDialogue(pin) {
    const name = String(pin?.name || pin?.id || "Pin");
    const pinKind = String(pin?.kind || pin?.type || "").toLowerCase();
    if (!isPlayerOnPin(pin)) {
      const canTravel = hasTravelFood();
      return {
        type: "carte",
        title: name,
        lines: [
          "Vous devez etre sur ce pin pour lancer son action.",
          `Deplacement: ${canTravel ? "possible" : "impossible (aucun vivre)"}.`
        ],
        choices: [
          {
            label: "Voyager (consomme 1 vivre)",
            onClick: () => {
              void (async () => {
                const moved = await travelToPin(pin);
                if (!moved.ok) {
                  renderMapDialogue({
                    type: "carte",
                    title: name,
                    lines: [
                      moved.reason === "travel_in_progress"
                        ? "Voyage deja en cours."
                        : "Voyage impossible: aucun vivre disponible."
                    ],
                    choices: []
                  });
                  return;
                }
                renderPinsUi();
                renderMapDialogue({
                  type: "carte",
                  title: name,
                  lines: [`Vous etes arrive sur ${name}. Vivre consomme: ${String(moved.consumedName || "Vivre")}.`],
                  choices: [{ label: "Interagir", onClick: () => openPinFromDialogue(pin) }]
                });
              })();
            }
          }
        ]
      };
    }

    if (pinKind === "campaign") {
      return {
        type: "dialogue",
        title: name,
        dialogue: {
          leftEntity: "Soara",
          leftLines: [
            "Ce point ouvre la suite narrative."
          ],
          rightEntity: "Joueur",
          rightLines: [
            "Je choisis de poursuivre la campagne."
          ]
        },
        choices: [
          { label: "Lancer campagne", onClick: () => openPinFromDialogue(pin) }
        ]
      };
    }

    if (pin?.type === "tutorialCombat" || pinKind === "combat_tutorial") {
      return {
        type: "tutoriel",
        title: name,
        lines: [
          "Tutoriel de combat.",
          "Combat d'apprentissage contre un mannequin d'entrainement."
        ],
        choices: [
          { label: "Commencer tutoriel", onClick: () => openPinFromDialogue(pin) }
        ]
      };
    }

    if (pinKind === "combat_pve") {
      return {
        type: "carte",
        title: name,
        lines: [
          "Combat PVE standard contre un loup.",
          "Recompenses et progression via resultat du combat."
        ],
        choices: [
          { label: "Entrer en combat PVE", onClick: () => openPinFromDialogue(pin) }
        ]
      };
    }

    if (pinKind === "combat_narrative_music") {
      return {
        type: "carte",
        title: name,
        lines: [
          "Combat narratif.",
          "Sequence de narration et tempo specifique."
        ],
        choices: [
          { label: "Entrer en combat narratif", onClick: () => openPinFromDialogue(pin) }
        ]
      };
    }

    if (pinKind === "combat_pvp") {
      return {
        type: "carte",
        title: name,
        lines: [
          "Combat joueur contre joueur.",
          "Ouvre le panneau de salle PVP."
        ],
        choices: [
          { label: "Ouvrir panneau PVP", onClick: () => openPinFromDialogue(pin) }
        ]
      };
    }

    return {
      type: "info",
      title: name,
      lines: ["Aucune action definie pour ce point."],
      choices: []
    };
  }

  function selectPinAndRenderDialogue(pin) {
    selectedPinId = String(pin?.id || "");
    renderMapDialogue(describePinDialogue(pin));
  }

  function openReputation(){
    const rep = userState.reputation || {};
    modal.open("Reputation", `
      <div class="card">
        <div class="small">Valeurs actuelles (provisoire)</div>
        <div style="height:10px"></div>
        <div><b>Bazeides</b> : ${rep.bazeides ?? 0}</div>
        <div><b>Federation</b> : ${rep.federation ?? 0}</div>
        <div><b>Roor</b> : ${rep.roor ?? 0}</div>
        <div><b>Gobelins</b> : ${rep.gobelins ?? 0}</div>
      </div>
    `);
  }

  function openPlayer(){
    const rep = userState.reputation || {};
    const ps = getPlayerSnapshot();
    const eqStats = computeEquipmentStats(ps.equipment || {});
    const learnedIds = (ps.learnedTechniques || [])
      .map((x) => (typeof x === "string" ? x : x?.id))
      .filter(Boolean);
    const learnedSet = new Set(learnedIds);
    const equippedIds = (Array.isArray(ps.techniquesBySlot) ? ps.techniquesBySlot : []).filter(Boolean);
    const equippedNames = equippedIds.map((id) => CATALOGUE_MAP.get(id)?.name || id);
    const inventory = Array.isArray(ps.inventorySlots) ? ps.inventorySlots : Array.from({ length: 9 }, () => null);
    const inventoryCounts = buildInventoryCounts(inventory);
    const equipRows = [
      { key: "rightHand", slot: "MD", label: "Main droite", value: getEquipmentLabel(ps.equipment.rightHand) },
      { key: "leftHand", slot: "MG", label: "Main gauche", value: getEquipmentLabel(ps.equipment.leftHand) },
      { key: "armor", slot: "AR", label: "Armure", value: getEquipmentLabel(ps.equipment.armor) },
      { key: "accessory", slot: "AC", label: "Accessoire", value: getEquipmentLabel(ps.equipment.accessory) }
    ];
    const inventoryGrid = Array.from({ length: 9 }, (_, i) => {
      const item = resolveInventoryObject(inventory[i]);
      const hasItem = !!item?.name;
      const icon = hasItem && item?.icon ? escapeHtml(item.icon) : "";
      const label = hasItem ? formatInventoryItemLabel(inventory[i], inventoryCounts) : "";
      const name = label ? escapeHtml(label) : "";
      return `
        <div class="invCell" title="Slot ${i + 1}">
          <div class="invSlot invSlot--icon">${icon}</div>
          <div class="small invItemName">${name}</div>
        </div>
      `;
    }).join("");

    modal.open("Fiche Entite", `
      <div class="playerSheetGrid">
        <section class="card playerSheetCard">
          <div class="playerSheetTitle">Identite</div>
          <div class="small">Nom: <b>${escapeHtml(ps.displayName || userState.name || userState.username || "Joueur")}</b></div>
          <div class="small">Race: ${escapeHtml(userState.race || "-")}</div>
          <div class="small">Faction: ${escapeHtml(userState.faction || "-")}</div>
        </section>

        <section class="card playerSheetCard">
          <div class="playerSheetTitle">Statistique</div>
          <div class="small">PV: ${ps.stats.hp}/${ps.stats.hpMax}</div>
          <div class="small">Energie: ${ps.stats.energy}/${ps.stats.energyMax}</div>
          <div class="small">Regeneration energie: ${ps.stats.regen}</div>
          <div class="small"><span class="soaraSymbol">&#9876;</span> ${eqStats.atk}</div>
          <div class="small"><span class="soaraSymbol">&#x26E8;</span> ${eqStats.def}</div>
          <div class="small"><span class="soaraSymbol">&#x21BA;</span> ${eqStats.esq}</div>
        </section>

        <section class="card playerSheetCard">
          <div class="playerSheetTitle">Reputation</div>
          <div class="small">Bazeides: ${rep.bazeides ?? 0}</div>
          <div class="small">Federation: ${rep.federation ?? 0}</div>
          <div class="small">Roor: ${rep.roor ?? 0}</div>
          <div class="small">Gobelins: ${rep.gobelins ?? 0}</div>
        </section>

        <section class="card playerSheetCard">
          <div class="playerSheetTitle">Information</div>
          <div class="small">Techniques apprises: ${learnedSet.size}</div>
          <div class="small">Slots techniques debloques: ${Number(ps.techSlotsTotal ?? 10)}</div>
          <div class="small">Techniques equipees:</div>
          <div class="small playerSheetList">
            ${equippedNames.length ? equippedNames.map((name, idx) => `<div>${idx + 1}. ${escapeHtml(String(name || "-"))}</div>`).join("") : `<div>-</div>`}
          </div>
        </section>

        <section class="card playerSheetCard">
          <div class="playerSheetTitle">Equipement</div>
          <div class="equipList">
            ${equipRows.map((row) => `
              <div class="equipRow">
                <div class="invSlot equipSquare" title="${escapeHtml(row.label)}">${escapeHtml(row.slot)}</div>
                <div class="small"><b>${escapeHtml(row.label)}:</b> ${escapeHtml(row.value)}</div>
              </div>
            `).join("")}
          </div>
        </section>

        <section class="card playerSheetCard">
          <div class="playerSheetTitle">Inventaire</div>
          <div class="hudInvBagGrid">
            ${inventoryGrid}
          </div>
        </section>
      </div>
    `);
  }

  function openTech(){
    const { catalog, byId } = getKnownTechniquesForUi();
    let selectedLearnedId = null;
    let selectedSlotIndex = null;
    let query = "";

    function renderLibrary(stateText = "Selectionnee: -") {
      const player = getPlayerSnapshot();
      const slotsCount = Number(player.techSlotsTotal ?? 10);
      const equipped = Array.from({ length: slotsCount }, (_, i) => {
        const id = Array.isArray(player.techniquesBySlot) ? player.techniquesBySlot[i] : null;
        return CATALOGUE_MAP.get(id) || null;
      });
      const learnedNow = (getPlayerSnapshot().learnedTechniques || [])
        .map((t) => (typeof t === "string" ? t : t?.id))
        .filter(Boolean);
      const learnedSet = new Set(learnedNow);
      const visible = catalog.filter((t) => {
        if (!learnedSet.has(t.id)) return false;
        if (!query) return true;
        const q = query.toLowerCase();
        return t.name.toLowerCase().includes(q)
          || t.category.toLowerCase().includes(q)
          || String(t.rarity || "").toLowerCase().includes(q)
          || String(t.tier || "").toLowerCase().includes(q);
      }).sort((a, b) => {
        const aRef = a.type === "reflex" ? 1 : 0;
        const bRef = b.type === "reflex" ? 1 : 0;
        if (aRef !== bRef) return aRef - bRef;
        const aBal = Number(a.balanceIndex || 0);
        const bBal = Number(b.balanceIndex || 0);
        return bBal - aBal;
      });

      modal.open("Bibliotheque tactique", `
        <div class="techLibraryGrid">
          <section class="techLibraryLeft card">
            <div><b>Slots actifs</b></div>
            <div style="height:6px"></div>
            <div class="techSlotsList">
            ${Array.from({ length: slotsCount }).map((_, idx) => {
              const t = equipped[idx];
              const tok = Array.isArray(t?.tokens) && t.tokens.length ? t.tokens : (Array.isArray(t?.seq) ? t.seq : []);
              const isEmpty = tok.length === 0;
              const label = escapeHtml(t?.name || "(vide)");
              const seq = isEmpty ? "(vide)" : formatSeq(tok, t?.type === "reflex" ? "reflex" : "base");
              return `<button class="btn techReplaceSlotBtn ${isEmpty ? "slot--empty" : ""} ${selectedSlotIndex === idx ? "btnPressed" : ""}" data-slot="${idx}">Slot ${idx + 1}: ${label} ${seq}</button>`;
            }).join("")}
            </div>
          </section>
          <aside class="techLibraryRight card">
            <div><b>Bibliotheque d'entite</b></div>
            <div class="small">Technique selectionnee: ${escapeHtml(selectedLearnedId || "-")}</div>
            <input id="techSearch" class="input" value="${escapeHtml(query)}" placeholder="Recherche..." style="width:100%; margin-top:6px;" />
            <div style="height:8px"></div>
            <div style="max-height:52vh; overflow-y:auto;">
              ${visible.length ? visible.map((t) => {
                const typeLabel = t.type === "reflex" ? "Reflexe" : "Technique";
                const costLabel = t.totalEnergyCost ?? t.totalCost ?? "-";
                const eff = Number.isFinite(Number(t.efficiency)) ? Number(t.efficiency).toFixed(2) : "-";
                const bal = Number.isFinite(Number(t.balanceIndex)) ? Number(t.balanceIndex).toFixed(1) : "-";
                const profile = `O:${t.offensePer10 ?? "-"} D:${t.defensePer10 ?? "-"} E:${t.evasionPer10 ?? "-"} Eco:${t.economyPer10 ?? "-"}`;
                return `
                  <div class="card techLearnItem">
                    <div><b>${escapeHtml(t.name)}</b></div>
                    <div class="small">${formatSeq(t.tokens, t.type === "reflex" ? "reflex" : "base")}</div>
                    <div class="small">${typeLabel} | Cout ${costLabel} | Eff ${eff} | Eq ${bal}</div>
                    <div class="small">${profile}</div>
                    <button class="btn techLearnedBtn" data-learned-id="${t.id}" style="width:100%; margin-top:4px; min-height:34px; padding:4px 8px;">Selectionner</button>
                  </div>
                `;
              }).join("") : `<div class="small">Aucun resultat.</div>`}
            </div>
            <button class="btn" id="techCancelSelection" style="width:100%; margin-top:8px;">Reinitialiser selection</button>
            <div id="techReplaceState" class="small" style="margin-top:8px;">${escapeHtml(stateText)}</div>
          </aside>
        </div>
      `);

      for (const btn of document.querySelectorAll(".techLearnedBtn")) {
        btn.onclick = async () => {
          selectedLearnedId = btn.getAttribute("data-learned-id");
          if (Number.isInteger(selectedSlotIndex)) {
            const source = byId.get(selectedLearnedId);
            if (source) {
              const current = getPlayerSnapshot();
              const slots = Array.isArray(current.techniquesBySlot) ? current.techniquesBySlot : [];
              const duplicateAt = slots.findIndex((id, idx) => idx !== selectedSlotIndex && id === source.id);
              if (duplicateAt >= 0) {
                renderLibrary(`Impossible: ${source.name} est deja equipee sur slot ${duplicateAt + 1}.`);
                return;
              }
              const nextTech = {
                id: source.id,
                name: source.name,
                seq: Array.isArray(source.seq) ? [...source.seq] : (Array.isArray(source.tokens) ? source.tokens.map((sym) => sym?.sym || sym).filter(Boolean) : []),
                tokens: Array.isArray(source.tokens) ? source.tokens.map((tok) => (typeof tok === "string" ? { sym: tok } : { ...tok })) : [],
                type: source.type || source.category || "normal",
                category: source.category || source.type || "normal",
                doubledCost: !!source.doubledCost,
                totalEnergyCost: source.totalEnergyCost,
                estimatedDamagePerTurn: source.estimatedDamagePerTurn,
                offensePer10: source.offensePer10,
                defensePer10: source.defensePer10,
                evasionPer10: source.evasionPer10,
                economyPer10: source.economyPer10,
                efficiency: source.efficiency,
                balanceIndex: source.balanceIndex
              };
              const ok = typeof combatScreen.setEquippedTechniqueAt === "function"
                ? combatScreen.setEquippedTechniqueAt(selectedSlotIndex, nextTech)
                : true;
              if (!ok) {
                renderLibrary(`Impossible: ${nextTech.name} est deja equipee sur un autre slot.`);
                return;
              }
              playerState.patch((s) => {
                if (!Array.isArray(s.player.techniquesBySlot)) s.player.techniquesBySlot = Array.from({ length: 10 }, () => null);
                s.player.techniquesBySlot[selectedSlotIndex] = nextTech.id;
                const learned = Array.isArray(s.player.learnedTechniques) ? s.player.learnedTechniques : [];
                if (!learned.includes(nextTech.id)) learned.push(nextTech.id);
                s.player.learnedTechniques = learned;
              });
              const synced = await syncTechniquesToAccount({ silent: true });
              if (!synced) {
                renderLibrary(`Equipee localement (${nextTech.name}), synchro compte echouee.`);
                return;
              }
              renderLibrary(`Equipee: ${nextTech.name} -> slot ${selectedSlotIndex + 1}`);
              return;
            }
          }
          renderLibrary(`Selectionnee: ${selectedLearnedId} - selectionne un slot a gauche`);
        };
      }

      for (const btn of document.querySelectorAll(".techReplaceSlotBtn")) {
        btn.onclick = async () => {
          const slot = Number(btn.getAttribute("data-slot"));
          selectedSlotIndex = Number.isInteger(slot) ? slot : null;
          if (!selectedLearnedId) {
            renderLibrary(`Slot ${slot + 1} selectionne. Choisis une technique a droite.`);
            return;
          }
          const source = byId.get(selectedLearnedId);
          if (!source) return;
          const current = getPlayerSnapshot();
          const slots = Array.isArray(current.techniquesBySlot) ? current.techniquesBySlot : [];
          const duplicateAt = slots.findIndex((id, idx) => idx !== slot && id === source.id);
          if (duplicateAt >= 0) {
            renderLibrary(`Impossible: ${source.name} est deja equipee sur slot ${duplicateAt + 1}.`);
            return;
          }
          const nextTech = {
            id: source.id,
            name: source.name,
            seq: Array.isArray(source.seq) ? [...source.seq] : (Array.isArray(source.tokens) ? source.tokens.map((sym) => sym?.sym || sym).filter(Boolean) : []),
            tokens: Array.isArray(source.tokens) ? source.tokens.map((tok) => (typeof tok === "string" ? { sym: tok } : { ...tok })) : [],
            type: source.type || source.category || "normal",
            category: source.category || source.type || "normal",
            doubledCost: !!source.doubledCost,
            totalEnergyCost: source.totalEnergyCost,
            estimatedDamagePerTurn: source.estimatedDamagePerTurn,
            offensePer10: source.offensePer10,
            defensePer10: source.defensePer10,
            evasionPer10: source.evasionPer10,
            economyPer10: source.economyPer10,
            efficiency: source.efficiency,
            balanceIndex: source.balanceIndex
          };
          const ok = typeof combatScreen.setEquippedTechniqueAt === "function"
            ? combatScreen.setEquippedTechniqueAt(slot, nextTech)
            : true;
          if (!ok) {
            renderLibrary(`Impossible: ${nextTech.name} est deja equipee sur un autre slot.`);
            return;
          }
          playerState.patch((s) => {
            if (!Array.isArray(s.player.techniquesBySlot)) s.player.techniquesBySlot = Array.from({ length: 10 }, () => null);
            s.player.techniquesBySlot[slot] = nextTech.id;
            const learned = Array.isArray(s.player.learnedTechniques) ? s.player.learnedTechniques : [];
            if (!learned.includes(nextTech.id)) learned.push(nextTech.id);
            s.player.learnedTechniques = learned;
          });
          const synced = await syncTechniquesToAccount({ silent: true });
          if (!synced) {
            renderLibrary(`Equipee localement (${nextTech.name}), synchro compte echouee.`);
            return;
          }
          renderLibrary(`Equipee: ${nextTech.name} -> slot ${slot + 1}`);
        };
      }

      const cancelBtn = document.getElementById("techCancelSelection");
      if (cancelBtn) {
        cancelBtn.onclick = () => {
          selectedLearnedId = null;
          selectedSlotIndex = null;
          renderLibrary("Selectionnee: -");
        };
      }
      const search = document.getElementById("techSearch");
      if (search) {
        search.oninput = () => {
          query = search.value || "";
          renderLibrary(stateText);
        };
      }
    }

    renderLibrary();
  }

  function openHistory(){
    const combats = getCombatHistoryEntries(20);
    modal.open("Historique", `
      <div class="card">
        <div class="small">Derniers combats</div>
        <div style="height:10px"></div>
        ${combats.map((x) => `<div>${escapeHtml(x)}</div>`).join("") || "<div>-</div>"}
      </div>
    `);
  }

  function openInventory(){
    const ps = getPlayerSnapshot();
    const inv = ps.inventorySlots || [];
    const inventoryCounts = buildInventoryCounts(inv);
    const equip = ps.equipment || {};
    const equipRows = [
      { key: "rightHand", slot: "MD", label: "Main droite", value: getEquipmentLabel(equip.rightHand) },
      { key: "leftHand", slot: "MG", label: "Main gauche", value: getEquipmentLabel(equip.leftHand) },
      { key: "armor", slot: "AR", label: "Armure", value: getEquipmentLabel(equip.armor) },
      { key: "accessory", slot: "AC", label: "Accessoire", value: getEquipmentLabel(equip.accessory) }
    ];
    const inventoryGrid = Array.from({ length: 9 }, (_, i) => {
      const item = resolveInventoryObject(inv[i]);
      const hasItem = !!item?.name;
      const icon = hasItem && item?.icon ? escapeHtml(item.icon) : "";
      const label = hasItem ? formatInventoryItemLabel(inv[i], inventoryCounts) : "";
      const name = label ? escapeHtml(label) : "";
      return `
        <div class="invCell" title="Slot ${i + 1}">
          <div class="invSlot invSlot--icon" id="inv${i}">${icon}</div>
          <div class="small invItemName">${name}</div>
        </div>
      `;
    }).join("");
    let html = `
      <div class="card">
        <div class="hudInvTitle">INVENTAIRE D'ENTITE</div>
        <div style="height:8px"></div>
        <div class="invPanelSection">
          <div class="invPanelLabel">Equipement actif</div>
          <div class="equipList">
            ${equipRows.map((row, idx) => `
              <div class="equipRow">
                <div class="invSlot equipSquare" id="eq${idx}" title="${escapeHtml(row.label)}">${escapeHtml(row.slot)}</div>
                <div class="small"><b>${escapeHtml(row.label)}:</b> ${escapeHtml(row.value)}</div>
              </div>
            `).join("")}
          </div>
        </div>
        <div style="height:8px"></div>
        <div class="invPanelSection">
          <div class="invPanelLabel">Sac (9 emplacements)</div>
          <div class="hudInvBagGrid">
            ${inventoryGrid}
          </div>
        </div>
      </div>`;
    modal.open("Inventaire d'entite", html);
  }

  function openSettings(){
    const isAlkane = isAlkaneUser();

    function openLoreCodex() {
      const loreBlocks = [
        staticData?.lore?.canon,
        staticData?.lore?.gameplay,
        staticData?.lore?.campaign,
        staticData?.lore?.factions,
        staticData?.lore?.tone
      ].filter(Boolean);
      if (!loreBlocks.length) {
        modal.open("Codex Soara", `<div class="card"><div class="small">Aucun contenu lore charge.</div></div>`);
        return;
      }

      const body = loreBlocks.map((block) => {
        const sections = Array.isArray(block.sections) ? block.sections : [];
        return `
          <div class="card" style="margin-bottom:8px;">
            <div><b>${block.title || block.id || "Bloc lore"}</b></div>
            <div style="height:6px"></div>
            ${sections.map((s) => `
              <div class="card" style="margin-bottom:6px;">
                <div><b>${s.title || s.id || "Section"}</b> <span class="small">[${s.id || "-"}]</span></div>
                <div style="height:4px"></div>
                ${(Array.isArray(s.points) ? s.points : []).map((p) => `<div class="small">- ${p}</div>`).join("")}
              </div>
            `).join("")}
          </div>
        `;
      }).join("");

      modal.open("Codex Soara", `<div class="card" style="max-height:72vh; overflow-y:auto;">${body}</div>`);
    }

    async function openPatchNotesModal() {
      let rows = Array.isArray(staticData?.patchNotes) ? staticData.patchNotes : [];
      if (!rows.length) {
        try {
          const r = await fetch("/data/patch_notes.json", { cache: "no-store" });
          if (r.ok) {
            const raw = await r.json();
            rows = Array.isArray(raw?.items) ? raw.items : [];
          }
        } catch {}
      }
      if (!rows.length) {
        modal.open("Notes de patch", `<div class="card"><div class="small">Aucune note de patch disponible.</div></div>`);
        return;
      }
      const sorted = [...rows].sort((a, b) => String(b?.date || "").localeCompare(String(a?.date || "")));
      modal.open("Notes de patch", `
        <div class="card" style="max-height:72vh; overflow-y:auto;">
          <div class="small">Historique des mises a jour gameplay/UI.</div>
          <div class="small">Process: mettre a jour public/data/patch_notes.json a chaque release.</div>
          <div style="height:8px"></div>
          ${sorted.map((entry) => `
            <div class="card" style="margin-bottom:8px;">
              <div><b>${escapeHtml(entry?.versionLabel || "Release")}</b> - ${escapeHtml(entry?.date || "-")}</div>
              <div class="small">${escapeHtml(entry?.title || "-")}</div>
              <div style="height:6px"></div>
              ${(Array.isArray(entry?.changes) ? entry.changes : [])
                .map((line) => `<div class="small">- ${escapeHtml(String(line || ""))}</div>`).join("")}
            </div>
          `).join("")}
        </div>
      `);
    }

    function openPinEditorModal() {
      if (!isAlkane) return;
      const pinsSource = getRuntimePinsBase();
      const byId = new Map(pinsSource.map((p) => [String(p?.id || ""), { ...p }]));
      let selectedId = pinsSource[0]?.id ? String(pinsSource[0].id) : "C";
      let step = 0.001;

      const render = async (hint = "") => {
        const pins = getRuntimePins();
        const options = pins.map((p) => `<option value="${escapeHtml(String(p.id))}" ${String(p.id) === selectedId ? "selected" : ""}>${escapeHtml(String(p.id))} - ${escapeHtml(String(p.name || p.id))}</option>`).join("");
        const cur = pins.find((p) => String(p.id) === selectedId) || pins[0] || null;
        if (!cur) {
          modal.open("Editeur Pins", `<div class="card"><div class="small">Aucun pin disponible.</div></div>`);
          return;
        }
        const base = byId.get(String(cur.id)) || cur;
        modal.open("Editeur Pins (Alkane)", `
          <div class="card">
            <div class="small">Placement manuel des pins (persistant par compte Alkane).</div>
            <div style="height:8px"></div>
            <div class="small">Pin</div>
            <select id="pinEditSelect" style="width:100%; height:34px;">${options}</select>
            <div style="height:8px"></div>
            <div class="row" style="gap:8px;">
              <div style="flex:1 1 140px;">
                <div class="small">X</div>
                <input id="pinEditX" value="${Number(cur.x).toFixed(4)}" />
              </div>
              <div style="flex:1 1 140px;">
                <div class="small">Y</div>
                <input id="pinEditY" value="${Number(cur.y).toFixed(4)}" />
              </div>
            </div>
            <div style="height:8px"></div>
            <div class="row" style="gap:8px;">
              <button class="btn" id="pinEditLeft" style="flex:1;">X -</button>
              <button class="btn" id="pinEditRight" style="flex:1;">X +</button>
              <button class="btn" id="pinEditUp" style="flex:1;">Y -</button>
              <button class="btn" id="pinEditDown" style="flex:1;">Y +</button>
            </div>
            <div style="height:8px"></div>
            <div class="row" style="gap:8px;">
              <div style="flex:1;">
                <div class="small">Pas</div>
                <input id="pinEditStep" value="${Number(step).toFixed(4)}" />
              </div>
              <button class="btn" id="pinEditApply" style="flex:1; align-self:end;">Appliquer</button>
            </div>
            <div style="height:8px"></div>
            <button class="btn" id="pinEditReset" style="width:100%; margin-bottom:6px;">Reset pin selectionne</button>
            <button class="btn" id="pinEditResetAll" style="width:100%;">Reset tous les pins</button>
            <div style="height:8px"></div>
            <div class="small">Base: X=${Number(base.x).toFixed(4)} / Y=${Number(base.y).toFixed(4)}</div>
            <div class="small" id="pinEditHint">${escapeHtml(hint || "-")}</div>
          </div>
        `);

        const q = (id) => document.getElementById(id);
        const persist = async (id, x, y, mode = "set") => {
          const overrides = normalizePinOverridesMap(userState?.pinOverrides);
          const key = String(id || "").trim();
          if (!key) return;
          if (mode === "unset") delete overrides[key];
          else overrides[key] = { x: Math.max(0, Math.min(1, Number(x))), y: Math.max(0, Math.min(1, Number(y))) };
          await stateSvc.patchState({ pinOverrides: overrides });
          userState = { ...(userState || {}), pinOverrides: overrides };
          renderPinsUi();
        };
        const readStep = () => {
          const n = Number(q("pinEditStep")?.value || step);
          if (!Number.isFinite(n)) return step;
          return Math.max(0.0001, Math.min(0.05, n));
        };
        const applyFromInputs = async () => {
          const x = Number(q("pinEditX")?.value);
          const y = Number(q("pinEditY")?.value);
          if (!Number.isFinite(x) || !Number.isFinite(y)) {
            await render("Coordonnees invalides.");
            return;
          }
          step = readStep();
          await persist(selectedId, x, y, "set");
          await render(`Sauve: ${selectedId} -> (${x.toFixed(4)}, ${y.toFixed(4)})`);
        };

        q("pinEditSelect").onchange = () => {
          selectedId = String(q("pinEditSelect")?.value || selectedId);
          void render();
        };
        q("pinEditApply").onclick = () => { void applyFromInputs(); };
        q("pinEditLeft").onclick = () => {
          const x = Number(q("pinEditX")?.value || 0) - readStep();
          q("pinEditX").value = String(x);
        };
        q("pinEditRight").onclick = () => {
          const x = Number(q("pinEditX")?.value || 0) + readStep();
          q("pinEditX").value = String(x);
        };
        q("pinEditUp").onclick = () => {
          const y = Number(q("pinEditY")?.value || 0) - readStep();
          q("pinEditY").value = String(y);
        };
        q("pinEditDown").onclick = () => {
          const y = Number(q("pinEditY")?.value || 0) + readStep();
          q("pinEditY").value = String(y);
        };
        q("pinEditReset").onclick = () => { void (async () => {
          await persist(selectedId, 0, 0, "unset");
          await render(`Reset: ${selectedId}`);
        })(); };
        q("pinEditResetAll").onclick = () => { void (async () => {
          await stateSvc.patchState({ pinOverrides: {} });
          userState = { ...(userState || {}), pinOverrides: {} };
          renderPinsUi();
          await render("Reset: tous les pins");
        })(); };
      };

      void render();
    }

    function openResolutionTestModal() {
      const symbolOptions = SYMBOLS_V6_UI
        .map((s) => `<option value="${s.key}">${s.symbol} ${s.name}</option>`)
        .join("");
      const symbolCostByKey = new Map(SYMBOLS_V6_UI.map((s) => [String(s.key), Number(s.cost) || 0]));
      modal.open("Banc de resolution", `
        <div class="card" style="max-height:72vh; overflow-y:auto;">
          <div class="small">Simulation de resolution deterministe (sans des, sauf tempo).</div>
          <div style="height:8px"></div>
          <div class="row" style="gap:8px; align-items:stretch;">
            <div class="card" style="flex:1 1 320px;">
              <div><b>Entite 1 (Joueur)</b></div>
              <div style="height:6px"></div>
              <div>
                <div class="small">Symbole</div>
                <select id="resPlayerSym" style="width:100%; height:38px;">${symbolOptions}</select>
              </div>
              <div style="height:6px"></div>
              <div class="row" style="gap:8px;">
                <div style="flex:1 1 120px;"><div class="small">ATK</div><input id="resPAtk" value="4" /></div>
                <div style="flex:1 1 120px;"><div class="small">DEF</div><input id="resPDef" value="2" /></div>
              </div>
              <div class="row" style="gap:8px;">
                <div style="flex:1 1 120px;"><div class="small">ESQ</div><input id="resPEsq" value="2" /></div>
                <div style="flex:1 1 120px;"><div class="small">ARM</div><input id="resPArm" value="1" /></div>
              </div>
              <div style="height:6px"></div>
              <div>
                <div class="small">Energie depensee (attaque)</div>
                <input id="resPSpent" value="1" />
                <label class="small" style="display:block; margin-top:4px;">
                  <input id="resPAutoSpent" type="checkbox" checked />
                  Sync auto avec cout symbole
                </label>
              </div>
            </div>
            <div class="card" style="flex:1 1 320px;">
              <div><b>Entite 2 (Ennemi)</b></div>
              <div style="height:6px"></div>
              <div>
                <div class="small">Symbole</div>
                <select id="resEnemySym" style="width:100%; height:38px;">${symbolOptions}</select>
              </div>
              <div style="height:6px"></div>
              <div class="row" style="gap:8px;">
                <div style="flex:1 1 120px;"><div class="small">ATK</div><input id="resEAtk" value="4" /></div>
                <div style="flex:1 1 120px;"><div class="small">DEF</div><input id="resEDef" value="2" /></div>
              </div>
              <div class="row" style="gap:8px;">
                <div style="flex:1 1 120px;"><div class="small">ESQ</div><input id="resEEsq" value="2" /></div>
                <div style="flex:1 1 120px;"><div class="small">ARM</div><input id="resEArm" value="1" /></div>
              </div>
              <div style="height:6px"></div>
              <div>
                <div class="small">Energie depensee (attaque)</div>
                <input id="resESpent" value="1" />
                <label class="small" style="display:block; margin-top:4px;">
                  <input id="resEAutoSpent" type="checkbox" checked />
                  Sync auto avec cout symbole
                </label>
              </div>
            </div>
          </div>
          <div style="height:8px"></div>
          <div id="resOut" class="card small">Choisis les 2 symboles: le detail de resolution se met a jour automatiquement.</div>
        </div>
      `);

      const modalRoot = document.getElementById("modal");
      const q = (sel) => modalRoot?.querySelector(sel);
      const out = q("#resOut");
      const syncSpentEnergy = () => {
        const pAuto = q("#resPAutoSpent");
        const eAuto = q("#resEAutoSpent");
        const pSpent = q("#resPSpent");
        const eSpent = q("#resESpent");
        const pSym = q("#resPlayerSym")?.value || "X";
        const eSym = q("#resEnemySym")?.value || "GUARD";
        if (pAuto?.checked && pSpent) pSpent.value = String(symbolCostByKey.get(pSym) ?? 0);
        if (eAuto?.checked && eSpent) eSpent.value = String(symbolCostByKey.get(eSym) ?? 0);
      };
      let runCount = 0;
      const renderOut = (label, result) => {
        if (!out) return;
        runCount += 1;
        out.innerHTML = `
          <div><b>${label}</b> #${runCount}</div>
          <div>ATK J: ${result.pAtkPower} | MIT J: ${result.pMit} | ESQ J: ${result.pEsqPower} | Cout J: ${result.pCost} | Depense J: ${result.pSpentEnergy}</div>
          <div>ATK E: ${result.eAtkPower} | MIT E: ${result.eMit} | ESQ E: ${result.eEsqPower} | Cout E: ${result.eCost} | Depense E: ${result.eSpentEnergy}</div>
          <div>Degats -> Ennemi: <b>${result.dmgToEnemy}</b> | Joueur: <b>${result.dmgToPlayer}</b></div>
          <div>Parade retour -> Ennemi: ${result.parryReturnToEnemy} | Joueur: ${result.parryReturnToPlayer}</div>
          <div class="small">Rappel: le tempo reste le seul tirage aleatoire.</div>
        `;
      };

      const resolveNow = () => {
        const cfg = {
          playerSym: q("#resPlayerSym")?.value || "X",
          enemySym: q("#resEnemySym")?.value || "GUARD",
          pAtk: Number(q("#resPAtk")?.value || 0),
          pDef: Number(q("#resPDef")?.value || 0),
          pEsq: Number(q("#resPEsq")?.value || 0),
          pArm: Number(q("#resPArm")?.value || 0),
          pSpentEnergy: Number(q("#resPSpent")?.value || 0),
          eAtk: Number(q("#resEAtk")?.value || 0),
          eDef: Number(q("#resEDef")?.value || 0),
          eEsq: Number(q("#resEEsq")?.value || 0),
          eArm: Number(q("#resEArm")?.value || 0),
          eSpentEnergy: Number(q("#resESpent")?.value || 0)
        };
        renderOut("Simulation", computeResolution(cfg));
      };

      // Multi-test fluide: recalcul automatique à chaque changement.
      for (const id of ["resPAtk", "resPDef", "resPEsq", "resPArm", "resPSpent", "resEAtk", "resEDef", "resEEsq", "resEArm", "resESpent"]) {
        const el = q(`#${id}`);
        if (!el) continue;
        el.addEventListener("change", resolveNow);
        el.addEventListener("input", resolveNow);
      }
      for (const id of ["resPAutoSpent", "resEAutoSpent"]) {
        const el = q(`#${id}`);
        if (!el) continue;
        el.addEventListener("change", () => {
          syncSpentEnergy();
          resolveNow();
        });
      }
      for (const id of ["resPlayerSym", "resEnemySym"]) {
        const el = q(`#${id}`);
        if (!el) continue;
        el.addEventListener("change", () => {
          syncSpentEnergy();
          resolveNow();
        });
        el.addEventListener("input", () => {
          syncSpentEnergy();
          resolveNow();
        });
      }

      const pSymSelect = q("#resPlayerSym");
      const eSymSelect = q("#resEnemySym");
      if (pSymSelect) pSymSelect.value = "X";
      if (eSymSelect) eSymSelect.value = "GUARD";
      syncSpentEnergy();

      // First render so user sees immediate result and can chain tests.
      resolveNow();
    }

    modal.open("Conseil de campagne", `
      <div class="card">
        <div class="small">Reglages de combat, outils de simulation et references tactiques (Beta2)</div>
        <div style="height:10px"></div>
        <div class="card">
          <div><b>Volume du son</b></div>
          <div style="height:6px"></div>
          <input id="musicVolumeRange" type="range" min="0" max="100" step="1" style="width:100%;" />
          <div id="musicVolumeValue" class="small">-</div>
        </div>
        <div style="height:12px"></div>
        ${isAlkane ? `<button class="btn" id="btnOpenResolutionTest" style="width:100%; margin-bottom:8px;">Test de resolution</button>` : ``}
        ${isAlkane ? `<button class="btn" id="btnOpenPinEditor" style="width:100%; margin-bottom:8px;">Editeur de pins</button>` : ``}
        <button class="btn" id="btnOpenCombatRules" style="width:100%; margin-bottom:8px;">Regles de resolution</button>
        <button class="btn" id="btnOpenSymbolsGuide" style="width:100%; margin-bottom:8px;">Reference symboles</button>
        <button class="btn" id="btnOpenTechList" style="width:100%; margin-bottom:8px;">Catalogue technique</button>
        <button class="btn" id="btnOpenPatchNotes" style="width:100%; margin-bottom:8px;">Notes de patch</button>
        ${isAlkane ? `<button class="btn" id="btnOpenLoreCodex" style="width:100%; margin-bottom:8px;">Codex de campagne</button>` : ``}
        <button class="btn" id="btnLogoutInSettings" style="width:100%;">Quitter la session</button>
      </div>
    `);
    const volRange = document.getElementById("musicVolumeRange");
    const volValue = document.getElementById("musicVolumeValue");
    if (volRange && volValue) {
      const current = Math.round((narrativeMusic.getVolume() || 0) * 100);
      volRange.value = String(current);
      volValue.textContent = `Niveau: ${current}%`;
      const onVol = () => {
        const next = Number(volRange.value || 0) / 100;
        const applied = narrativeMusic.setVolume(next);
        volValue.textContent = `Niveau: ${Math.round(applied * 100)}%`;
      };
      volRange.addEventListener("input", onVol);
      volRange.addEventListener("change", onVol);
    }
    const bindClick = (id, handler) => {
      const el = document.getElementById(id);
      if (el) el.onclick = handler;
    };
    bindClick("btnOpenResolutionTest", openResolutionTestModal);
    bindClick("btnOpenPinEditor", openPinEditorModal);
    bindClick("btnOpenPatchNotes", openPatchNotesModal);
    bindClick("btnOpenCombatRules", () => {
      modal.open("Regles de resolution", `
        <div class="card" style="max-height:72vh; overflow-y:auto;">
          <div><b>Vue d'ensemble du combat</b></div>
          <div class="small" style="margin-top:6px;">Un combat oppose votre entite a une entite ennemie.</div>
          <div class="small">Chaque tour, vous choisissez une technique (ou un reflexe), puis les actions sont resolues selon le tempo.</div>
          <div style="height:10px"></div>
          <div><b>Le rythme du tour</b></div>
          <div class="small">Votre <b>Tempo</b> determine l'ordre de resolution entre vous et l'ennemi.</div>
          <div class="small">Le tempo est la partie dynamique du systeme; le reste de la resolution reste stable et lisible.</div>
          <div style="height:10px"></div>
          <div><b>Attaquer, defendre, esquiver</b></div>
          <div class="small">Un <b>symbole d'attaque</b> utilise votre <b>ATK</b> pour mettre la pression sur l'ennemi.</div>
          <div class="small">Votre <b>DEF</b> et votre equipement reduisent les degats recus.</div>
          <div class="small">Votre <b>ESQ</b> aide a eviter ou limiter des actions ennemies selon la situation.</div>
          <div style="height:10px"></div>
          <div><b>Techniques et energie</b></div>
          <div class="small">Chaque technique consomme de l'energie.</div>
          <div class="small">Vous devez gerer votre reserve d'energie pour rester dangereux sur la duree du combat.</div>
          <div style="height:10px"></div>
          <div><b>Objectif d'un combat</b></div>
          <div class="small">Choisir les bons timings, utiliser vos techniques au bon moment et faire tomber les PV ennemis a zero.</div>
          <div class="small">Le systeme privilegie la lecture tactique: vous voyez ce qui se passe et pourquoi.</div>
          <div style="height:12px"></div>
          <button class="btn" id="btnCombatRulesDetails" style="width:100%;">Detail</button>
        </div>
      `);
      const detailsBtn = document.getElementById("btnCombatRulesDetails");
      if (detailsBtn) {
        detailsBtn.onclick = () => {
          modal.open("Regles de resolution - Detail", `
            <div class="card combatRulesDetails" style="max-height:72vh; overflow-y:auto;">
              <div><b>Vue complete du systeme</b></div>
              <div class="small" style="margin-top:6px;">Le combat est un systeme tactique sequentiel: chaque camp choisit une action, puis le moteur applique les effets dans un ordre lisible.</div>
              <div class="small">La resolution est deterministe sur les effets (degats, mitigation, couts), avec un element dynamique sur le tempo.</div>
              <div style="height:10px"></div>

              <div><b>Cycle d'un tour</b></div>
              <div class="small">1) Selection des actions: chaque camp choisit sa technique/reflexe selon son energie disponible.</div>
              <div class="small">2) Tempo: l'ordre du tour est decide.</div>
              <div class="small">3) Resolution: attaques, defenses, esquives, parades et etats sont appliques.</div>
              <div class="small">4) Cloture: PV/energie sont mis a jour, puis un nouveau tour commence.</div>
              <div style="height:10px"></div>

              <div><b>Tempo et priorite</b></div>
              <div class="small">Le tempo decide qui impose le rythme sur le tour courant.</div>
              <div class="small">A tempo favorable, vous forcez plus souvent l'adversaire a reagir.</div>
              <div class="small">A tempo defavorable, vous jouez plus defensif et visez le tour suivant.</div>
              <div style="height:10px"></div>

              <div><b>Energie, couts et endurance</b></div>
              <div class="small">Chaque technique a un cout en energie.</div>
              <div class="small">Sans energie, vos options diminuent et votre plan devient previsible.</div>
              <div class="small">La regeneration d'energie structure la duree d'un duel: depenser trop tot peut vous bloquer ensuite.</div>
              <div class="small">Les techniques normales, reflexes et phases aeriennes n'ont pas la meme pression energetique.</div>
              <div style="height:10px"></div>

              <div><b>Techniques, reflexes, prefixes et suffixes</b></div>
              <div class="small">Une technique combine intention offensive, defensive et gestion du risque.</div>
              <div class="small">Un reflexe est une reponse rapide, plus couteuse, pour reprendre ou proteger le tempo.</div>
              <div class="small">Les prefixes modifient le comportement d'une action avant sa resolution (orientation, protection, retombee, etc.).</div>
              <div class="small">Les suffixes modifient l'apres-effet (annulation, extension, limitation, etc.).</div>
              <div class="small">L'efficacite reelle depend de la lecture du tour, pas seulement de la puissance brute.</div>
              <div style="height:10px"></div>

              <div><b>Degats, mitigation et parade</b></div>
              <div class="small">Les degats partent de votre pression offensive (ATK) et sont reduits par la defense adverse (DEF) et l'armure.</div>
              <div class="small">Formule de base: <b>Degats = max(0, ATK - (DEF + Armure))</b>.</div>
              <div class="small">Mitigation totale: <b>Mitigation = DEF + Armure</b>.</div>
              <div class="small">La parade peut renvoyer une partie de l'attaque entrante, avec un plafond lie a l'ATK du pareur.</div>
              <div class="small">Renvoi de parade: <b>min(attaque entrante, 2xATK du pareur)</b>.</div>
              <div class="small">Les etats temporaires (ex: vulnerable) amplifient ou reduisent l'impact final recu.</div>
              <div class="small">Vulnerable: <b>Degats recus finaux = Degats recus x 2</b> pendant le tour actif.</div>
              <div style="height:10px"></div>

              <div><b>Equipement et profil de combat</b></div>
              <div class="small">L'equipement module votre profil: attaque, defense, esquive, et stabilite generale.</div>
              <div class="small">Main droite/gauche, armure et accessoire changent vos marges de survie et votre capacite a conclure.</div>
              <div class="small">Un bon loadout aligne vos stats avec votre style: pression, controle, ou endurance.</div>
              <div style="height:10px"></div>

              <div><b>Objectif tactique global</b></div>
              <div class="small">Controler le tempo, convertir votre energie en actions utiles, encaisser intelligemment et forcer l'adversaire a l'erreur.</div>
              <div class="small">Le meilleur resultat vient de la coherence entre techniques, equipement, timing et lecture du log.</div>
            </div>
          `);
        };
      }
    });
    bindClick("btnOpenSymbolsGuide", () => {
      const learnedSet = new Set(
        (Array.isArray(getPlayerSnapshot()?.learnedTechniques) ? getPlayerSnapshot().learnedTechniques : [])
          .map((x) => (typeof x === "string" ? x : x?.id))
          .filter(Boolean)
      );
      const allowedSymbols = new Set();
      if (!isAlkane) {
        for (const id of learnedSet) {
          const tech = CATALOGUE_MAP.get(id);
          if (!tech) continue;
          const tokens = Array.isArray(tech?.tokens) ? tech.tokens : (Array.isArray(tech?.seq) ? tech.seq : []);
          for (const token of tokens) {
            const sym = String(typeof token === "string" ? token : token?.sym || "").trim();
            if (sym) allowedSymbols.add(sym);
          }
        }
      }
      const rowsSource = (SYMBOLS_V6_UI || []).filter((s) => {
        if (String(s?.key || "") === "v") return false;
        if (isAlkane) return true;
        return allowedSymbols.has(String(s?.key || ""));
      });
      const symbolRows = rowsSource
        .filter((s) => String(s?.key || "") !== "v")
        .map((s) => `
        <tr>
          <td><b>${escapeHtml(String(s.symbol || s.key || "-"))}</b> <span class="small">(${escapeHtml(String(s.key || "-"))})</span></td>
          <td>${escapeHtml(String(s.name || "-"))}</td>
          <td style="text-align:right;">${Number(s.cost) || 0}</td>
          <td>${escapeHtml(String(s.effect || "-"))}</td>
        </tr>
      `).join("");
      modal.open("Reference symboles", `
        <div class="card" style="max-height:72vh; overflow-y:auto;">
          <div class="small">Table officielle Soara V6 (moteur actuel)</div>
          ${isAlkane ? `` : `<div class="small">Affichage limite aux symboles des techniques apprises.</div>`}
          <div style="height:8px"></div>
          <div class="card" style="margin-bottom:8px; overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse;">
              <thead>
                <tr>
                  <th style="text-align:left;">Symbole</th>
                  <th style="text-align:left;">Nom</th>
                  <th style="text-align:right;">Cout</th>
                  <th style="text-align:left;">Effet</th>
                </tr>
              </thead>
              <tbody>
                ${symbolRows}
                ${isAlkane ? `<tr>
                  <td><b>↓S</b></td>
                  <td>Prefixe de retombee</td>
                  <td style="text-align:right;">+1</td>
                  <td>Si S est une attaque, ajoute +ATK. Sinon, pas d'effet offensif.</td>
                </tr>` : ``}
              </tbody>
            </table>
          </div>
          ${!isAlkane && rowsSource.length === 0 ? `<div class="small">Aucun symbole visible: apprends une technique pour debloquer la table.</div>` : ``}
          ${isAlkane ? `<div class="card" style="margin-bottom:6px;">
            <div><b>Prefixes et suffixes V6</b></div>
            <div class="small"><b>/S</b>: protection alliee (+1 energie sur S).</div>
            <div class="small"><b>//S</b>: double protection (+2 energie sur S).</div>
            <div class="small"><b>>S</b>: couverture sol-air (+1 energie sur S).</div>
            <div class="small"><b>↓S</b>: prefixe de retombee (+1 energie); si S est une attaque, ajoute +ATK.</div>
            <div class="small"><b>S!</b>: annulation de la technique au tour suivant.</div>
          </div>
          <div class="card" style="margin-bottom:6px;">
            <div><b>Grammaire de sequence</b></div>
            <div class="small"><b>( )</b>: technique normale (cout x1).</div>
            <div class="small"><b>[ ]</b>: reflexe (2 symboles, cout x2).</div>
            <div class="small"><b>{ }</b>: symbole joue en l'air (cout x3).</div>
            <div class="small"><b>^ puis ↓S</b>: saut puis retombee prefixee dans la meme technique.</div>
          </div>` : ``}
        </div>
      `);
    });
    bindClick("btnOpenTechList", () => {
      const all = Array.isArray(runtimeTechCatalogue) ? runtimeTechCatalogue : [];
      const learnedSet = new Set(
        (Array.isArray(getPlayerSnapshot()?.learnedTechniques) ? getPlayerSnapshot().learnedTechniques : [])
          .map((x) => (typeof x === "string" ? x : x?.id))
          .filter(Boolean)
      );
      const expectedSeqRange = (tech) => {
        if (tech?.type === "reflex") return { min: 2, max: 2 };
        return { min: 1, max: 7 };
      };
      const counts = {
        total: all.length,
        normal: all.filter((t) => t?.type !== "reflex").length,
        reflex: all.filter((t) => t?.type === "reflex").length,
        base: all.filter((t) => String(t?.tier || "").toLowerCase() === "base").length,
        advanced: all.filter((t) => String(t?.tier || "").toLowerCase() === "advanced").length,
        expert: all.filter((t) => String(t?.tier || "").toLowerCase() === "expert").length
      };
      function techCard(t) {
        const isLearned = learnedSet.has(t?.id);
        const isLocked = !isAlkane && !isLearned;
        const typeLabel = t?.type === "reflex" ? "Reflexe" : "Technique";
        const rarity = t?.type === "reflex" ? null : (t?.rarity || "-");
        const category = t?.category || "-";
        const rawSeq = Array.isArray(t?.symbols) ? t.symbols : (Array.isArray(t?.seq) ? t.seq : []);
        const seq = isLocked
          ? "????"
          : formatSeq(Array.isArray(t?.tokens) ? t.tokens : rawSeq, t?.type === "reflex" ? "reflex" : "base");
        const seqLen = rawSeq.length;
        const expected = expectedSeqRange(t);
        const badSeq = seqLen < expected.min || seqLen > expected.max;
        const seqLabel = expected.min === expected.max
          ? `${expected.min}`
          : `${expected.min}-${expected.max}`;
        const cost = isLocked ? "?" : (t?.totalEnergyCost ?? t?.totalCost ?? "-");
        const dpt = isLocked ? "?" : (t?.estimatedDamagePerTurn ?? t?.dpt ?? "-");
        const eff = isLocked ? "?" : (Number.isFinite(Number(t?.efficiency)) ? Number(t.efficiency).toFixed(2) : "-");
        const bal = isLocked ? "?" : (Number.isFinite(Number(t?.balanceIndex)) ? Number(t.balanceIndex).toFixed(1) : "-");
        const profile = isLocked
          ? "O:? D:? E:? Eco:?"
          : `O:${t?.offensePer10 ?? "-"} D:${t?.defensePer10 ?? "-"} E:${t?.evasionPer10 ?? "-"} Eco:${t?.economyPer10 ?? "-"}`;
        const desc = isLocked ? "Technique non apprise." : (t?.description || "-");
        const util = isLocked ? "Debloquer pour voir les details." : (t?.utility || "-");
        const weak = isLocked ? "-" : (t?.weakness || t?.drawback || "-");
        const lockStyle = isLocked
          ? `background-image: repeating-linear-gradient(135deg, rgba(107,114,128,0.18) 0 8px, rgba(17,24,39,0.28) 8px 16px); border: 1px solid #6b7280;`
          : ``;
        return `
          <div class="card" style="margin-bottom:6px; ${lockStyle}">
            <div><b>${t?.name || "-"}</b></div>
            <div class="small">${typeLabel} | ${category}${rarity ? ` | ${rarity}` : ""}${isLocked ? " | Hachuree" : ""}</div>
            <div class="small">${seq}</div>
            <div class="small">Longueur: ${isLocked ? "?" : seqLen} (attendu ${seqLabel})${isLocked ? "" : (badSeq ? " | INVALIDE" : "")}</div>
            <div class="small">Cout: ${cost} | DPT: ${dpt} | Eff: ${eff} | Equilibre: ${bal}</div>
            <div class="small">Profil: ${profile}</div>
            <div class="small">Description: ${desc}</div>
            <div class="small">Utilite: ${util}</div>
            <div class="small">Defaut: ${weak}</div>
          </div>
        `;
      }

      function matchesQuery(t, q) {
        if (!q) return true;
        const typeLabel = t?.type === "reflex" ? "reflexe" : "technique";
        const seq = formatSeq(Array.isArray(t?.tokens) ? t.tokens : (Array.isArray(t?.seq) ? t.seq : []), t?.type === "reflex" ? "reflex" : "base");
        const haystack = [
          t?.name || "",
          t?.category || "",
          t?.tier || "",
          t?.rarity || "",
          t?.description || "",
          t?.utility || "",
          t?.weakness || t?.drawback || "",
          String(t?.efficiency ?? ""),
          String(t?.balanceIndex ?? ""),
          typeLabel,
          seq
        ].join(" ").toLowerCase();
        return haystack.includes(q.toLowerCase());
      }

      function renderTechList(query = "") {
        const filtered = all.filter((t) => matchesQuery(t, query));
        const body = document.getElementById("techListBody");
        const count = document.getElementById("techListCount");
        if (count) {
          const invalidFiltered = filtered.filter((t) => {
            const rawSeq = Array.isArray(t?.symbols) ? t.symbols : (Array.isArray(t?.seq) ? t.seq : []);
            const expected = expectedSeqRange(t);
            return rawSeq.length < expected.min || rawSeq.length > expected.max;
          }).length;
          count.textContent = `Resultats: ${filtered.length} | Invalides: ${invalidFiltered}`;
        }
        if (body) {
          body.innerHTML = filtered.map((t) => techCard(t)).join("") || `<div class="small">Aucun resultat.</div>`;
        }
      }

      modal.open("Catalogue technique", `
        <div class="card">
          <div class="small">Catalogue runtime - lecture seule</div>
          <div class="small">Total: ${counts.total} | Base: ${counts.base} | Advanced: ${counts.advanced} | Expert: ${counts.expert} | Reflexes: ${counts.reflex}</div>
          <div class="small">Types: Techniques ${counts.normal} | Reflexes ${counts.reflex}</div>
          <div style="height:8px"></div>
          <input id="techListSearch" class="input" style="width:100%;" placeholder="Recherche (nom, type, categorie, tier, rarete hors reflexes, sequence)" />
          <div id="techListCount" class="small" style="margin-top:6px;">Resultats: ${all.length} | Invalides: 0</div>
          <div style="height:8px"></div>
          <div id="techListBody" style="max-height:62vh; overflow-y:auto;"></div>
        </div>
      `);
      const input = document.getElementById("techListSearch");
      if (input) {
        input.oninput = () => renderTechList(input.value || "");
      }
      renderTechList("");
    });
    bindClick("btnOpenLoreCodex", openLoreCodex);
    bindClick("btnLogoutInSettings", doLogout);
  }

  async function doLogout(){
    auth.logout();
    api.clearToken();

    staticData = null;
    userState = null;

    hud.hide();
    if (dom.characterGate) dom.characterGate.style.display = "none";
    setMapOnlyMode(false);
    gate.show("");
    setAuthMode(false);
    modal.close();

    try{ camera?.detach?.(); }catch{}
    try{ visitedOverlay?.detach?.(); }catch{}
    try{ pixi.destroy(); }catch{}
    stopMultiSync();
    mapView = null;
    camera = null;
    pins = null;
    dom.canvasWrap.innerHTML = "";
    renderDefaultMapDialogue();
  }

  const hud = mountHud(dom, {
    onOpenPlayer: openPlayer,
    onOpenReputation: openReputation,
    onOpenTech: openTech,
    onOpenHistory: openHistory,
    onOpenInventory: openInventory,
    onOpenSettings: openSettings,
    onToggleMapMode: (enabled) => setMapOnlyMode(enabled),
    isMapModeEnabled: () => isMapOnlyModeEnabled(),
  });

  const gate = mountAuthGate(dom, {
    onLogin: async ({ username, password }) => {
      const token = await auth.login(username, password);
      api.setToken(token);
      try {
        await startGame();
      } catch (e) {
        await doLogout();
        throw e;
      }
    },
    onRegister: async ({ username, password }) => {
      await auth.register(username, password);
    }
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    if (dom.modal?.style.display === "block") modal.close();
  });
  playerState.subscribe(() => {
    renderPinsUi();
  });

  hud.hide();
  if (dom.characterGate) dom.characterGate.style.display = "none";
  setMapOnlyMode(false);
  gate.show("");
  setAuthMode(false);

  window.addEventListener("beforeunload", () => {
    cacheCurrentPos(userState?.pos);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") cacheCurrentPos(userState?.pos);
  });

  async function startGame(){
    gate.hide();
    setAuthMode(true);

    staticData = await dataSvc.loadAll();
    runtimeTechCatalogue = buildRuntimeCatalogue({
      techniques: staticData?.techniques || null,
      reflexes: staticData?.reflexes || []
    });
    CATALOGUE_MAP = buildCatalogueMap(runtimeTechCatalogue);
    playerState.setCatalogue(runtimeTechCatalogue);
    userState = await stateSvc.getState();
    playerState.bindAccount?.(userState?.username || userState?.name || "");
    await ensureCharacterProfileOnGate();
    let accountInventory = sanitizeInventoryForProgress(userState?.inventory);
    accountInventory = sanitizeTravelFoodInventory(accountInventory);
    const rawInventory = normalizeInventoryFromAccount(userState?.inventory);
    const inventoryChanged = JSON.stringify(accountInventory) !== JSON.stringify(rawInventory);
    if (inventoryChanged) {
      try {
        await stateSvc.patchState({ inventory: accountInventory });
        userState = { ...(userState || {}), inventory: accountInventory };
      } catch (e) {
        console.warn("Echec migration inventaire:", e);
      }
    }
    const accountTechProfile = normalizeTechniqueProfileFromAccount(userState || {});
    playerState.patch((s) => {
      if (!s.player.displayName || s.player.displayName === "Joueur1") {
        s.player.displayName = userState?.name || userState?.username || "Joueur1";
      }
      s.player.learnedTechniques = accountTechProfile.learnedTechniques;
      s.player.techniquesBySlot = accountTechProfile.techniquesBySlot;
      s.player.techSlotsTotal = accountTechProfile.techSlotsTotal;
      s.player.hasStarterKitV2 = !!accountTechProfile.hasStarterKitV2;
      s.player.inventorySlots = [...accountInventory];
    });
    await applyRaceStarterPackIfNeeded();
    await applyProgressionFromHistory();
    await syncTechniquesToAccount({ silent: true });

    const savedX = Number(userState?.pos?.x);
    const savedY = Number(userState?.pos?.y);
    const hasSavedPos = Number.isFinite(savedX) && Number.isFinite(savedY);
    const cachedPos = readCachedPosForUser(userState?.username || userState?.name || "");
    if (hasSavedPos) {
      userState.pos = { x: savedX, y: savedY };
      if (cachedPos && distanceNorm(cachedPos, userState.pos) > 0.0005) {
        userState.pos = { ...cachedPos };
        await stateSvc.patchState({ pos: userState.pos });
      }
    } else {
      userState.pos = cachedPos || { ...PLAYER_SPAWN_POS };
      await stateSvc.patchState({ pos: userState.pos });
    }
    cacheCurrentPos(userState.pos);

    await pixi.init();
    applyRuntimeModeNotice();
    if (!ENABLE_MULTI_MODE) {
      multiApiAvailable = false;
      stopMultiSync();
    }

    mapView = createMapView({ pixi, mapUrl: ["/assets/map.jpg", "/assets/map.png"] });
    await mapView.load();
    visitedOverlay.attach({ pixi, mapView });
    mapView.resetTrail?.();
    sessionExploredPoints = [];
    mapView.fitToScreen();
    mapView.setPlayerPosNorm(userState.pos);
    mapView.centerOnPlayer();
    startMultiSync();

    camera = createCameraController({ pixi, mapView });
    camera.attach();
    camera.setZoomDefault?.();
    camera.centerOnPlayer?.();

    pins = createPinsRenderer({ pixi, mapView });
    pins.onPinClick((pin) => {
      selectPinAndRenderDialogue(pin);
    });

    visitedOverlay.enable(true);
    await ensureDiscoveryState();

    hud.render(userState);
    hud.show();
    renderDefaultMapDialogue();
    renderPinsUi();
  }

  const restored = auth.restore();
  if (!restored) return;

  api.setToken(restored);
  try{
    await auth.verifyMe();
    await startGame();
  }catch{
    await doLogout();
  }
})();
