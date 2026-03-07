export function createDataService({ basePath = "/data" } = {}){
  const cache = new Map();

  async function loadJson(rel){
    const url = `${basePath}/${rel}`;
    if (cache.has(url)) return cache.get(url);
    const p = fetch(url).then(async (r) => {
      if (!r.ok) throw new Error(`http_${r.status}_${url}`);
      return r.json();
    }).catch((err) => {
      cache.delete(url);
      throw err;
    });
    cache.set(url, p);
    return p;
  }

  async function loadAll(){
    const [
      config,
      pins,
      c01,
      loreCanon,
      loreGameplay,
      loreC01,
      loreFactions,
      loreTone,
      patchNotes,
      entitySheets,
      baseTechniques,
      advancedTechniques,
      expertTechniques,
      reflexesData
    ] = await Promise.all([
      loadJson("config.json"),
      loadJson("pins.json"),
      loadJson("campaigns/c-01.json"),
      loadJson("lore_canon_v2.json"),
      loadJson("lore_to_gameplay.json"),
      loadJson("campaign_c01_flow.json"),
      loadJson("factions_matrix.json"),
      loadJson("tone_guide.json"),
      loadJson("patch_notes.json"),
      loadJson("entities/fiches_entites.json"),
      loadJson("techniques/base.json"),
      loadJson("techniques/advanced.json"),
      loadJson("techniques/expert.json"),
      loadJson("techniques/reflexes.json"),
    ]);

    const techniques = {
      base: Array.isArray(baseTechniques?.items) ? baseTechniques.items : [],
      advanced: Array.isArray(advancedTechniques?.items) ? advancedTechniques.items : [],
      expert: Array.isArray(expertTechniques?.items) ? expertTechniques.items : [],
    };

    const lore = {
      canon: loreCanon || null,
      gameplay: loreGameplay || null,
      campaign: loreC01 || null,
      factions: loreFactions || null,
      tone: loreTone || null
    };

    return {
      config,
      pins: pins.pins || [],
      campaigns: { "c-01": c01 },
      techniques,
      reflexes: Array.isArray(reflexesData?.items) ? reflexesData.items : [],
      lore,
      patchNotes: Array.isArray(patchNotes?.items) ? patchNotes.items : [],
      entitySheets: Array.isArray(entitySheets?.items) ? entitySheets.items : []
    };
  }

  return { loadAll };
}
