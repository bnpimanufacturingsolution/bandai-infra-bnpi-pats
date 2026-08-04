const { Client } = require("pg");
async function main() {
  const c = new Client({
    connectionString: "postgresql://postgres:postgres@127.0.0.1:55435/hris?schema=public",
    connectionTimeoutMillis: 15000,
  });
  await c.connect();
  const r = await c.query("select count(*)::int as n from \"Employee\" where \"isDeleted\"=false");
  console.log(JSON.stringify({ ok: true, employees: r.rows[0].n }));
  await c.end();
}
main().catch((e) => { console.error("PG_ERR", e.message); process.exit(1); });
