const jwt = require("jsonwebtoken");

function signToken({ username, secret }){
  return jwt.sign({ u: username }, secret, { expiresIn: "7d" });
}

function authMiddleware({ secret }){
  return (req, res, next) => {
    const h = req.headers["authorization"] || "";
    const m = h.match(/^Bearer\s+(.+)$/i);
    if (!m) return res.status(401).json({ error: "unauthorized" });
    try{
      const payload = jwt.verify(m[1], secret);
      req.username = payload.u;
      return next();
    }catch{
      return res.status(401).json({ error: "unauthorized" });
    }
  };
}

module.exports = { signToken, authMiddleware };
