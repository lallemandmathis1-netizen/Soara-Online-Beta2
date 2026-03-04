export function createVisitedOverlay(){
  // Feature prête, mais OFF par défaut dans config.json
  let enabled = false;
  function enable(v){ enabled = (v === true); }
  function update(){ /* no-op */ }
  return { enable, update, get enabled(){ return enabled; } };
}
