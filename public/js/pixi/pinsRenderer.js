export function createPinsRenderer({ pixi, mapView }) {
  let pins = [];
  let sprites = [];
  let onClick = null;

  function clear() {
    const world = mapView.world;
    if (!world) return;
    for (const s of sprites) {
      if (s.parent) s.parent.removeChild(s);
      s.destroy?.({ children: true });
    }
    sprites = [];
  }

  function isVisible(pin, userState) {
    if (pin.enabled === false) return false;
    const reqs = pin.requires || [];
    for (const r of reqs) {
      if (r.type === "campaign_completed") {
        const camp = userState?.campaign?.[r.campaignId];
        if (!camp || camp.completed !== true) return false;
      }
    }
    return true;
  }

  function resolvePinType(pin) {
    const kind = String(pin?.kind || pin?.type || "").toLowerCase();
    if (kind.includes("campaign")) return "campaign";
    if (kind.includes("combat_pvp")) return "combat_pvp";
    if (kind.includes("combat_pve")) return "combat_pve";
    if (kind.includes("narrative")) return "combat_narrative_music";
    if (kind.includes("tutorial")) return "tutorial";
    return "default";
  }

  function paletteForPin(pin) {
    const t = resolvePinType(pin);
    if (t === "campaign") {
      return { body: 0x0ea5e9, tip: 0x0284c7, stroke: 0x0c4a6e };
    }
    if (t === "combat_narrative_music") {
      return { body: 0x8b5cf6, tip: 0x7c3aed, stroke: 0x4c1d95 };
    }
    if (t === "combat_pvp") {
      return { body: 0xef4444, tip: 0xdc2626, stroke: 0x7f1d1d };
    }
    if (t === "combat_pve") {
      return { body: 0x22c55e, tip: 0x16a34a, stroke: 0x14532d };
    }
    if (t === "tutorial") {
      return { body: 0xf59e0b, tip: 0xd97706, stroke: 0x78350f };
    }
    return { body: 0x64748b, tip: 0x475569, stroke: 0x1e293b };
  }

  function createMapPinMarker(PIXI, pin) {
    const palette = paletteForPin(pin);
    const marker = new PIXI.Container();

    const shadow = new PIXI.Graphics();
    shadow.ellipse(0, 26, 12, 6).fill({ color: 0x000000, alpha: 0.24 });
    marker.addChild(shadow);

    const body = new PIXI.Graphics();
    body.circle(0, -12, 16).fill({ color: palette.body });
    body.stroke({ color: palette.stroke, width: 3, alpha: 0.95 });
    marker.addChild(body);

    const highlight = new PIXI.Graphics();
    highlight.circle(-5, -16, 5).fill({ color: 0xffffff, alpha: 0.42 });
    marker.addChild(highlight);

    const tip = new PIXI.Graphics();
    tip.poly([0, 24, -9, 5, 9, 5]).fill({ color: palette.tip });
    tip.stroke({ color: palette.stroke, width: 3, alpha: 0.95 });
    marker.addChild(tip);

    const center = new PIXI.Graphics();
    center.circle(0, -12, 5).fill({ color: 0xffffff, alpha: 0.95 });
    marker.addChild(center);

    const iconText = new PIXI.Text(String(pin?.icon || "P"), {
      fontSize: 15,
      fill: 0x111827,
      fontWeight: "900",
      stroke: 0xffffff,
      strokeThickness: 2
    });
    iconText.anchor.set(0.5);
    iconText.x = 0;
    iconText.y = -12;
    marker.addChild(iconText);

    marker.sortableChildren = true;
    body.zIndex = 2;
    highlight.zIndex = 3;
    center.zIndex = 4;
    iconText.zIndex = 5;
    tip.zIndex = 1;
    shadow.zIndex = 0;
    marker.pivot.set(0, 24);
    return marker;
  }

  function render(newPins, userState) {
    pins = newPins || [];
    clear();

    const { PIXI } = pixi.get();
    const world = mapView.world;
    const map = mapView.mapSprite;
    if (!world || !map) return;

    for (const p of pins) {
      if (!isVisible(p, userState)) continue;
      const marker = createMapPinMarker(PIXI, p);
      marker.x = p.x * map.width;
      marker.y = p.y * map.height;
      marker.eventMode = "static";
      marker.cursor = "pointer";
      marker.on("pointertap", () => {
        if (onClick) onClick(p);
      });
      world.addChild(marker);
      sprites.push(marker);
    }
  }

  function onPinClick(cb) {
    onClick = cb;
  }

  return { render, onPinClick };
}
