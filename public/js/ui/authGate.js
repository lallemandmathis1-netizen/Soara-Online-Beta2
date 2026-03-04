export function mountAuthGate(dom, { onLogin, onRegister }){
  function readableAuthError(e, fallback){
    const code = e?.data?.error || e?.message || "";
    if (code === "username_required") return "Pseudo manquant.";
    if (code === "password_required") return "Mot de passe manquant.";
    if (code === "password_too_short") return "Mot de passe trop court (minimum 6).";
    if (code === "invalid_username") return "Pseudo invalide (3-24, lettres/chiffres/espace/._-).";
    if (code === "exists") return "Ce pseudo existe deja.";
    if (code === "bad_login") return "Identifiants invalides.";
    if (code === "server_error") return "Erreur serveur. Verifie le terminal Node.";
    if (typeof e?.data?.message === "string" && e.data.message) return e.data.message;
    if (typeof code === "string" && code.startsWith("http_")) return `Erreur reseau (${code}).`;
    if (typeof e?.message === "string" && e.message) return `${fallback} (${e.message})`;
    return fallback;
  }

  function show(msg=""){
    dom.authMsg.textContent = msg;
    dom.authGate.style.display = "block";
  }

  function hide(){
    dom.authGate.style.display = "none";
    dom.authMsg.textContent = "";
  }

  dom.btnLogin.onclick = async () => {
    dom.authMsg.textContent = "";
    const username = dom.authUser.value.trim();
    const password = dom.authPass.value;
    try{
      await onLogin({ username, password });
    }catch(e){
      dom.authMsg.textContent = readableAuthError(e, "Connexion impossible.");
    }
  };

  dom.btnRegister.onclick = async () => {
    dom.authMsg.textContent = "";
    const username = dom.authUser.value.trim();
    const password = dom.authPass.value;
    try{
      await onRegister({ username, password });
      dom.authMsg.textContent = "Compte cree. Connecte-toi pour entrer dans Soara.";
    }catch(e){
      dom.authMsg.textContent = readableAuthError(e, "Creation impossible.");
    }
  };

  return { show, hide };
}
