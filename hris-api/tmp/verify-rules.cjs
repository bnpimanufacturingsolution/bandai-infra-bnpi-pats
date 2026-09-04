const { Client } = require("pg");
async function main() {
  const c = new Client({ host: "127.0.0.1", port: 55435, user: "postgres", password: "postgres", database: "hris" });
  await c.connect();
  const r = await c.query(`SELECT code, title, severity, category, "isActive" FROM rules WHERE "isDeleted" = false ORDER BY code`);
  console.log(JSON.stringify(r.rows, null, 1));
  await c.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
