const { Client } = require("pg");

async function main() {
	const client = new Client({
		host: "127.0.0.1",
		port: 55435,
		user: "postgres",
		password: "postgres",
		database: "hris",
	});
	await client.connect();
	const res = await client.query(
		'SELECT id, name FROM "organizations" WHERE "isDeleted" = false ORDER BY "createdAt" ASC LIMIT 5',
	);
	console.log(JSON.stringify(res.rows, null, 2));
	await client.end();
}

main().catch((e) => {
	console.error(e.message);
	process.exit(1);
});
