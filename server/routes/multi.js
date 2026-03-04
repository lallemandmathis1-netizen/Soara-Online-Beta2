const { authMiddleware } = require("../auth");

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

function ensurePresence(dbData) {
  if (!dbData.presence || typeof dbData.presence !== "object" || Array.isArray(dbData.presence)) {
    dbData.presence = {};
  }
  return dbData.presence;
}

function sanitizePos(inputPos) {
  if (!inputPos || typeof inputPos !== "object") return null;
  const x = clamp01(inputPos.x);
  const y = clamp01(inputPos.y);
  if (x == null || y == null) return null;
  return { x, y };
}

function mountMultiRoutes(app, { db, config }) {
  const auth = authMiddleware({ secret: config.JWT_SECRET });

  app.post("/api/multi/heartbeat", auth, async (req, res) => {
    const pos = sanitizePos(req.body?.pos);
    await db.update((dbData) => {
      const user = db.getUser(dbData, req.username);
      if (!user) return;
      const presence = ensurePresence(dbData);
      presence[req.username] = Date.now();
      if (pos) {
        if (!user.state || typeof user.state !== "object") user.state = {};
        user.state.pos = pos;
      }
    });
    return res.json({ ok: true });
  });

  app.get("/api/multi/players", auth, (req, res) => {
    const dbData = db.read();
    const presence = ensurePresence(dbData);
    const now = Date.now();
    const ONLINE_WINDOW_MS = 15000;
    const out = [];
    for (const user of dbData.users || []) {
      if (!user || !user.username) continue;
      const ts = Number(presence[user.username] || 0);
      if (!Number.isFinite(ts) || now - ts > ONLINE_WINDOW_MS) continue;
      out.push({
        username: user.username,
        name: user.state?.name || "",
        pos: user.state?.pos || null
      });
    }
    return res.json({ players: out, now });
  });
}

module.exports = { mountMultiRoutes };

