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

import { createCampaignRunner } from "./features/campaignRunner.js";
import { createCombatScreen } from "./features/combatScreen.js";
import { createPlayerState } from "./state/playerState.js";
import { runTutorialDialogue } from "./features/campaignTutorialDialogue.js";
import { TECH_CATALOGUE, buildCatalogueMap, buildRuntimeCatalogue } from "./data/techCatalogue.js";
import { formatTechniqueSequence } from "./features/tokenModel.js";
import { SYMBOLS_V6_UI } from "./data/symbolsV6.js";
import { computeEquipmentStats, getEquipmentLabel, STARTER_EQUIPMENT } from "./data/equipmentBase.js";
import { computeResolution } from "./features/resolutionSandbox.js";
import { escapeHtml } from "./utils/escapeHtml.js";

let runtimeTechCatalogue = [...TECH_CATALOGUE];
let CATALOGUE_MAP = buildCatalogueMap(runtimeTechCatalogue);
const CAMPAIGN_C01_POS = { x: 0.5, y: 0.58 };
const PLAYER_SPAWN_POS = { x: 0.515, y: 0.58 };
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

  function createNarrativeMusicController() {
  const VOLUME_KEY = "soara_music_volume";
  const TRACK_URL = "/assets/narrative_combat.mp3";
  const audio = new Audio(TRACK_URL);
  audio.loop = true;
  audio.preload = "auto";

  function clampVolume(v) {
    return Math.max(0, Math.min(1, Number(v)));
  }

  function readStoredVolume() {
    const raw = window.localStorage.getItem(VOLUME_KEY);
    if (raw == null) return 0.1;
    const v = clampVolume(raw);
    return Number.isFinite(v) ? v : 0.1;
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
    onInitiativeReveal: ({ turn, combatType }) => {
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
      pendingProgressCombat = null;
      narrativeMusic.stop();
      musicRequestedByCombatOpen = false;
      musicStartedForCurrentCombat = false;
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
    return String(userState?.username || "").trim().toLowerCase() === "alkane";
  }

  function getUserHistory() {
    return Array.isArray(userState?.history) ? userState.history : [];
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
    if (pins && staticData) pins.render(getRuntimePins(), userState || {});
  }

  async function applyProgressionReward(stage) {
    if (stage === "dialogue") {
      if (!hasHistoryMarker(PROGRESS_MARKERS.dialogue)) {
        applyEquipmentReward({ rightHand: "weapon_training_sword" });
        await appendHistoryEntries([PROGRESS_MARKERS.dialogue, "Recompense: epee en bois (+2 ATK)."]);
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
    return { id: "pin_tutorial_combat", type: "tutorialCombat", name: "Tutoriel Combat", x: 0.54, y: 0.56, icon: "T" };
  }

  function getRuntimePins() {
    const flags = getProgressFlags();
    const sourcePins = Array.isArray(staticData?.pins) ? staticData.pins : [];
    const campPin = sourcePins.find((pin) => pin?.id === "C");
    const pvePin = sourcePins.find((pin) => pin?.id === "U");
    const narrativePin = sourcePins.find((pin) => pin?.id === "N");
    const out = [];
    if (campPin) out.push(campPin);
    if (flags.dialogueDone && !flags.tutorialDone) out.push(tutorialCombatPin());
    if (flags.tutorialDone && pvePin) out.push(pvePin);
    if (flags.pveUDone && narrativePin) out.push(narrativePin);
    return out;
  }

  function onStateChanged(next){
    userState = next;
    hud.render(userState);
    if (pins && staticData) pins.render(getRuntimePins(), userState);
  }

  const campaignRunner = createCampaignRunner({
    modal,
    stateSvc,
    onStateChanged,
    openCombatScreen: (options) => openCombatScreen(options),
    onApplyLoadout: async (patch) => {
      playerState.patch((s) => {
        s.player.learnedTechniques = Array.isArray(patch?.learnedTechniques)
          ? [...patch.learnedTechniques]
          : s.player.learnedTechniques;
        s.player.techniquesBySlot = Array.isArray(patch?.techniquesBySlot)
          ? [...patch.techniquesBySlot]
          : s.player.techniquesBySlot;
        s.player.techSlotsTotal = Number.isFinite(Number(patch?.techSlotsTotal))
          ? Number(patch.techSlotsTotal)
          : s.player.techSlotsTotal;
        if (Array.isArray(patch?.learnedReflexes)) {
          s.player.learnedReflexes = [...patch.learnedReflexes];
        }
        s.player.hasStarterKitV2 = true;
      });
      await syncTechniquesToAccount({ silent: true });
    }
  });

  const pinModal = createPinModal({
    modal,
    getCampaigns: () => (staticData?.campaigns || {}),
    campaignRunner,
    openCombatScreen: (options) => openCombatScreen(options),
    pvpApi,
    onCombatLaunch: (stage) => {
      if (stage === "tutorial") pendingProgressCombat = "tutorial";
      if (stage === "pve") pendingProgressCombat = "pveU";
      if (stage === "narrative") pendingProgressCombat = "narrativeN";
    }
  });

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
    const tagsProfil = userState.tagsProfil || {};
    const ps = getPlayerSnapshot();
    const eqStats = computeEquipmentStats(ps.equipment || {});
    const learnedIds = new Set((ps.learnedTechniques || []).map((x) => (typeof x === "string" ? x : x?.id)).filter(Boolean));
    const counts = { offense: 0, defense: 0, evasion: 0, economy: 0, reflex: 0 };
    for (const id of learnedIds) {
      const t = CATALOGUE_MAP.get(id);
      if (!t) continue;
      if (t.type === "reflex") counts.reflex += 1;
      else if (counts[t.category] !== undefined) counts[t.category] += 1;
    }

    modal.open("Fiche Entite", `
      <div class="playerSheetGrid">
        <section class="card playerSheetCard">
          <div class="playerSheetTitle">Identite</div>
          <div><b>${escapeHtml(ps.displayName || userState.name || userState.username || "Joueur")}</b></div>
          <div class="small">Race: ${escapeHtml(userState.race || "-")}</div>
          <div class="small">Faction: ${escapeHtml(userState.faction || "-")}</div>
        </section>

        <section class="card playerSheetCard">
          <div class="playerSheetTitle">Stats</div>
          <div class="small">PV: ${ps.stats.hp}/${ps.stats.hpMax}</div>
          <div class="small">Energie: ${ps.stats.energy}/${ps.stats.energyMax}</div>
          <div class="small">Regen: ${ps.stats.regen}</div>
        </section>

        <section class="card playerSheetCard">
          <div class="playerSheetTitle">Parametres Combat</div>
          <div class="small">ATK: ${eqStats.atk}</div>
          <div class="small">DEF: ${eqStats.def}</div>
          <div class="small">ESQ: ${eqStats.esq}</div>
        </section>

        <section class="card playerSheetCard">
          <div class="playerSheetTitle">Profil</div>
          <div class="small">Objectif: ${escapeHtml(ps.profile.objectif || "-")}</div>
          <div class="small">Temperament: ${escapeHtml(ps.profile.temperament || "-")}</div>
          <div class="small">Style: ${escapeHtml(ps.profile.style || "-")}</div>
          <div class="small">Tag prudence: ${Number(tagsProfil.prudence ?? 0)}</div>
          <div class="small">Tag agressivite: ${Number(tagsProfil.agressivite ?? 0)}</div>
          <div class="small">Tag tempo: ${Number(tagsProfil.tempo ?? 0)}</div>
          <div class="small">Reputation locale: ${Number(userState.reputationLocale ?? 0)}</div>
        </section>

        <section class="card playerSheetCard">
          <div class="playerSheetTitle">Reputation</div>
          <div class="small">Bazeides: ${rep.bazeides ?? 0}</div>
          <div class="small">Federation: ${rep.federation ?? 0}</div>
          <div class="small">Roor: ${rep.roor ?? 0}</div>
          <div class="small">Gobelins: ${rep.gobelins ?? 0}</div>
        </section>

        <section class="card playerSheetCard">
          <div class="playerSheetTitle">Equipement</div>
          <div class="small">Main droite: ${escapeHtml(getEquipmentLabel(ps.equipment.rightHand))}</div>
          <div class="small">Main gauche: ${escapeHtml(getEquipmentLabel(ps.equipment.leftHand))}</div>
          <div class="small">Armure: ${escapeHtml(getEquipmentLabel(ps.equipment.armor))}</div>
          <div class="small">Accessoire: ${escapeHtml(getEquipmentLabel(ps.equipment.accessory))}</div>
        </section>

        <section class="card playerSheetCard">
          <div class="playerSheetTitle">Synthese Technique</div>
          <div class="small">Techniques apprises: ${learnedIds.size}</div>
          <div class="small">Offense: ${counts.offense} | Defense: ${counts.defense}</div>
          <div class="small">Esquive: ${counts.evasion} | Economie: ${counts.economy}</div>
          <div class="small">Reflexes: ${counts.reflex}</div>
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
    const hist = userState.history || [];
    const c01 = userState.historiqueC01 || [];
    modal.open("Historique", `
      <div class="card">
        <div class="small">Dernieres entrees</div>
        <div style="height:10px"></div>
        ${hist.slice(-20).map((x) => `<div>${escapeHtml(x)}</div>`).join("") || "<div>-</div>"}
        <div style="height:12px"></div>
        <div class="small">C01</div>
        <div style="height:8px"></div>
        ${c01.slice(-20).map((x) => `<div>${escapeHtml(x)}</div>`).join("") || "<div>-</div>"}
      </div>
    `);
  }

  function openInventory(){
    const ps = getPlayerSnapshot();
    const inv = ps.inventorySlots || [];
    const equip = ps.equipment || {};
    const eqVals = [
      escapeHtml(getEquipmentLabel(equip.rightHand)),
      escapeHtml(getEquipmentLabel(equip.leftHand)),
      escapeHtml(getEquipmentLabel(equip.armor)),
      escapeHtml(getEquipmentLabel(equip.accessory))
    ];
    let html = `
      <div class="card">
        <div class="hudInvTitle">INVENTAIRE D'ENTITE</div>
        <div style="height:8px"></div>
        <div class="invPanelSection">
          <div class="invPanelLabel">Equipement actif</div>
          <div class="hudInvEquipGrid">
            <div class="invSlot" id="eq0" title="Main droite">${eqVals[0]}</div>
            <div class="invSlot" id="eq1" title="Main gauche">${eqVals[1]}</div>
            <div class="invSlot" id="eq2" title="Armure">${eqVals[2]}</div>
            <div class="invSlot" id="eq3" title="Accessoire">${eqVals[3]}</div>
          </div>
        </div>
        <div style="height:8px"></div>
        <div class="invPanelSection">
          <div class="invPanelLabel">Sac (9 emplacements)</div>
          <div class="hudInvBagGrid">`;
    for (let i = 0; i < 9; i += 1) {
      html += `<div class="invSlot" id="inv${i}" title="Slot ${i + 1}">${escapeHtml(inv[i] || "")}</div>`;
    }
    html += `
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

    function openResolutionTestModal() {
      const symbolOptions = SYMBOLS_V6_UI
        .map((s) => `<option value="${s.key}">${s.symbol} ${s.name}</option>`)
        .join("");
      const symbolCostByKey = new Map(SYMBOLS_V6_UI.map((s) => [String(s.key), Number(s.cost) || 0]));
      modal.open("Banc de resolution", `
        <div class="card" style="max-height:72vh; overflow-y:auto;">
          <div class="small">Simulation de resolution deterministe (sans des, sauf initiative).</div>
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
          <div class="small">Rappel: l'initiative reste le seul tirage aleatoire.</div>
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
        <button class="btn" id="btnOpenCombatRules" style="width:100%; margin-bottom:8px;">Regles de resolution</button>
        <button class="btn" id="btnOpenSymbolsGuide" style="width:100%; margin-bottom:8px;">Reference symboles</button>
        <button class="btn" id="btnOpenTechList" style="width:100%; margin-bottom:8px;">Catalogue technique</button>
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
    const resolutionBtn = document.getElementById("btnOpenResolutionTest");
    if (resolutionBtn) resolutionBtn.onclick = openResolutionTestModal;
    document.getElementById("btnOpenCombatRules").onclick = () => {
      modal.open("Regles de resolution", `
        <div class="card" style="max-height:72vh; overflow-y:auto;">
          <div><b>Systeme deterministe (sans des)</b></div>
          <div class="small" style="margin-top:6px;">Les degats ne lancent plus de des.</div>
          <div class="small">Formule: <b>Degats = max(0, ATK - (DEF + Armure))</b></div>
          <div class="small" style="margin-top:6px;">Exemple: ATK 4 vs DEF 2 + Armure 1 = 1 degat.</div>
          <div style="height:10px"></div>
          <div><b>Symboles multi-impact</b></div>
          <div class="small">Multiplicateurs deterministes: <b>stat x2</b>, <b>stat x3</b>, etc.</div>
          <div style="height:10px"></div>
          <div><b>Parade</b></div>
          <div class="small">Si une entite pare une attaque, elle renvoie:</div>
          <div class="small"><b>min(attaque entrante, 2xATK du pareur)</b></div>
          <div class="small">L'attaque paree est annulee pour ce cote.</div>
          <div style="height:10px"></div>
          <div><b>Etat Vulnerable</b></div>
          <div class="small">Quand une entite joue Vulnerable, elle prend <b>x2 degats recus</b> sur le tour courant.</div>
          <div style="height:10px"></div>
          <div><b>Grammaire visuelle</b></div>
          <div class="small">( ) : technique, cout normal</div>
          <div class="small">[ ] : reflexe, cout double</div>
          <div class="small">{ } : phase aerienne, cout triple</div>
        </div>
      `);
    };
    document.getElementById("btnOpenSymbolsGuide").onclick = () => {
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
    };
    document.getElementById("btnOpenTechList").onclick = () => {
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
    };
    const loreBtn = document.getElementById("btnOpenLoreCodex");
    if (loreBtn) loreBtn.onclick = openLoreCodex;
    document.getElementById("btnLogoutInSettings").onclick = doLogout;
  }

  function openCampaignTutorDialogue() {
    runTutorialDialogue({
      modal,
      playerState,
      onDone: () => {
        void applyProgressionReward("dialogue");
        hud.render(userState || {});
        if (pins && staticData) pins.render(getRuntimePins(), userState || {});
      }
    });
  }

  async function openWelcomeIntroModal() {
    await new Promise((resolve) => {
      modal.open("Accueil", `
        <div class="card">
          <div><b>Bienvenue sur Soara.</b></div>
          <div class="small">Commence par C-01 (dialogue), puis debloque T, ensuite U puis N.</div>
          <div style="height:10px"></div>
          <button class="btn" id="btnWelcomeSoara" style="width:100%;">Continuer</button>
        </div>
      `);
      const btn = document.getElementById("btnWelcomeSoara");
      if (!btn) {
        modal.close();
        resolve();
        return;
      }
      btn.onclick = () => {
        modal.close();
        resolve();
      };
    });
  }

  async function doLogout(){
    auth.logout();
    api.clearToken();

    staticData = null;
    userState = null;

    hud.hide();
    setMapOnlyMode(false);
    gate.show("");
    setAuthMode(false);
    modal.close();

    try{ camera?.detach?.(); }catch{}
    try{ pixi.destroy(); }catch{}
    stopMultiSync();
    mapView = null;
    camera = null;
    pins = null;
    dom.canvasWrap.innerHTML = "";
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
    if (pins && staticData) pins.render(getRuntimePins(), userState || {});
  });

  hud.hide();
  setMapOnlyMode(false);
  gate.show("");
  setAuthMode(false);

  async function startGame(){
    gate.hide();
    hud.show();
    setAuthMode(true);

    staticData = await dataSvc.loadAll();
    runtimeTechCatalogue = buildRuntimeCatalogue({
      techniques: staticData?.techniques || null,
      reflexes: staticData?.reflexes || []
    });
    CATALOGUE_MAP = buildCatalogueMap(runtimeTechCatalogue);
    playerState.setCatalogue(runtimeTechCatalogue);
    userState = await stateSvc.getState();
    const accountTechProfile = normalizeTechniqueProfileFromAccount(userState || {});
    playerState.patch((s) => {
      if (!s.player.displayName || s.player.displayName === "Joueur1") {
        s.player.displayName = userState?.name || userState?.username || "Joueur1";
      }
      s.player.learnedTechniques = accountTechProfile.learnedTechniques;
      s.player.techniquesBySlot = accountTechProfile.techniquesBySlot;
      s.player.techSlotsTotal = accountTechProfile.techSlotsTotal;
      s.player.hasStarterKitV2 = !!accountTechProfile.hasStarterKitV2;
    });
    playerState.grantStarterTechniques();
    await applyProgressionFromHistory();
    await syncTechniquesToAccount({ silent: true });

    const isLegacySpawnOnCampaignPin = userState.pos
      && Math.abs(Number(userState.pos.x) - CAMPAIGN_C01_POS.x) < 0.000001
      && Math.abs(Number(userState.pos.y) - CAMPAIGN_C01_POS.y) < 0.000001;

    if (!userState.pos || isLegacySpawnOnCampaignPin) {
      userState.pos = { ...PLAYER_SPAWN_POS };
      await stateSvc.patchState({ pos: userState.pos });
    }

    await pixi.init();
    applyRuntimeModeNotice();
    if (!ENABLE_MULTI_MODE) {
      multiApiAvailable = false;
      stopMultiSync();
    }

    mapView = createMapView({ pixi, mapUrl: ["/assets/20260301_201801.jpg", "/assets/map.jpg"] });
    await mapView.load();
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
      if (pin.type === "tutorialCombat") {
        modal.open("Tutoriel Combat", `
          <div class="card">
            <div>Pret pour le tutoriel combat ?</div>
            <div style="height:10px"></div>
            <button class="btn" id="btnStartTutorialCombat" style="width:100%; margin-bottom:6px;">Commencer</button>
            <button class="btn" id="btnLaterTutorialCombat" style="width:100%;">Plus tard</button>
          </div>
        `);
        document.getElementById("btnStartTutorialCombat").onclick = () => {
          modal.close();
          pendingProgressCombat = "tutorial";
          openCombatScreen({ enemyPreset: { name: "Gobelin" } });
        };
        document.getElementById("btnLaterTutorialCombat").onclick = () => modal.close();
        return;
      }
      pinModal.open(pin, userState);
    });

    visitedOverlay.enable(!!staticData?.config?.features?.visitedOverlay);

    hud.render(userState);
    pins.render(getRuntimePins(), userState);
    if (!hasHistoryMarker(PROGRESS_MARKERS.dialogue)) {
      await openWelcomeIntroModal();
      openCampaignTutorDialogue();
    }
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
