import { spawnSync } from "node:child_process";
import path from "node:path";
import { getRequiredIsolatedDbFaultConfig } from "../support/isolated-prisma-client";

function runPrismaDbPush(isolatedUrl: string) {
	const npx = process.platform === "win32" ? "npx.cmd" : "npx";
	const result = spawnSync(
		npx,
		[
			"prisma",
			"db",
			"push",
			"--schema",
			path.join("prisma", "schema-postgres"),
			"--skip-generate",
		],
		{
			cwd: process.cwd(),
			env: {
				...process.env,
				PG_DATABASE_URL: isolatedUrl,
			},
			stdio: "inherit",
			windowsHide: true,
		},
	);

	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(`prisma db push failed with exit code ${result.status ?? "unknown"}.`);
	}
}

async function main() {
	const config = getRequiredIsolatedDbFaultConfig();
	runPrismaDbPush(config.url);
	console.log(
		`Prepared isolated DB schema for ${config.databaseName} at ${config.hostname}:${config.port}.`,
	);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
