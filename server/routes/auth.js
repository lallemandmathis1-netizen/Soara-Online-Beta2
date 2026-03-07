const bcrypt = require("bcryptjs");
const { signToken, authMiddleware } = require("../auth");

function normalizeUsername(value) {
  return String(value || "").trim();
}

function isValidUsername(username) {
  if (username.length < 3 || username.length > 24) return false;
  return /^[A-Za-z0-9 _.-]+$/.test(username);
}

function defaultState(username){
  return {
    username,
    name: "",
    race: "",
    age: null,
    faction: "",
    // Combat / progression
    hpMax: 10,
    hp: 10,
    reputation: {
      bazeides: 0,
      federation: 0,
      roor: 0,
      gobelins: 0
    },
    money: 0,
    pos: { x: 0.5, y: 0.58 },
    // Techniques apprises (ids)
    techSlots: { base: 3, advanced: 0, expert: 0 },
    reflexSlots: 1,
    learnedReflexes: ["r_base_001"],
    learnedTechniques: ["base_punch", "base_guard", "base_wait"],
    techSlotsTotal: 10,
    techniquesBySlot: ["base_punch", "base_guard", "base_wait", null, null, null, null, null, null, null],
    hasStarterKitV2: true,
    starterRacePackV1: "",
    pinOverrides: {},
    discoveredPins: ["C"],
    exploredPoints: [{ x: 0.5, y: 0.58 }],
    // Journal / historique (affichage)
    history: [],
    notebook: "",
    // progression campagne
    campaign: { "c-01": { node: "n0", completed: false } },
    tagsProfil: { prudence: 0, agressivite: 0, tempo: 0 },
    reputationLocale: 0,
    historiqueC01: [],
    // inventaire (9 slots) + 1 accessoire/armure plus tard
    inventory: Array(9).fill(null),
  };
}


function mountAuthRoutes(app, { db, config }){
  app.post("/api/register", async (req, res) => {
    try {
      const { username, password } = req.body || {};
      const normalizedUsername = normalizeUsername(username);
      if (!normalizedUsername){
        return res.status(400).json({ error: "username_required", message: "Pseudo manquant." });
      }
      if (!isValidUsername(normalizedUsername)) {
        return res.status(400).json({
          error: "invalid_username",
          message: "Pseudo invalide (3-24, lettres/chiffres/espace/._-)."
        });
      }
      if (typeof password !== "string" || !password){
        return res.status(400).json({ error: "password_required", message: "Mot de passe manquant." });
      }
      if (String(password).length < 6){
        return res.status(400).json({ error: "password_too_short", message: "Mot de passe trop court (min 6)." });
      }

      const hash = await bcrypt.hash(password, 10);
      await db.update((dbData) => {
        if (db.getUser(dbData, normalizedUsername)){
          const err = new Error("exists");
          err.code = "exists";
          throw err;
        }
        dbData.users.push({ username: normalizedUsername, password: hash, state: defaultState(normalizedUsername) });
      });
      console.log(`[auth] new account: ${normalizedUsername}`);
    } catch (e) {
      if (e && e.code === "exists") {
        return res.status(400).json({ error: "exists", message: "Pseudo deja utilise." });
      }
      console.error("[auth] register error:", e);
      return res.status(500).json({ error: "server_error", message: "Erreur interne." });
    }

    return res.json({ ok: true });
  });

  app.post("/api/login", async (req, res) => {
    try {
      const { username, password } = req.body || {};
      const normalizedUsername = normalizeUsername(username);
      console.log(`[auth] login attempt: ${normalizedUsername || "<empty>"}`);
      if (!normalizedUsername) {
        return res.status(400).json({ error: "username_required", message: "Pseudo manquant." });
      }
      if (typeof password !== "string" || !password) {
        return res.status(400).json({ error: "password_required", message: "Mot de passe manquant." });
      }
      const dbData = db.read();
      const user = db.getUser(dbData, normalizedUsername);
      if (!user) return res.status(401).json({ error: "bad_login", message: "Pseudo ou mot de passe invalide." });

      const ok = await bcrypt.compare(password, user.password);
      if (!ok) return res.status(401).json({ error: "bad_login", message: "Pseudo ou mot de passe invalide." });

      const token = signToken({ username: user.username, secret: config.JWT_SECRET });
      return res.json({ token });
    } catch (e) {
      console.error("[auth] login error:", e);
      return res.status(500).json({ error: "server_error", message: "Erreur interne." });
    }
  });

  const auth = authMiddleware({ secret: config.JWT_SECRET });

  app.get("/api/me", auth, (req, res) => {
    return res.json({ username: req.username });
  });

  return { defaultState };
}

module.exports = { mountAuthRoutes };
