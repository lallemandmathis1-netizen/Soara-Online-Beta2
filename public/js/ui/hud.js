import { escapeHtml } from "../utils/escapeHtml.js";

export function mountHud(dom, { onOpenPlayer, onOpenReputation, onOpenTech, onOpenHistory, onOpenInventory, onOpenSettings, onToggleMapMode, isMapModeEnabled }){
  function show(){ dom.hudTop.style.display = "grid"; }
  function hide(){ dom.hudTop.style.display = "none"; }

  function setBox(el, label, value){
    el.innerHTML = `<span class="label">${escapeHtml(label)}</span><span class="value">${escapeHtml(value)}</span>`;
  }

  function render(state){
    setBox(dom.hudName, "Nom", (state.name || state.username || "Joueur"));
    const px = Number(state?.pos?.x);
    const py = Number(state?.pos?.y);
    const posLabel = Number.isFinite(px) && Number.isFinite(py)
      ? `X:${(px * 100).toFixed(1)}% Y:${(py * 100).toFixed(1)}%`
      : "Inconnu";
    setBox(dom.hudLocation, "Emplacement", posLabel);
    dom.hudPlayer.innerHTML = `<span class="label">ENTITE</span><span class="value">fiche tactique</span>`;
    if (dom.hudRace) dom.hudRace.style.display = "none";
    if (dom.hudHP) dom.hudHP.style.display = "none";
    if (dom.hudReputation) dom.hudReputation.style.display = "none";

    const learned = state.learnedTechniques || [];
    const reflex = state.learnedReflexes || [];
    setBox(dom.hudTech, "Bibliotheque", `${learned.length} techniques / ${reflex.length} reflexes`);

    const hist = state.history || [];
    setBox(dom.hudHistory, "Historique", `${hist.length} entrees`);
    dom.hudInventory.textContent = "Inventaire";

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
  dom.btnMap.onclick = () => {
    const next = !isMapModeEnabled?.();
    onToggleMapMode?.(next);
    dom.btnMap.textContent = next ? "CARTE ON" : "CARTE OFF";
    dom.btnMap.classList.toggle("btnPressed", next);
  };

  dom.btnMap.textContent = isMapModeEnabled?.() ? "CARTE ON" : "CARTE OFF";
  dom.btnMap.classList.toggle("btnPressed", !!isMapModeEnabled?.());

  return { show, hide, render };
}
