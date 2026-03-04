export const screenFrame = document.getElementById("screenFrame");

export function getInventoryDomRefs(){
  const invSlots = Array.from({ length: 9 }, (_, i) => document.getElementById(`inv${i}`) || null);
  const eqSlots = Array.from({ length: 4 }, (_, i) => document.getElementById(`eq${i}`) || null);
  const refs = { invSlots, eqSlots };
  for (let i = 0; i < 9; i += 1) refs[`inv${i}`] = invSlots[i] || null;
  for (let i = 0; i < 4; i += 1) refs[`eq${i}`] = eqSlots[i] || null;
  if (!invSlots[0]) console.warn("[dom] inventory panel requested but inv0..inv8 are not mounted.");
  return refs;
}

export function getDomRefs(){
  const required = {
    canvasWrap: document.getElementById("canvasWrap"),
    screenFrame: document.getElementById("screenFrame"),

    authGate: document.getElementById("authGate"),
    authUser: document.getElementById("authUser"),
    authPass: document.getElementById("authPass"),
    btnLogin: document.getElementById("btnLogin"),
    btnRegister: document.getElementById("btnRegister"),
    authMsg: document.getElementById("authMsg"),

    hudTop: document.getElementById("hudTop"),
    hudMap: document.getElementById("hudMap"),
    hudName: document.getElementById("hudName"),
    hudLocation: document.getElementById("hudLocation"),
    hudPlayer: document.getElementById("hudPlayer"),
    hudRace: document.getElementById("hudRace"),
    hudHP: document.getElementById("hudHP"),
    hudReputation: document.getElementById("hudReputation"),
    hudTech: document.getElementById("hudTech"),
    hudHistory: document.getElementById("hudHistory"),
    hudInventory: document.getElementById("hudInventory"),
    btnSettings: document.getElementById("btnSettings"),
    btnMap: document.getElementById("btnMap"),

    modalBackdrop: document.getElementById("modalBackdrop"),
    modal: document.getElementById("modal"),
    modalTitle: document.getElementById("modalTitle"),
    modalBody: document.getElementById("modalBody"),
    btnClose: document.getElementById("btnClose"),
  };

  for (const [k,v] of Object.entries(required)){
    if (!v) throw new Error("missing_dom:" + k);
  }

  const refs = { ...required };
  // Inventory slots are mounted lazily in modal; resolve them with getInventoryDomRefs().
  refs.invSlots = Array.from({ length: 9 }, () => null);
  refs.eqSlots = Array.from({ length: 4 }, () => null);
  for (let i = 0; i < 9; i += 1) refs[`inv${i}`] = null;
  for (let i = 0; i < 4; i += 1) refs[`eq${i}`] = null;
  return refs;
}
