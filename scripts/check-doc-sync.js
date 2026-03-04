const fs = require("fs");
const path = require("path");

function readText(relPath) {
  const fullPath = path.join(__dirname, "..", relPath);
  return fs.readFileSync(fullPath, "utf-8").replace(/^\uFEFF/, "");
}

const checks = [];

function addCheck(name, pass, details) {
  checks.push({ name, pass: !!pass, details: details || "" });
}

function includesAll(text, patterns) {
  return patterns.every((p) => text.includes(p));
}

function includesNone(text, patterns) {
  return patterns.every((p) => !text.includes(p));
}

const runtimeRef = readText("docs/runtime_reference_beta2.md");
const sysRef = readText("docs/systeme_resolution.md");
const readme = readText("README.md");
const appJs = readText("public/js/app.js");
const combatEngine = readText("public/js/features/combatEngine.js");
const combatScreen = readText("public/js/features/combatScreen.js");
const resolutionSandbox = readText("public/js/features/resolutionSandbox.js");

// 1) Docs truth markers.
addCheck(
  "docs/runtime_reference contains no-dice and initiative-only markers",
  includesAll(runtimeRef, [
    "Aucun de",
    "Seule l'initiative utilise un tirage",
    "min(attaque entrante, 2xATK du pareur)",
    "SOARA_V6_Table_Symboles.docx"
  ]),
  "Expected core runtime truth markers are missing in docs/runtime_reference_beta2.md"
);

addCheck(
  "docs/systeme_resolution contains no-dice and initiative-only markers",
  includesAll(sysRef, [
    "aucun de en resolution",
    "Seule l'initiative utilise un tirage",
    "min(attaque entrante, 2xATK du pareur)"
  ]),
  "Expected rules are missing in docs/systeme_resolution.md"
);

addCheck(
  "README contains no-dice and initiative-only markers",
  includesAll(readme, [
    "Aucun de en resolution",
    "Seule l'initiative conserve un tirage"
  ]),
  "README must state the same runtime rule set"
);

// 2) Runtime/code truth markers.
addCheck(
  "combatEngine initiative uses random roll",
  includesAll(combatEngine, ["Math.random()", "function nextInitiative()"]),
  "combatEngine initiative should use random roll"
);

addCheck(
  "combatEngine parry formula uses min(incoming, 2xATK)",
  includesAll(combatEngine, [
    "Parry deterministic rule",
    "min(incoming attack power, 2xATK of parrying entity)"
  ]),
  "combatEngine parry formula marker mismatch"
);

addCheck(
  "resolutionSandbox has no legacy fallback table for symbol factors",
  includesNone(resolutionSandbox, ["const fallback = {"]),
  "resolutionSandbox should read symbol factors from symbolsV6 only"
);

addCheck(
  "combatScreen uses random roll helper name",
  includesAll(combatScreen, [
    "function randomRollInRange(min, max)",
    "return randomRollInRange(1, 20);"
  ]),
  "combatScreen initiative random helper mismatch"
);

// 3) In-app docs alignment (prevent old formula drift).
addCheck(
  "app.js does not contain obsolete parry formula",
  includesNone(appJs, ["ATK + DEF du pareur"]),
  "Obsolete parry formula still present in app.js"
);

addCheck(
  "app.js contains current parry formula",
  includesAll(appJs, ["min(attaque entrante, 2xATK du pareur)"]),
  "Current parry formula missing in app.js"
);

// 4) Legacy compat exports should not exist.
addCheck(
  "combatEngine has no legacy compat exports",
  includesNone(combatEngine, [
    "export function playSymbol(",
    "export function maybeFinishTechnique(",
    "export function resolvePair("
  ]),
  "Legacy compat exports must stay removed"
);

let hasFail = false;
for (const c of checks) {
  if (c.pass) {
    console.log(`OK: ${c.name}`);
  } else {
    hasFail = true;
    console.error(`FAIL: ${c.name}`);
    if (c.details) console.error(`  ${c.details}`);
  }
}

if (hasFail) {
  console.error("Doc/code sync checks failed.");
  process.exit(1);
}

console.log("Doc/code sync checks passed.");
