export function createCameraController({ pixi, mapView }){
  let attached = false;
  let handlers = null;
  const MIN_ZOOM_FACTOR = 1;
  const DEFAULT_ZOOM_FACTOR = 3.4;
  // Avoid pushing map texture too far beyond source resolution (prevents pixelated zoom).
  const MAX_ZOOM = Math.max(2.2, Math.min(5, Number(window.devicePixelRatio || 4)));

  let dragging = false;
  let last = { x:0, y:0 };

  function computeMinZoom(app, map) {
    const vw = app.renderer.width;
    const vh = app.renderer.height;
    const fitZoom = Math.max(vw / map.width, vh / map.height);
    return Math.max(0.05, fitZoom * MIN_ZOOM_FACTOR);
  }

  function clamp(){
    const ctx = pixi.tryGet ? pixi.tryGet() : null;
    if (!ctx) return;
    const { app } = ctx;
    const world = mapView.world;
    const map = mapView.mapSprite;
    if (!world || !map) return;

    const minZoom = computeMinZoom(app, map);
    world.scale.set(Math.max(minZoom, world.scale.x));

    const s = world.scale.x;
    const vw = app.renderer.width;
    const vh = app.renderer.height;
    const mw = map.width * s;
    const mh = map.height * s;

    const minX = Math.min(0, vw - mw);
    const minY = Math.min(0, vh - mh);

    world.x = Math.min(0, Math.max(minX, world.x));
    world.y = Math.min(0, Math.max(minY, world.y));
  }

  function centerOnPlayer(){
    mapView.centerOnPlayer();
    clamp();
  }

  function setZoomMax(){
    const world = mapView.world;
    if (!world) return;
    world.scale.set(MAX_ZOOM);
    centerOnPlayer();
  }

  function setZoomMin(){
    const ctx = pixi.tryGet ? pixi.tryGet() : null;
    if (!ctx) return;
    const { app } = ctx;
    const world = mapView.world;
    const map = mapView.mapSprite;
    if (!world || !map) return;
    world.scale.set(computeMinZoom(app, map));
    centerOnPlayer();
  }

  function setZoomDefault(){
    const ctx = pixi.tryGet ? pixi.tryGet() : null;
    if (!ctx) return;
    const { app } = ctx;
    const world = mapView.world;
    const map = mapView.mapSprite;
    if (!world || !map) return;
    const minZoom = computeMinZoom(app, map);
    const fitZoom = minZoom / MIN_ZOOM_FACTOR;
    const target = fitZoom * DEFAULT_ZOOM_FACTOR;
    world.scale.set(Math.max(minZoom, Math.min(MAX_ZOOM, target)));
    centerOnPlayer();
  }

  function attach(){
    if (attached) return;
    const ctx = pixi.tryGet ? pixi.tryGet() : null;
    if (!ctx) return;
    attached = true;

    const { app } = ctx;
    const canvas = app.canvas;
    canvas.style.cursor = "default";

    const onDown = (e) => {
      dragging = true;
      last.x = e.clientX;
      last.y = e.clientY;
    };
    const onUp = () => { dragging = false; };

    const onMove = (e) => {
      if (!dragging) return;
      const world = mapView.world;
      if (!world) return;

      world.x += (e.clientX - last.x);
      world.y += (e.clientY - last.y);
      last.x = e.clientX;
      last.y = e.clientY;
      clamp();
    };

    const onWheel = (e) => {
      e.preventDefault();
      const world = mapView.world;
      const map = mapView.mapSprite;
      if (!world) return;
      if (!map) return;

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const delta = Math.sign(e.deltaY);
      const old = world.scale.x;
      const next = old * (delta > 0 ? 0.92 : 1.08);
      const minZoom = computeMinZoom(app, map);
      const targetScale = Math.max(minZoom, Math.min(MAX_ZOOM, next));
      // Keep the world point under the cursor stable while zooming.
      const worldX = (mouseX - world.x) / old;
      const worldY = (mouseY - world.y) / old;
      world.scale.set(targetScale);
      world.x = mouseX - worldX * targetScale;
      world.y = mouseY - worldY * targetScale;
      clamp();
    };

    const onResize = () => centerOnPlayer();
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointermove", onMove);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", onResize);
    handlers = { canvas, onDown, onUp, onMove, onWheel, onResize };
  }

  function detach(){
    if (!attached || !handlers) return;
    const { canvas, onDown, onUp, onMove, onWheel, onResize } = handlers;
    canvas.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("wheel", onWheel);
    window.removeEventListener("resize", onResize);
    handlers = null;
    attached = false;
  }

  return { attach, detach, clamp, centerOnPlayer, setZoomMax, setZoomMin, setZoomDefault };
}
