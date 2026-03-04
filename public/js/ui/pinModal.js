import { escapeHtml } from "../utils/escapeHtml.js";

export function createPinModal({ modal, getCampaigns, campaignRunner, openCombatScreen, pvpApi, onCombatLaunch }){
  const ROLL_SPEED_MS = 45;
  let pvpPollingTimer = null;
  let pvpStartTimeout = null;
  let pvpStartAnimTimer = null;
  let pvpStartAnimUntil = 0;

  function stopPvpPolling() {
    if (pvpPollingTimer) window.clearInterval(pvpPollingTimer);
    pvpPollingTimer = null;
    if (pvpStartTimeout) window.clearTimeout(pvpStartTimeout);
    pvpStartTimeout = null;
    if (pvpStartAnimTimer) window.clearInterval(pvpStartAnimTimer);
    pvpStartAnimTimer = null;
    pvpStartAnimUntil = 0;
  }

  function open(pin, userState){
    if (pin.kind === "campaign"){
      const campaigns = getCampaigns?.() || {};
      const camp = campaigns[pin.campaignId];
      if (!camp){
        modal.open(pin.name, `<div class="small">Campagne introuvable: ${escapeHtml(pin.campaignId)}</div>`);
        return;
      }
      campaignRunner.start({ campaign: camp, userState });
      return;
    }

    if (pin.kind === "combat_tutorial"){
      modal.close();
      onCombatLaunch?.("tutorial", pin);
      if (typeof openCombatScreen === "function") openCombatScreen();
      return;
    }

    if (pin.kind === "combat_narrative_music"){
      modal.close();
      onCombatLaunch?.("narrative", pin);
      if (typeof openCombatScreen === "function") {
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
      }
      return;
    }

    if (pin.kind === "combat_pve"){
      modal.close();
      onCombatLaunch?.("pve", pin);
      if (typeof openCombatScreen === "function") {
        openCombatScreen({
          combatType: "pve",
          phaseDurations: { askRoll: 1, revealRoll: 5, runTimer: 20, endWait: 6 },
          enemyPreset: { name: "Entite hostile" }
        });
      }
      return;
    }

    if (pin.kind === "combat_pvp"){
      if (!pvpApi) {
        modal.open(pin.name, `<div class="small">PVP indisponible: relais serveur absent.</div>`);
        return;
      }

      stopPvpPolling();
      let roomCode = "";
      let inRoom = false;
      let hasStarted = false;
      let pendingStartRequest = false;

      modal.open(pin.name, `
        <div class="card">
          <div><b>Salle PVP (duel)</b></div>
          <div class="small">Choisis une salle active pour rejoindre le duel.</div>
          <div style="height:10px"></div>
          <div class="row" style="gap:8px;">
            <button class="btn" id="pvpCreateBtn" style="flex:1;">Creer salle</button>
            <button class="btn" id="pvpRefreshRoomsBtn" style="flex:1;">Actualiser salles</button>
          </div>
          <div style="height:8px"></div>
          <div id="pvpRoomsList" class="card small" style="max-height:20vh; overflow:auto;">Chargement des salles...</div>
          <div style="height:10px"></div>
          <div id="pvpNarrative" class="card small">Cree une salle ou rejoins une salle active.</div>
          <div style="height:10px"></div>
          <button class="btn" id="pvpReadyBtn" style="width:100%; margin-bottom:8px;" disabled>Je suis pret (Espace)</button>
          <button class="btn" id="pvpLaunchBtn" style="width:100%; margin-bottom:8px;" disabled>Declencher duel</button>
          <button class="btn" id="pvpCancelBtn" style="width:100%;">Annuler</button>
        </div>
      `);

      const createBtn = document.getElementById("pvpCreateBtn");
      const refreshRoomsBtn = document.getElementById("pvpRefreshRoomsBtn");
      const roomsListEl = document.getElementById("pvpRoomsList");
      const narrativeEl = document.getElementById("pvpNarrative");
      const readyBtn = document.getElementById("pvpReadyBtn");
      const launchBtn = document.getElementById("pvpLaunchBtn");
      const cancelBtn = document.getElementById("pvpCancelBtn");
      let lastOpponentName = "Adversaire";
      let keyHandlerAttached = false;
      let startAnimEnabled = false;
      let preStartInit = { player: null, enemy: null };
      function nextPreStartInitValue() {
        return 1 + Math.floor(Math.random() * 20);
      }

      function launchCombatNow() {
        if (hasStarted || typeof openCombatScreen !== "function") return;
        hasStarted = true;
        pendingStartRequest = false;
        startAnimEnabled = false;
        stopPvpPolling();
        if (keyHandlerAttached) {
          document.removeEventListener("keydown", onPvpKeyDown);
          keyHandlerAttached = false;
        }
        modal.close();
        openCombatScreen({
          combatType: "pvp",
          pvpSkipFirstReveal: true,
          pvpInitialInit: { ...preStartInit },
          enemyPreset: { name: lastOpponentName || "Adversaire" }
        });
      }

      function scheduleLaunchAt(startAtMs) {
        if (hasStarted) return;
        const ts = Number(startAtMs);
        if (!Number.isFinite(ts)) return;
        if (pvpStartTimeout) window.clearTimeout(pvpStartTimeout);
        const delay = Math.max(0, ts - Date.now());
        pvpStartTimeout = window.setTimeout(() => {
          pvpStartTimeout = null;
          launchCombatNow();
        }, delay);
      }

      function startPreCombatRollAnimation() {
        if (pvpStartAnimTimer) return;
        pvpStartAnimTimer = window.setInterval(() => {
          if (!startAnimEnabled || !document.getElementById("pvpNarrative")) {
            if (pvpStartAnimTimer) window.clearInterval(pvpStartAnimTimer);
            pvpStartAnimTimer = null;
            return;
          }
          const leftMs = Math.max(0, Number(pvpStartAnimUntil || 0) - Date.now());
          const leftSec = Math.max(0, Math.ceil(leftMs / 1000));
          const r1 = nextPreStartInitValue();
          const r2 = nextPreStartInitValue();
          preStartInit = { player: r1, enemy: r2 };
          renderNarrative(`
            <div><b>Tous les joueurs sont prets.</b></div>
            <div>Animation de roll (5u) en cours...</div>
            <div>Jet J=${r1} / A=${r2}</div>
            <div>Debut combat dans: <b>${leftSec}s</b></div>
          `);
          if (leftMs <= 0) {
            window.clearInterval(pvpStartAnimTimer);
            pvpStartAnimTimer = null;
          }
        }, ROLL_SPEED_MS);
      }

      function renderNarrative(text) {
        if (narrativeEl) narrativeEl.innerHTML = text;
      }

      async function refreshRoomsList() {
        if (!roomsListEl) return;
        if (inRoom && roomCode) {
          roomsListEl.innerHTML = `<div>Salle active: <b>${escapeHtml(roomCode)}</b></div>`;
          return;
        }
        try {
          const out = await pvpApi.listRooms(pin.id);
          const rooms = Array.isArray(out?.rooms) ? out.rooms : [];
          if (!rooms.length) {
            roomsListEl.innerHTML = "<div>Aucune salle active.</div>";
            return;
          }
          roomsListEl.innerHTML = rooms.map((r) => {
            const canJoin = Number(r?.participantCount || 0) < 2;
            return `
              <div class="card" style="margin-bottom:6px;">
                <div><b>Salle ${escapeHtml(r.code)}</b> (${escapeHtml(r.status || "waiting")})</div>
                <div>Joueurs: ${r.participantCount || 0}/2 | Proches: ${r.nearCount || 0}/2 | Prets: ${r.readyCount || 0}/2</div>
                <div>Hote: ${escapeHtml(r.host || "-")}</div>
                <button class="btn pvpJoinRoomBtn" data-room-code="${escapeHtml(r.code)}" ${canJoin ? "" : "disabled"} style="width:100%; margin-top:6px;">Rejoindre salle</button>
              </div>
            `;
          }).join("");
          for (const btn of Array.from(roomsListEl.querySelectorAll(".pvpJoinRoomBtn"))) {
            btn.onclick = () => {
              const code = String(btn.getAttribute("data-room-code") || "").trim().toUpperCase();
              if (!code) return;
              void joinRoomByCode(code);
            };
          }
        } catch (e) {
          roomsListEl.innerHTML = `<div>Erreur salles: ${escapeHtml(e?.data?.message || e?.data?.error || "reseau")}</div>`;
        }
      }

      function clearUiIfClosed() {
        if (!document.getElementById("pvpNarrative")) {
          stopPvpPolling();
          if (keyHandlerAttached) {
            document.removeEventListener("keydown", onPvpKeyDown);
            keyHandlerAttached = false;
          }
          return true;
        }
        return false;
      }

      async function markReadyTrueBySpace() {
        if (!inRoom || !roomCode) return;
        try {
          const st = await pvpApi.status(roomCode);
          if (st?.selfReady) return;
          await pvpApi.ready(roomCode, true);
          await refreshRoomStatus();
        } catch {}
      }

      function onPvpKeyDown(event) {
        if (event.code !== "Space") return;
        if (!document.getElementById("pvpNarrative")) return;
        event.preventDefault();
        void markReadyTrueBySpace();
      }

      async function refreshRoomStatus() {
        if (clearUiIfClosed()) return;
        if (!inRoom || !roomCode) return;
        try {
          const st = await pvpApi.status(roomCode);
          if (clearUiIfClosed()) return;
          const started = !!st?.started;
          const canStart = !!st?.canStart;
          const oppName = st?.opponentName || "Adversaire";
          lastOpponentName = oppName;
          const startAt = Number(st?.startAt || 0);
          const startsInMs = Number(st?.startsInMs ?? 0);
          const startCountdown = st?.status === "starting"
            ? `<div>Demarrage dans: <b>${Math.max(0, Math.ceil(startsInMs / 1000))}s</b></div>`
            : "";
          renderNarrative(`
            <div><b>Salle ${escapeHtml(st?.code || roomCode)}</b></div>
            <div>Joueurs proches: <b>${st?.nearCount ?? 0}/2</b> | Joueurs: <b>${st?.participantCount ?? 0}/2</b></div>
            <div>Prets: <b>${st?.readyCount ?? 0}/2</b> (Espace)</div>
            ${startCountdown}
            <div>Vous: ${st?.selfNear ? "proche" : "trop loin"}</div>
            <div>${escapeHtml(oppName)}: ${st?.opponentNear ? "proche" : "pas proche"} | ${st?.opponentReady ? "pret" : "non pret"}</div>
          `);
          if (readyBtn) {
            readyBtn.disabled = false;
            readyBtn.textContent = st?.selfReady ? "Pret (valide)" : "Je suis pret (Espace)";
          }
          if (launchBtn) launchBtn.disabled = !canStart || st?.status === "starting";
          if (st?.status !== "starting") pendingStartRequest = false;
          if (roomsListEl) roomsListEl.innerHTML = `<div>Salle active: <b>${escapeHtml(roomCode)}</b></div>`;
          if (createBtn) createBtn.disabled = true;
          if (refreshRoomsBtn) refreshRoomsBtn.disabled = false;

          if (st?.status === "starting" && Number.isFinite(startAt) && startAt > 0) {
            startAnimEnabled = true;
            pvpStartAnimUntil = startAt;
            startPreCombatRollAnimation();
            scheduleLaunchAt(startAt);
          } else if (pvpStartTimeout) {
            window.clearTimeout(pvpStartTimeout);
            pvpStartTimeout = null;
            startAnimEnabled = false;
            if (pvpStartAnimTimer) {
              window.clearInterval(pvpStartAnimTimer);
              pvpStartAnimTimer = null;
            }
          }

          if (started) {
            launchCombatNow();
          }
        } catch (e) {
          if (e?.status === 404) {
            inRoom = false;
            roomCode = "";
            if (readyBtn) readyBtn.disabled = true;
            if (launchBtn) launchBtn.disabled = true;
            if (createBtn) createBtn.disabled = false;
            if (refreshRoomsBtn) refreshRoomsBtn.disabled = false;
            renderNarrative("<div><b>Salle introuvable.</b></div><div>Cree une nouvelle salle ou rejoins avec un autre code.</div>");
            void refreshRoomsList();
            return;
          }
          renderNarrative(`<div><b>Erreur salle</b></div><div>${escapeHtml(e?.data?.message || e?.data?.error || "Erreur reseau.")}</div>`);
        }
      }

      async function createRoom() {
        try {
          const out = await pvpApi.create({ pinId: pin.id, pinX: pin.x, pinY: pin.y });
          roomCode = String(out?.code || "");
          inRoom = !!roomCode;
          hasStarted = false;
          renderNarrative(`<div><b>Salle creee: ${escapeHtml(roomCode)}</b></div><div>En attente de l'adversaire...</div>`);
          await refreshRoomStatus();
        } catch (e) {
          renderNarrative(`<div><b>Creation impossible</b></div><div>${escapeHtml(e?.data?.message || e?.data?.error || "Erreur reseau.")}</div>`);
        }
      }

      async function joinRoomByCode(code) {
        try {
          await pvpApi.join(code);
          roomCode = code;
          inRoom = true;
          hasStarted = false;
          renderNarrative(`<div><b>Salle rejointe: ${escapeHtml(roomCode)}</b></div><div>Verification des statuts...</div>`);
          await refreshRoomStatus();
        } catch (e) {
          renderNarrative(`<div><b>Rejoindre impossible</b></div><div>${escapeHtml(e?.data?.message || e?.data?.error || "Code invalide/plein.")}</div>`);
        }
      }

      async function launchPvpCombat() {
        if (!inRoom || !roomCode) return;
        if (pendingStartRequest) return;
        try {
          pendingStartRequest = true;
          const out = await pvpApi.start(roomCode);
          const startsInSec = Math.max(0, Math.ceil(Number(out?.startsInMs || 0) / 1000));
          renderNarrative(`<div><b>Lancement confirme.</b></div><div>Debut synchronise dans ${startsInSec}s...</div>`);
          await refreshRoomStatus();
        } catch (e) {
          pendingStartRequest = false;
          renderNarrative(`<div><b>Lancement impossible</b></div><div>${escapeHtml(e?.data?.message || e?.data?.error || "Les 2 joueurs doivent etre proches du pin.")}</div>`);
        }
      }

      async function toggleReady() {
        if (!inRoom || !roomCode) return;
        try {
          const st = await pvpApi.status(roomCode);
          await pvpApi.ready(roomCode, !st?.selfReady);
          await refreshRoomStatus();
        } catch (e) {
          renderNarrative(`<div><b>Statut pret impossible</b></div><div>${escapeHtml(e?.data?.message || e?.data?.error || "Erreur reseau.")}</div>`);
        }
      }

      if (createBtn) createBtn.onclick = () => { void createRoom(); };
      if (refreshRoomsBtn) refreshRoomsBtn.onclick = () => { void refreshRoomsList(); };
      if (readyBtn) readyBtn.onclick = () => { void toggleReady(); };
      if (launchBtn) launchBtn.onclick = () => { void launchPvpCombat(); };
      if (cancelBtn) {
        cancelBtn.onclick = () => {
          const code = roomCode;
          stopPvpPolling();
          if (keyHandlerAttached) {
            document.removeEventListener("keydown", onPvpKeyDown);
            keyHandlerAttached = false;
          }
          roomCode = "";
          inRoom = false;
          hasStarted = false;
          if (code) void pvpApi.leave(code).catch(() => {});
          modal.close();
        };
      }

      document.addEventListener("keydown", onPvpKeyDown);
      keyHandlerAttached = true;
      void refreshRoomsList();
      pvpPollingTimer = window.setInterval(() => { void refreshRoomStatus(); }, 1000);
      return;
    }

    modal.open(pin.name, `
      <div class="card">
        <div><b>${escapeHtml(pin.name)}</b></div>
        <div class="small">Type: ${escapeHtml(pin.kind || "?")}</div>
        <div style="height:10px"></div>
        <div class="small">(Pas d'action definie.)</div>
      </div>
    `);
  }

  return { open };
}
