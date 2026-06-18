import fs from "fs";
import path from "path";
import { connectDb, disconnectAllDatabases, prisma } from "../config/database";
import { config } from "../config/config";
import { getLogger } from "../helper/logger.helper";
import { pruneOldBackupRuns, runDatabaseBackup } from "../helper/database-backup.helper";

const logger = getLogger();
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");

const readPackageVersion = (): string | null => {
	try {
		const packageJson = JSON.parse(
			fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"),
		) as { version?: string };
		return packageJson.version || null;
	} catch {
		return null;
	}
};

const main = async () => {
	await connectDb();
	try {
		const result = await runDatabaseBackup({
			prisma,
			outputDir: config.backup.outputDir,
			timezone: config.backup.timezone,
			dryRun,
			appVersion: readPackageVersion(),
			pgDump: {
				enabled: !dryRun,
				containerName: config.backup.postgresContainerName || undefined,
				database: config.backup.postgresDatabase || undefined,
				user: config.backup.postgresUser || undefined,
				databaseUrl: config.writeDatabaseUrl || undefined,
				env: config.backup.postgresPassword
					? { PGPASSWORD: config.backup.postgresPassword }
					: undefined,
			},
			logger,
		});

		const deleted = dryRun
			? []
			: pruneOldBackupRuns(
					config.backup.outputDir,
					config.backup.retentionDays,
					new Date(),
					logger,
				);

		console.log(
			JSON.stringify(
				{
					runId: result.runId,
					runDir: result.runDir,
					manifestPath: result.manifestPath,
					status: result.manifest.status,
					totalRows: result.manifest.totalRows,
					artifactCount: result.manifest.artifacts.length,
					retentionDeletedCount: deleted.length,
					dryRun,
				},
				null,
				2,
			),
		);
	} finally {
		await disconnectAllDatabases();
	}
};

main().catch((error) => {
	logger.error("database_backup.manual_failed", {
		error:
			error instanceof Error
				? { message: error.message, name: error.name, stack: error.stack }
				: error,
	});
	process.exit(1);
});
