export function createStateService({ api }){
  async function getState(){
    return api.request("/api/state");
  }
  async function patchState(patch){
    await api.request("/api/state", { method:"POST", body: JSON.stringify(patch) });
    return true;
  }
  return { getState, patchState };
}
