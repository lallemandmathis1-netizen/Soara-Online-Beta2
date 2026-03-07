import { escapeHtml } from "../utils/escapeHtml.js";

export function mountHud(dom, { onOpenPlayer, onOpenReputation, onOpenTech, onOpenHistory, onOpenInventory, onOpenSettings, onToggleMapMode, isMapModeEnabled }){
  function show(){ dom.hudTop.style.display = "grid"; }
  function hide(){ dom.hudTop.style.display = "none"; }

  function setBox(el, label, value){
    el.innerHTML = `<span class="label">${escapeHtml(label)}</span><span class="value">${escapeHtml(value)}</span>`;
  }

  function render(state){
    if (dom.hudName) dom.hudName.style.display = "none";
    if (dom.hudLocation) dom.hudLocation.style.display = "none";
    dom.hudPlayer.textContent = "\u{1F464}";
    dom.hudPlayer.title = "Personnage";
    if (dom.hudRace) dom.hudRace.style.display = "none";
    if (dom.hudHP) dom.hudHP.style.display = "none";
    if (dom.hudReputation) dom.hudReputation.style.display = "none";

    dom.hudTech.textContent = "\u{1F4DA}";
    dom.hudTech.title = "Bibliotheque";
    dom.hudHistory.textContent = "\u{1F4DC}";
    dom.hudHistory.title = "Historique";
    dom.hudInventory.textContent = "\u{1F392}";
    dom.hudInventory.title = "Inventaire";

    dom.hudPlayer.classList.add("clickable");
    dom.hudTech.classList.add("clickable");
    dom.hudHistory.classList.add("clickable");
    dom.hudInventory.classList.add("clickable");
  }

  dom.hudPlayer.onclick = () => onOpenPlayer?.();
  dom.hudReputation.onclick = () => onOpenReputation?.();
  dom.hudTech.onclick = () => onOpenTech?.();
  dom.hudHistory.onclick = () => onOpenHistory?.();
  dom.hudInventory.onclick = () => onOpenInventory?.();
  dom.btnSettings.onclick = () => onOpenSettings?.();
  if (dom.btnMap) {
    dom.btnMap.onclick = () => {
      const next = !isMapModeEnabled?.();
      onToggleMapMode?.(next);
      dom.btnMap.textContent = next ? "CARTE ON" : "CARTE OFF";
      dom.btnMap.classList.toggle("btnPressed", next);
    };
  }

  if (dom.btnMap) {
    dom.btnMap.textContent = isMapModeEnabled?.() ? "CARTE ON" : "CARTE OFF";
    dom.btnMap.classList.toggle("btnPressed", !!isMapModeEnabled?.());
  }

  return { show, hide, render };
}
