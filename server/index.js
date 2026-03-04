const express = require("express");
const path = require("path");
const { CONFIG } = require("./config");
const { createDb } = require("./db");
const { mountAuthRoutes } = require("./routes/auth");
const { mountStateRoutes } = require("./routes/state");
const { mountPvpRoutes } = require("./routes/pvp");
const { mountMultiRoutes } = require("./routes/multi");

const app = express();
app.use(express.json());

if (!CONFIG.BETA_PUBLIC) {
  app.use((req, res) => {
    if (req.path.startsWith("/api/")) {
      return res.status(503).json({ error: "beta_closed", message: "SOARA BETA acces ferme" });
    }
    return res.status(503).send(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>SOARA BETA</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui;background:#f6f2e8;color:#374151;display:grid;min-height:100vh;place-items:center}main{border:1px solid #9ca3af;background:#fff;padding:20px 24px;font-weight:700}</style></head><body><main>SOARA BETA acces ferme</main></body></html>`);
  });
}

const db = createDb(CONFIG.DB_PATH);

// routes
const { defaultState } = mountAuthRoutes(app, { db, config: CONFIG });
mountStateRoutes(app, { db, config: CONFIG, defaultState });
mountPvpRoutes(app, { db, config: CONFIG });
mountMultiRoutes(app, { db, config: CONFIG });

// static
app.use(express.static(CONFIG.PUBLIC_DIR));
app.get(["/", "/login", "/combat", "/carte"], (req, res) => {
  res.sendFile(path.join(CONFIG.PUBLIC_DIR, "index.html"));
});

// simple error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "server_error" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SOARA server running on port ${PORT}`);
});
