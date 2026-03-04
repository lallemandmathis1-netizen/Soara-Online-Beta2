export function createPixiRoot({ canvasHost }){
  let PIXI = null;
  let app = null;

  async function init(){
    if (app) return { PIXI, app };

    PIXI = await import("https://cdn.jsdelivr.net/npm/pixi.js@8.5.2/dist/pixi.min.mjs");
    app = new PIXI.Application();
    const pixelRatio = Number(window.devicePixelRatio || 1);
    await app.init({
      resizeTo: window,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(pixelRatio, 3)
    });
    app.ticker.maxFPS = 30;

    canvasHost.innerHTML = "";
    canvasHost.appendChild(app.canvas);
    app.canvas.style.cursor = "default";
    app.canvas.style.imageRendering = "auto";
    return { PIXI, app };
  }

  function destroy(){
    if (!app) return;
    app.destroy(true);
    app = null;
    PIXI = null;
  }

  function get(){
    if (!app) throw new Error("pixi_not_initialized");
    return { PIXI, app };
  }

  function tryGet(){
    if (!app) return null;
    return { PIXI, app };
  }

  function isReady(){
    return !!app;
  }

  return { init, destroy, get, tryGet, isReady };
}
