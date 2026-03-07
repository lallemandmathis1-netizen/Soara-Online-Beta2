export function createMapView({ pixi, mapUrl = "/assets/map.jpg" }){
  const mapUrls = Array.isArray(mapUrl) ? mapUrl : [mapUrl];
  let world = null;
  let mapSprite = null;
  let trailLayer = null;
  let trailPoints = [];
  let playerMarker = null;
  let remoteLayer = null;
  const remoteMarkers = new Map();
  let resolvedMapUrl = null;

  function createPlayerPinMarker(PIXI) {
    const pin = new PIXI.Container();

    const shadow = new PIXI.Graphics();
    shadow.ellipse(0, 18, 8, 4).fill({ color: 0x000000, alpha: 0.22 });
    pin.addChild(shadow);

    const body = new PIXI.Graphics();
    body.circle(0, -8, 11).fill({ color: 0xe11d48 });
    body.stroke({ color: 0x7f1d1d, width: 2, alpha: 0.9 });
    pin.addChild(body);

    const highlight = new PIXI.Graphics();
    highlight.circle(-3, -11, 4).fill({ color: 0xffffff, alpha: 0.45 });
    pin.addChild(highlight);

    const tip = new PIXI.Graphics();
    tip.poly([0, 16, -6, 2, 6, 2]).fill({ color: 0xbe123c });
    tip.stroke({ color: 0x7f1d1d, width: 2, alpha: 0.9 });
    pin.addChild(tip);

    const center = new PIXI.Graphics();
    center.circle(0, -8, 3).fill({ color: 0xffffff, alpha: 0.95 });
    pin.addChild(center);

    pin.sortableChildren = true;
    body.zIndex = 2;
    highlight.zIndex = 3;
    center.zIndex = 4;
    tip.zIndex = 1;
    shadow.zIndex = 0;
    pin.pivot.set(0, 16);

    return pin;
  }

  function enableSmoothMapSampling(texture, PIXI) {
    if (!texture) return;
    const source = texture.source || texture.baseTexture || null;
    if (!source) return;

    try {
      if (source.style && "scaleMode" in source.style) {
        source.style.scaleMode = "linear";
      } else if ("scaleMode" in source) {
        source.scaleMode = PIXI?.SCALE_MODES?.LINEAR ?? "linear";
      }
    } catch {}

    try {
      if ("mipmap" in source) {
        source.mipmap = PIXI?.MIPMAP_MODES?.ON ?? "on";
      }
    } catch {}

    try {
      if ("anisotropicLevel" in source) {
        source.anisotropicLevel = 16;
      }
    } catch {}

    try {
      source.update?.();
    } catch {}
  }

  async function load(){
    const ctx = pixi.tryGet ? pixi.tryGet() : null;
    if (!ctx) return { world: null, mapSprite: null, playerMarker: null };
    const { PIXI, app } = ctx;
    world = new PIXI.Container();
    app.stage.addChild(world);

    let lastError = null;
    for (const url of mapUrls) {
      try {
        const tex = await PIXI.Assets.load(url);
        enableSmoothMapSampling(tex, PIXI);
        mapSprite = new PIXI.Sprite(tex);
        mapSprite.roundPixels = false;
        world.addChild(mapSprite);
        resolvedMapUrl = url;
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (!mapSprite) {
      app.stage.removeChild(world);
      world.destroy({ children: true });
      world = null;
      throw (lastError || new Error("map_load_failed"));
    }

    // Player marker: 3D-like red pin.
    trailLayer = new PIXI.Graphics();
    world.addChild(trailLayer);
    playerMarker = createPlayerPinMarker(PIXI);
    world.addChild(playerMarker);

    remoteLayer = new PIXI.Container();
    world.addChild(remoteLayer);

    return { world, mapSprite, playerMarker };
  }

  function setPlayerPosNorm(pos){
    if (!mapSprite || !playerMarker || !pos) return;
    const x = pos.x * mapSprite.width;
    const y = pos.y * mapSprite.height;
    playerMarker.x = x;
    playerMarker.y = y;
    if (!trailPoints.length) {
      trailPoints = [{ x, y }];
    }
  }

  function appendTrailPointNorm(pos) {
    if (!mapSprite || !trailLayer || !pos) return;
    const x = Number(pos.x) * mapSprite.width;
    const y = Number(pos.y) * mapSprite.height;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (!trailPoints.length) {
      trailPoints = [{ x, y }];
      return;
    }
    const last = trailPoints[trailPoints.length - 1];
    const dx = x - last.x;
    const dy = y - last.y;
    if ((dx * dx + dy * dy) < 0.25) return;
    trailPoints.push({ x, y });
    if (trailPoints.length > 800) trailPoints = trailPoints.slice(-800);

    trailLayer.clear();
    if (trailPoints.length < 2) return;
    const dash = 5;
    const gap = 14;
    for (let i = 1; i < trailPoints.length; i += 1) {
      const a = trailPoints[i - 1];
      const b = trailPoints[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const segLen = Math.hypot(dx, dy);
      if (segLen <= 0.001) continue;
      const ux = dx / segLen;
      const uy = dy / segLen;
      let t = 0;
      while (t < segLen) {
        const start = t;
        const end = Math.min(segLen, t + dash);
        trailLayer.moveTo(a.x + ux * start, a.y + uy * start);
        trailLayer.lineTo(a.x + ux * end, a.y + uy * end);
        t += dash + gap;
      }
    }
    trailLayer.stroke({ color: 0xbe123c, width: 1.5, alpha: 0.92, cap: "round", join: "round" });
  }

  function resetTrail() {
    trailLayer?.clear?.();
    trailPoints = [];
  }

  function getPlayerPosWorld(){
    if (!playerMarker) return { x:0, y:0 };
    return { x: playerMarker.x, y: playerMarker.y };
  }

  function fitToScreen(){
    const ctx = pixi.tryGet ? pixi.tryGet() : null;
    if (!ctx) return;
    const { app } = ctx;
    if (!mapSprite || !world) return;

    const vw = app.renderer.width;
    const vh = app.renderer.height;
    const s = Math.max(vw / mapSprite.width, vh / mapSprite.height);
    world.scale.set(s);
    world.position.set((vw - mapSprite.width * s) / 2, (vh - mapSprite.height * s) / 2);
  }

  function centerOnPlayer(){
    const ctx = pixi.tryGet ? pixi.tryGet() : null;
    if (!ctx) return;
    const { app } = ctx;
    if (!world || !mapSprite || !playerMarker) return;
    const vw = app.renderer.width;
    const vh = app.renderer.height;
    const s = world.scale.x;

    world.x = vw/2 - playerMarker.x * s;
    world.y = vh/2 - playerMarker.y * s;
  }

  function bounds(){
    if (!mapSprite) return { w:0, h:0 };
    return { w: mapSprite.width, h: mapSprite.height };
  }

  function setRemotePlayers(players, selfUsername) {
    if (!mapSprite || !remoteLayer) return;
    const list = Array.isArray(players) ? players : [];
    const alive = new Set();
    const ctx = pixi.tryGet ? pixi.tryGet() : null;
    if (!ctx) return;
    const { PIXI } = ctx;

    for (const p of list) {
      const username = String(p?.username || "");
      const pos = p?.pos || null;
      if (!username || username === String(selfUsername || "")) continue;
      const x = Number(pos?.x);
      const y = Number(pos?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      alive.add(username);

      let marker = remoteMarkers.get(username);
      if (!marker) {
        const container = new PIXI.Container();
        const cross = new PIXI.Text("+", {
          fontSize: 22,
          fill: 0x16a34a,
          stroke: 0xffffff,
          strokeThickness: 3,
          fontWeight: "900"
        });
        cross.anchor.set(0.5);
        const label = new PIXI.Text(String(p?.name || username), {
          fontSize: 12,
          fill: 0x111827,
          stroke: 0xffffff,
          strokeThickness: 2,
          fontWeight: "700"
        });
        label.anchor.set(0.5, 1.7);
        container.addChild(cross);
        container.addChild(label);
        remoteLayer.addChild(container);
        marker = { container, cross, label };
        remoteMarkers.set(username, marker);
      }
      marker.label.text = String(p?.name || username);
      marker.container.x = x * mapSprite.width;
      marker.container.y = y * mapSprite.height;
    }

    for (const [username, marker] of remoteMarkers.entries()) {
      if (alive.has(username)) continue;
      remoteLayer.removeChild(marker.container);
      marker.container.destroy({ children: true });
      remoteMarkers.delete(username);
    }
  }

  return {
    load,
    fitToScreen,
    centerOnPlayer,
    setPlayerPosNorm,
    appendTrailPointNorm,
    resetTrail,
    getPlayerPosWorld,
    get world(){ return world; },
    get mapSprite(){ return mapSprite; },
    get playerMarker(){ return playerMarker; },
    get resolvedMapUrl(){ return resolvedMapUrl; },
    bounds,
    setRemotePlayers,
  };
}

