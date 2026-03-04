const path = require("path");

const isProd = process.env.NODE_ENV === "production";
const envSecret = process.env.SOARA_SECRET;

if (isProd && !envSecret) {
  throw new Error("SOARA_SECRET is required in production.");
}

const CONFIG = {
  PORT: process.env.PORT || 3000,
  BETA_PUBLIC: String(process.env.BETA_PUBLIC ?? "true").toLowerCase() === "true",
  JWT_SECRET: envSecret || "soara_secret_dev",
  DB_PATH: path.join(__dirname, "db.json"),
  PUBLIC_DIR: path.join(__dirname, "..", "public"),
};

module.exports = { CONFIG };
