import { formatToken, tokenMultiplier } from "./tokenModel.js";

export function createLogState(entityNames = []) {
  const order = [];
  const orderSet = new Set();
  const entities = new Map();

  function addToOrder(name) {
    if (orderSet.has(name)) return;
    orderSet.add(name);
    order.push(name);
  }

  for (const n of entityNames) addToOrder(n);

  function ensure(name) {
    if (!entities.has(name)) {
      entities.set(name, { events: [] });
      addToOrder(name);
    }
    return entities.get(name);
  }

  function onSymbol(name, {
    prefixes = [],
    sym = "",
    doubled = false,
    multiplier = 0,
    suffixes = [],
    techStart = false,
    techEnd = false,
    techType = "normal"
  }) {
    const ent = ensure(name);
    ent.events.push({
      techStart: !!techStart,
      techEnd: !!techEnd,
      techType: techType === "reflex" ? "reflex" : "normal",
      token: {
        prefixes: Array.isArray(prefixes) ? prefixes : [],
        sym,
        suffixes: Array.isArray(suffixes) ? suffixes : [],
        doubled: !!doubled,
        multiplier: Number(multiplier || 0) || 0
      }
    });
  }

  function toLines() {
    const seen = new Set();
    const lines = [];
    for (const name of order) {
      if (seen.has(name)) continue;
      seen.add(name);
      const ent = ensure(name);
      lines.push(`${name} : ${renderEvents(ent.events)}`);
    }
    return lines;
  }

  function renderEvents(events) {
    if (!events?.length) return "-";
    let out = "";
    let techOpen = false;
    let techCloseChar = ")";
    let techOpenType = "normal";
    let airOpen = false;

    for (const ev of events) {
      const token = ev?.token || null;
      if (!token?.sym) continue;

      if (ev.techStart) {
        if (airOpen) {
          out += "}";
          airOpen = false;
        }
        if (techOpen) out += techCloseChar;
        if (ev.techType === "reflex") {
          out += "[";
          techCloseChar = "]";
          techOpenType = "reflex";
        } else {
          out += "(";
          techCloseChar = ")";
          techOpenType = "normal";
        }
        techOpen = true;
      }

      let mult = tokenMultiplier(token);
      if (techOpenType === "reflex" && mult >= 3) mult = 1;
      if (mult >= 3 && !airOpen) {
        out += "{";
        airOpen = true;
      } else if (mult < 3 && airOpen) {
        out += "}";
        airOpen = false;
      }

      out += formatToken({ ...token, doubled: false, multiplier: 1 });

      if (ev.techEnd) {
        if (airOpen) {
          out += "}";
          airOpen = false;
        }
        if (techOpen) {
          out += techCloseChar;
          techOpen = false;
        }
      }
    }

    if (airOpen) out += "}";
    if (techOpen) out += techCloseChar;
    return out || "-";
  }

  function getTokens(name) {
    return [...ensure(name).events];
  }

  return {
    onSymbol,
    toLines,
    getTokens
  };
}
