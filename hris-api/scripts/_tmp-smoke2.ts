process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:55435/hris?schema=public";
process.env.PG_DATABASE_URL = process.env.DATABASE_URL;
process.env.WRITE_DATABASE_URL = process.env.DATABASE_URL;
import { PrismaClient } from "../generated/prisma";
async function main() {
  const p = new PrismaClient();
  console.log(JSON.stringify({ emp: await p.employee.count({ where: { isDeleted: false } }) }));
  await p.$disconnect();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
