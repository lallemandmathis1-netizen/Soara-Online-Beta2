export function createVisitedOverlay() {
  let enabled = false;
  let pixi = null;
  let mapView = null;
  let fog = null;

  const GRID_COLS = 72;

  function enable(v) {
    enabled = (v === true);
    if (fog) fog.visible = enabled;
  }

  function attach({ pixi: pixiRoot, mapView: mv } = {}) {
    pixi = pixiRoot || null;
    mapView = mv || null;
    const ctx = pixi?.tryGet?.();
    const world = mapView?.world || null;
    const map = mapView?.mapSprite || null;
    if (!ctx || !world || !map) return;
    if (fog && fog.parent === world) return;

    fog = new ctx.PIXI.Graphics();
    fog.eventMode = "none";
    fog.visible = enabled;
    world.addChildAt(fog, 1);
  }

  function detach() {
    if (fog?.parent) fog.parent.removeChild(fog);
    fog?.destroy?.();
    fog = null;
  }

  function update({ playerPos = null, exploredPoints = [], revealRadiusNorm = 0.12 } = {}) {
    if (!enabled || !fog || !mapView?.mapSprite) {
      if (fog) fog.visible = false;
      return;
    }
    fog.visible = true;
    fog.clear();

    const map = mapView.mapSprite;
    const w = Number(map.width || 0);
    const h = Number(map.height || 0);
    if (w <= 0 || h <= 0) return;

    const cols = Math.max(24, GRID_COLS);
    const rows = Math.max(24, Math.round(cols * (h / w)));
    const cellW = w / cols;
    const cellH = h / rows;

    const current = (
      playerPos && Number.isFinite(Number(playerPos.x)) && Number.isFinite(Number(playerPos.y))
    ) ? { x: Number(playerPos.x), y: Number(playerPos.y) } : null;

    const explored = [];
    for (const p of (Array.isArray(exploredPoints) ? exploredPoints : [])) {
      const x = Number(p?.x);
      const y = Number(p?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      explored.push({ x, y });
    }

    const r = Math.max(0.02, Number(revealRadiusNorm || 0.12));
    const r2 = r * r;

    function inRadius(point, x, y) {
      const dx = x - point.x;
      const dy = y - point.y;
      return (dx * dx + dy * dy) <= r2;
    }

    for (let ry = 0; ry < rows; ry += 1) {
      for (let cx = 0; cx < cols; cx += 1) {
        const nx = (cx + 0.5) / cols;
        const ny = (ry + 0.5) / rows;

        // Etat 1: carte actuelle (aucun filtre)
        if (current && inRadius(current, nx, ny)) {
          continue;
        }

        // Etat 2: carte decouverte (gris translucide)
        let discovered = false;
        for (const p of explored) {
          if (inRadius(p, nx, ny)) {
            discovered = true;
            break;
          }
        }

        const x = cx * cellW;
        const y = ry * cellH;

        if (discovered) {
          fog.beginFill(0x6b7280, 0.5);
          fog.drawRect(x, y, cellW, cellH);
          fog.endFill();
        } else {
          // Etat 3: non decouverte (gris opaque)
          fog.beginFill(0x6b7280, 1);
          fog.drawRect(x, y, cellW, cellH);
          fog.endFill();
        }
      }
    }
  }

  return {
    enable,
    attach,
    detach,
    update,
    get enabled() { return enabled; }
  };
}
