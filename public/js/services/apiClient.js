export function createApiClient(){
  let token = null;

  function setToken(t){ token = t; }
  function clearToken(){ token = null; }

  async function request(path, opts = {}){
    const headers = opts.headers || {};
    if (token) headers["Authorization"] = "Bearer " + token;
    if (!headers["Content-Type"] && opts.body) headers["Content-Type"] = "application/json";

    const res = await fetch(path, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok){
      const err = new Error(data.error || ("http_" + res.status));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  return { setToken, clearToken, request };
}
