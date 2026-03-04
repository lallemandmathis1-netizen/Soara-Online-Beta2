export function createCampaignRunner({ modal, stateSvc, onStateChanged, openCombatScreen, onApplyLoadout }){
  let ctx = null; // { campaign, userState }

  function ensureCampaignState(userState, campaignId, startNode){
    if (!userState.campaign) userState.campaign = {};
    if (!userState.campaign[campaignId]) userState.campaign[campaignId] = { node: startNode, completed: false };
    if (!userState.campaign[campaignId].node) userState.campaign[campaignId].node = startNode;
  }

  async function applyPatch(userState, patch){
    // local merge
    Object.assign(userState, patch);
    if (patch.campaign){
      userState.campaign = { ...(userState.campaign || {}), ...patch.campaign };
    }
    await stateSvc.patchState(patch);
    onStateChanged?.(userState);
  }

  function applyGrantLoadout(userState, grantLoadout){
    const grant = grantLoadout && typeof grantLoadout === "object" ? grantLoadout : {};
    const baseTechs = Array.isArray(grant.techniques)
      ? grant.techniques.filter((x) => typeof x === "string" && x.trim())
      : [];
    const reflexId = typeof grant.reflex === "string" && grant.reflex.trim() ? grant.reflex : null;
    const grantedTechniques = reflexId ? [...baseTechs, reflexId] : [...baseTechs];
    const techSlotsTotal = Math.max(4, Number(userState?.techSlotsTotal || 10) || 10);
    const previousLearned = Array.isArray(userState?.learnedTechniques) ? userState.learnedTechniques : [];
    const learnedTechniques = [...new Set([...previousLearned, ...grantedTechniques])];
    const slots = Array.isArray(userState?.techniquesBySlot)
      ? [...userState.techniquesBySlot]
      : Array.from({ length: techSlotsTotal }, () => null);
    while (slots.length < techSlotsTotal) slots.push(null);
    const starterSlots = [...baseTechs, reflexId].filter(Boolean).slice(0, techSlotsTotal);
    for (let i = 0; i < starterSlots.length; i += 1) slots[i] = starterSlots[i];

    const previousReflexes = Array.isArray(userState?.learnedReflexes) ? userState.learnedReflexes : [];
    const learnedReflexes = reflexId ? [...new Set([...previousReflexes, reflexId])] : previousReflexes;

    return {
      learnedTechniques,
      techniquesBySlot: slots.slice(0, techSlotsTotal),
      techSlotsTotal,
      learnedReflexes,
      hasStarterKitV2: true
    };
  }

  function start({ campaign, userState }){
    ctx = { campaign, userState };
    ensureCampaignState(userState, campaign.id, campaign.start || "n0");
    render();
  }

  function render(){
    const { campaign, userState } = ctx;
    const prog = userState.campaign[campaign.id];
    const nodeId = prog.node || campaign.start;
    const node = campaign.nodes[nodeId];

    if (!node){
      modal.open(campaign.title, `<div class="small">Erreur: node introuvable (${nodeId}).</div>`);
      return;
    }

    let html = `<div class="card"><div><b>${campaign.title}</b></div><div style="height:10px"></div>`;
    for (const line of (node.text || [])){
      if (line && typeof line === "object") {
        const txt = String(line.text || "");
        const id = line.id ? `<span class="small" style="opacity:.65">[${line.id}]</span> ` : "";
        html += `<div>${id}${txt}</div>`;
      } else {
        html += `<div>${line}</div>`;
      }
    }
    html += `<div style="height:12px"></div>`;

    if (node.input){
      const current = userState[node.input.field] || "";
      html += `<div class="small">${node.input.field}</div>`;
      html += `<input id="camp_input" placeholder="${node.input.placeholder || ""}" value="${escapeHtml(current)}" />`;
      html += `<div style="height:12px"></div>`;
    }

    (node.choices || []).forEach((c, i) => {
      html += `<button class="btn" id="camp_choice_${i}">${c.label}</button>`;
    });

    // fin
    if ((node.choices || []).length === 0){
      html += `<div class="small">—</div>`;
    }

    html += `</div>`;
    modal.open(campaign.title, html);

    (node.choices || []).forEach((c, i) => {
      const el = document.getElementById(`camp_choice_${i}`);
      if (!el) return;
      el.onclick = async () => {
        const patch = {};
        if (node.input){
          const v = (document.getElementById("camp_input")?.value || "").trim();
          if (v) patch[node.input.field] = v;
        }
        let grantedLoadoutPatch = null;
        if (c.effects){
          for (const [k,v] of Object.entries(c.effects)){
            if (k === "grantLoadout") {
              grantedLoadoutPatch = applyGrantLoadout(userState, v);
              continue;
            }
            if (k === "historiqueC01") {
              const previous = Array.isArray(userState?.historiqueC01) ? userState.historiqueC01 : [];
              const nextItems = Array.isArray(v) ? v : (v == null ? [] : [v]);
              patch.historiqueC01 = [...previous, ...nextItems].map((x) => String(x));
              continue;
            }
            if (k === "tagsProfil" && v && typeof v === "object") {
              patch.tagsProfil = { ...(userState?.tagsProfil || {}), ...v };
              continue;
            }
            if (k === "complete") continue;
            patch[k] = v;
          }
        }
        if (grantedLoadoutPatch) Object.assign(patch, grantedLoadoutPatch);

        // campaign progress update
        ensureCampaignState(userState, campaign.id, campaign.start || "n0");
        const nextNode = c.next || nodeId;

        const newProg = { ...userState.campaign[campaign.id], node: nextNode };
        if (c.effects?.complete === true){
          newProg.completed = true;
          newProg.node = "end";
        }
        patch.campaign = { [campaign.id]: newProg };

        await applyPatch(userState, patch);
        if (grantedLoadoutPatch) onApplyLoadout?.(grantedLoadoutPatch);
        render();
      };
    });

  }

  function escapeHtml(s){
    return String(s)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  return { start };
}
