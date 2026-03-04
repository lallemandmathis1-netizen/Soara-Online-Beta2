const fs = require("fs");
const path = require("path");

const dbPath = path.join(__dirname, "..", "server", "db.json");
const emptyDb = {
  users: [],
  pvpRooms: {}
};

fs.writeFileSync(dbPath, JSON.stringify(emptyDb, null, 2), "utf-8");
console.log("DB reset complete:", dbPath);
