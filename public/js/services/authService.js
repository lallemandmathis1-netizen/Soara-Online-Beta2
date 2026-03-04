export function createAuthService({ api, storageKey = "soara_token" }){
  function restore(){
    return localStorage.getItem(storageKey);
  }
  function save(token){
    localStorage.setItem(storageKey, token);
  }
  function clear(){
    localStorage.removeItem(storageKey);
  }

  async function login(username, password){
    const r = await api.request("/api/login", {
      method:"POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    save(r.token);
    return r.token;
  }
  async function register(username, password){
    await api.request("/api/register", {
      method:"POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    // auto-login not done; caller may call login
    return true;
  }
  async function verifyMe(){
    return api.request("/api/me");
  }

  function logout(){
    clear();
  }

  return { restore, save, clear, login, register, verifyMe, logout };
}
