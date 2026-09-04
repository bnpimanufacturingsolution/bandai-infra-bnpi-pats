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
		"SELECT unnest(enum_range(NULL::\"DisciplinaryActionStatus\")) AS val",
	);
	console.log(JSON.stringify(res.rows.map((r) => r.val)));
	const backup = await client.query(
		"SELECT COUNT(*)::int AS n FROM requests_type_backup_20260826",
	);
	console.log("backup_rows=" + backup.rows[0].n);
	await client.end();
}

main().catch((e) => {
	console.error(e.message);
	process.exit(1);
});
