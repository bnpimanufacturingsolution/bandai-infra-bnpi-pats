const { Client } = require("pg");
async function main() {
  const c = new Client({
    host: "127.0.0.1",
    port: 55435,
    user: "postgres",
    password: "postgres",
    database: "hris",
    connectionTimeoutMillis: 15000,
  });
  await c.connect();
  const r = await c.query("select 1 as x");
  console.log(JSON.stringify(r.rows));
  await c.end();
}
main().catch((e) => { console.error("PG2_ERR", e.message); process.exit(1); });
