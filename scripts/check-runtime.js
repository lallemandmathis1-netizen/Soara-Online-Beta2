const fs = require("fs");
const path = require("path");

function readJson(relPath) {
  const filePath = path.join(__dirname, "..", relPath);
  const raw = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function fail(msg) {
  console.error("FAIL:", msg);
  process.exitCode = 1;
}

function ok(msg) {
  console.log("OK:", msg);
}

const base = readJson("public/data/techniques/base.json");
const advanced = readJson("public/data/techniques/advanced.json");
const expert = readJson("public/data/techniques/expert.json");
const reflexes = readJson("public/data/techniques/reflexes.json");
const campaign = readJson("public/data/campaigns/c-01.json");

const all = [
  ...(Array.isArray(base.items) ? base.items : []),
  ...(Array.isArray(advanced.items) ? advanced.items : []),
  ...(Array.isArray(expert.items) ? expert.items : []),
  ...(Array.isArray(reflexes.items) ? reflexes.items : [])
];

const byId = new Map();
for (const tech of all) {
  const id = String(tech?.id || "").trim();
  if (!id) {
    fail("Technique sans id.");
    continue;
  }
  if (byId.has(id)) fail(`ID duplique: ${id}`);
  byId.set(id, tech);
}

function getSymbols(tech) {
  return Array.isArray(tech?.symbols)
    ? tech.symbols
    : (Array.isArray(tech?.seq) ? tech.seq : []);
}

const lengths = {
  base: Array.isArray(base.items) ? base.items.length : 0,
  advanced: Array.isArray(advanced.items) ? advanced.items.length : 0,
  expert: Array.isArray(expert.items) ? expert.items.length : 0,
  reflexes: Array.isArray(reflexes.items) ? reflexes.items.length : 0
};
ok(`Catalogue runtime: base=${lengths.base}, advanced=${lengths.advanced}, expert=${lengths.expert}, reflexes=${lengths.reflexes}`);

const bySeq = new Map();
for (const tech of all) {
  const seq = getSymbols(tech).map((s) => String(s)).join("|");
  if (!seq) continue;
  if (!bySeq.has(seq)) bySeq.set(seq, []);
  bySeq.get(seq).push(String(tech?.id || "?"));
}
for (const [seq, ids] of bySeq.entries()) {
  if (ids.length > 1) fail(`Sequence dupliquee: ${seq} -> ${ids.join(", ")}`);
}
ok("Catalogue: sequences uniques validees.");

for (const tech of all) {
  const counts = new Map();
  for (const sym of getSymbols(tech)) {
    const key = String(sym);
    counts.set(key, Number(counts.get(key) || 0) + 1);
  }
  for (const [sym, n] of counts.entries()) {
    if (n >= 3) fail(`Technique invalide (symbole repete >=3): ${tech?.id || "?"} -> ${sym} x${n}`);
  }
}
ok("Catalogue: aucun symbole repete 3 fois dans une meme technique.");

for (const ref of Array.isArray(reflexes.items) ? reflexes.items : []) {
  const symbols = Array.isArray(ref?.symbols)
    ? ref.symbols
    : (Array.isArray(ref?.seq) ? ref.seq : []);
  if (symbols.length !== 2) fail(`Reflexe invalide (2 symboles requis): ${ref?.id || "?"}`);
}
ok("Reflexes: longueur validee (2 symboles).");

const nodes = campaign?.nodes && typeof campaign.nodes === "object" ? campaign.nodes : {};
for (const [nodeId, node] of Object.entries(nodes)) {
  for (const choice of Array.isArray(node?.choices) ? node.choices : []) {
    const next = String(choice?.next || "").trim();
    if (next && next !== "end" && !Object.prototype.hasOwnProperty.call(nodes, next)) {
      fail(`Campagne C-01: next introuvable ${nodeId} -> ${next}`);
    }
  }
}
ok("Campagne C-01: references next valides.");

if (process.exitCode === 1) {
  console.error("Runtime checks finished with errors.");
} else {
  console.log("Runtime checks passed.");
}
