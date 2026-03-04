const fs = require("fs");

function createDb(DB_PATH){
  let writeChain = Promise.resolve();

  function enqueue(task){
    // Keep queue alive even if a previous task failed.
    const run = writeChain.catch(() => {}).then(task);
    // Store a swallowed version to avoid poisoning subsequent tasks.
    writeChain = run.catch(() => {});
    return run;
  }

  function read(){
    const raw = fs.readFileSync(DB_PATH, "utf-8");
    const clean = raw.replace(/^\uFEFF/, "");
    return JSON.parse(clean);
  }

  function write(db){
    return enqueue(() => {
      fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
    });
  }

  function update(mutator){
    return enqueue(async () => {
      const dbData = read();
      const result = await mutator(dbData);
      fs.writeFileSync(DB_PATH, JSON.stringify(dbData, null, 2), "utf-8");
      return result;
    });
  }

  function getUser(db, username){
    const norm = String(username || "").trim().toLowerCase();
    return db.users.find(u => String(u.username || "").trim().toLowerCase() === norm) || null;
  }

  return { read, write, update, getUser };
}

module.exports = { createDb };
