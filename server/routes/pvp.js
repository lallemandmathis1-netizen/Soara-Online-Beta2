const { authMiddleware } = require("../auth");

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

function roomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function ensureRooms(dbData) {
  if (!dbData.pvpRooms || typeof dbData.pvpRooms !== "object" || Array.isArray(dbData.pvpRooms)) {
    dbData.pvpRooms = {};
  }
  return dbData.pvpRooms;
}

function distance(a, b) {
  const dx = Number(a?.x) - Number(b?.x);
  const dy = Number(a?.y) - Number(b?.y);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return Number.POSITIVE_INFINITY;
  return Math.hypot(dx, dy);
}

function isNearPin(userState, pin, maxDist = 0.03) {
  return distance(userState?.pos, pin) <= maxDist;
}

function getNearAndReady(db, dbData, room) {
  const hostUser = db.getUser(dbData, room.host || "");
  const guestUser = room.guest ? db.getUser(dbData, room.guest) : null;
  const pin = { x: Number(room.pinX), y: Number(room.pinY) };
  const hostNearByPresence = room?.near?.host == null ? !!room?.host : !!room.near.host;
  const guestNearByPresence = room?.near?.guest == null ? !!room?.guest : !!room.near.guest;
  const hostNearByPos = !!hostUser && isNearPin(hostUser.state, pin, 0.03);
  const guestNearByPos = !!guestUser && isNearPin(guestUser.state, pin, 0.03);
  const hostNear = hostNearByPresence || hostNearByPos;
  const guestNear = guestNearByPresence || guestNearByPos;
  const hostReady = !!room.ready?.host;
  const guestReady = !!room.ready?.guest;
  const participants = [room.host, room.guest].filter(Boolean);
  const nearCount = (hostNear ? 1 : 0) + (guestNear ? 1 : 0);
  const readyCount = (hostReady ? 1 : 0) + (guestReady ? 1 : 0);
  const canStart = participants.length === 2 && hostNear && guestNear && hostReady && guestReady;
  return { hostNear, guestNear, hostReady, guestReady, participants, nearCount, readyCount, canStart };
}

function purgeStaleRooms(dbData) {
  const rooms = ensureRooms(dbData);
  const now = Date.now();
  for (const [code, room] of Object.entries(rooms)) {
    if (isStaleRoom(room, now)) {
      delete rooms[code];
    }
  }
}

function isStaleRoom(room, now = Date.now()) {
  const ts = Number(room?.updatedAt || room?.createdAt || 0);
  return !Number.isFinite(ts) || now - ts > 1000 * 60 * 30;
}

function roomViewForUser(db, dbData, room, username) {
  const role = room.host === username ? "host" : (room.guest === username ? "guest" : null);
  const now = Date.now();
  const effectiveStatus = room.status === "starting" && Number(room.startAt || 0) <= now
    ? "active"
    : (room.status || "waiting");
  const nr = getNearAndReady(db, dbData, room);
  const meNear = role === "host" ? nr.hostNear : nr.guestNear;
  const meReady = role === "host" ? nr.hostReady : nr.guestReady;
  const oppNear = role === "host" ? nr.guestNear : nr.hostNear;
  const oppReady = role === "host" ? nr.guestReady : nr.hostReady;
  const oppName = role === "host" ? (room.guest || null) : (room.host || null);
  return {
    code: room.code,
    pinId: room.pinId,
    status: effectiveStatus,
    role,
    participantCount: nr.participants.length,
    nearCount: nr.nearCount,
    readyCount: nr.readyCount,
    selfNear: !!meNear,
    selfReady: !!meReady,
    opponentNear: !!oppNear,
    opponentReady: !!oppReady,
    opponentName: oppName,
    canStart: !!nr.canStart,
    started: effectiveStatus === "active",
    startAt: room.startAt || null,
    startsInMs: room.startAt ? Math.max(0, Number(room.startAt) - now) : null,
    startedAt: room.startedAt || null
  };
}

function roomListItem(db, dbData, room) {
  const nr = getNearAndReady(db, dbData, room);
  return {
    code: room.code,
    pinId: room.pinId,
    host: room.host || null,
    guest: room.guest || null,
    status: room.status || "waiting",
    participantCount: nr.participants.length,
    nearCount: nr.nearCount,
    readyCount: nr.readyCount
  };
}

function mountPvpRoutes(app, { db, config }) {
  const auth = authMiddleware({ secret: config.JWT_SECRET });

  app.post("/api/pvp/create", auth, async (req, res) => {
    const pinId = String(req.body?.pinId || "").slice(0, 80) || "pvp_pin";
    const pinX = clamp01(req.body?.pinX);
    const pinY = clamp01(req.body?.pinY);
    if (pinX == null || pinY == null) {
      return res.status(400).json({ error: "invalid_pin", message: "pinX/pinY invalides." });
    }

    const out = await db.update((dbData) => {
      purgeStaleRooms(dbData);
      const rooms = ensureRooms(dbData);
      let code = roomCode();
      for (let i = 0; i < 20 && rooms[code]; i += 1) code = roomCode();
      if (rooms[code]) throw new Error("room_code_collision");

      const now = Date.now();
      rooms[code] = {
        code,
        pinId,
        pinX,
        pinY,
        host: req.username,
        guest: null,
        near: { host: true, guest: false },
        ready: { host: false, guest: false },
        status: "waiting",
        startAt: null,
        createdAt: now,
        updatedAt: now,
        startedAt: null
      };
      return { code };
    });

    return res.json(out);
  });

  app.post("/api/pvp/join", auth, async (req, res) => {
    const code = String(req.body?.code || "").trim().toUpperCase();
    if (!code) return res.status(400).json({ error: "code_required" });

    try {
      await db.update((dbData) => {
        purgeStaleRooms(dbData);
        const room = ensureRooms(dbData)[code];
        if (!room) {
          const err = new Error("room_not_found");
          err.code = "room_not_found";
          throw err;
        }
        if (room.status === "active") {
          const err = new Error("room_active");
          err.code = "room_active";
          throw err;
        }
        if (room.host === req.username || room.guest === req.username) {
          if (!room.near || typeof room.near !== "object") room.near = { host: false, guest: false };
          if (room.host === req.username) room.near.host = true;
          if (room.guest === req.username) room.near.guest = true;
          room.updatedAt = Date.now();
          return;
        }
        if (room.guest && room.guest !== req.username) {
          const err = new Error("room_full");
          err.code = "room_full";
          throw err;
        }
        room.guest = req.username;
        if (!room.near || typeof room.near !== "object") room.near = { host: false, guest: false };
        room.near.guest = true;
        room.ready.guest = false;
        room.status = "waiting";
        room.startAt = null;
        room.updatedAt = Date.now();
      });
      return res.json({ ok: true, code });
    } catch (e) {
      if (e?.code === "room_not_found") return res.status(404).json({ error: "room_not_found" });
      if (e?.code === "room_full") return res.status(409).json({ error: "room_full" });
      if (e?.code === "room_active") return res.status(409).json({ error: "room_active" });
      throw e;
    }
  });

  app.get("/api/pvp/status/:code", auth, (req, res) => {
    const code = String(req.params?.code || "").trim().toUpperCase();
    try {
      const dbData = db.read();
      const room = ensureRooms(dbData)[code];
      if (!room || isStaleRoom(room)) {
        return res.status(404).json({ error: "room_not_found" });
      }
      if (room.host !== req.username && room.guest !== req.username) {
        return res.status(403).json({ error: "forbidden" });
      }
      const view = roomViewForUser(db, dbData, room, req.username);
      return res.json(view);
    } catch (e) {
      if (e?.code === "room_not_found") return res.status(404).json({ error: "room_not_found" });
      if (e?.code === "forbidden") return res.status(403).json({ error: "forbidden" });
      throw e;
    }
  });

  app.get("/api/pvp/rooms", auth, (req, res) => {
    const pinId = String(req.query?.pinId || "").trim();
    const dbData = db.read();
    const rooms = ensureRooms(dbData);
    const list = Object.values(rooms)
      .filter((room) => {
        if (!room || typeof room !== "object") return false;
        if (isStaleRoom(room)) return false;
        if (pinId && String(room.pinId || "") !== pinId) return false;
        if (room.status === "active") return false;
        return true;
      })
      .map((room) => roomListItem(db, dbData, room))
      .sort((a, b) => {
        const sa = a.status === "starting" ? 0 : 1;
        const sb = b.status === "starting" ? 0 : 1;
        if (sa !== sb) return sa - sb;
        return String(a.code).localeCompare(String(b.code));
      });
    return res.json({ rooms: list });
  });

  app.post("/api/pvp/ready", auth, async (req, res) => {
    const code = String(req.body?.code || "").trim().toUpperCase();
    const ready = !!req.body?.ready;
    if (!code) return res.status(400).json({ error: "code_required" });
    try {
      const view = await db.update((dbData) => {
        purgeStaleRooms(dbData);
        const room = ensureRooms(dbData)[code];
        if (!room) {
          const err = new Error("room_not_found");
          err.code = "room_not_found";
          throw err;
        }
        if (room.host !== req.username && room.guest !== req.username) {
          const err = new Error("forbidden");
          err.code = "forbidden";
          throw err;
        }
        if (room.host === req.username) room.ready.host = ready;
        if (room.guest === req.username) room.ready.guest = ready;
        room.status = "waiting";
        room.startAt = null;
        room.updatedAt = Date.now();
        return roomViewForUser(db, dbData, room, req.username);
      });
      return res.json(view);
    } catch (e) {
      if (e?.code === "room_not_found") return res.status(404).json({ error: "room_not_found" });
      if (e?.code === "forbidden") return res.status(403).json({ error: "forbidden" });
      throw e;
    }
  });

  app.post("/api/pvp/start", auth, async (req, res) => {
    const code = String(req.body?.code || "").trim().toUpperCase();
    if (!code) return res.status(400).json({ error: "code_required" });
    try {
      const out = await db.update((dbData) => {
        purgeStaleRooms(dbData);
        const room = ensureRooms(dbData)[code];
        if (!room) {
          const err = new Error("room_not_found");
          err.code = "room_not_found";
          throw err;
        }
        if (room.host !== req.username && room.guest !== req.username) {
          const err = new Error("forbidden");
          err.code = "forbidden";
          throw err;
        }
        const nr = getNearAndReady(db, dbData, room);
        if (!nr.canStart) {
          const err = new Error("not_ready");
          err.code = "not_ready";
          throw err;
        }
        if (room.status !== "starting" && room.status !== "active") {
          room.status = "starting";
          room.startAt = Date.now() + 5000;
          room.updatedAt = Date.now();
          console.log(`[combat] combat start: room=${code} host=${room.host || "-"} guest=${room.guest || "-"}`);
        }
        if (room.status === "starting" && Number(room.startAt || 0) <= Date.now()) {
          room.status = "active";
          room.startedAt = Date.now();
          room.updatedAt = room.startedAt;
        }
        const enemyName = room.host === req.username ? room.guest : room.host;
        return {
          ok: true,
          started: room.status === "active",
          status: room.status,
          startAt: room.startAt || null,
          startsInMs: room.startAt ? Math.max(0, Number(room.startAt) - Date.now()) : null,
          enemyName
        };
      });
      return res.json(out);
    } catch (e) {
      if (e?.code === "room_not_found") return res.status(404).json({ error: "room_not_found" });
      if (e?.code === "forbidden") return res.status(403).json({ error: "forbidden" });
      if (e?.code === "not_ready") return res.status(409).json({ error: "not_ready" });
      throw e;
    }
  });

  app.post("/api/pvp/leave", auth, async (req, res) => {
    const code = String(req.body?.code || "").trim().toUpperCase();
    if (!code) return res.status(400).json({ error: "code_required" });
    await db.update((dbData) => {
      purgeStaleRooms(dbData);
      const rooms = ensureRooms(dbData);
      const room = rooms[code];
      if (!room) return;
      if (room.host === req.username || room.guest === req.username) {
        delete rooms[code];
      }
    });
    return res.json({ ok: true });
  });
}

module.exports = { mountPvpRoutes };
