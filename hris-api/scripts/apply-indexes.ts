import "dotenv/config";
import { MongoClient } from "mongodb";

const TIMESHEET_LINES = "timesheet_lines";
const STALE_TIMESHEET_LINE_INDEXES = new Set([
	"timesheet_lines_organizationId_timesheetId_date_key",
	"organizationId_1_timesheetId_1_date_1",
]);
const DESIRED_TIMESHEET_LINE_UNIQUE_INDEX =
	"timesheet_lines_organizationId_timesheetId_date_revisionNo_key";
const REQUIRE_CONFIRM_ENV = "ALLOW_LOCAL_INDEX_MUTATION";

function getDatabaseUrl() {
	const url = process.env.DATABASE_URL || process.env.MONGODB_URI;
	if (!url) {
		throw new Error("DATABASE_URL or MONGODB_URI is required to apply MongoDB indexes.");
	}
	return url;
}

function isLocalMongoUrl(url: string) {
	return /(mongodb(\+srv)?:\/\/)([^@/]+@)?(localhost|127\.0\.0\.1|mongodb)(:\d+)?(\/|$)/i.test(url);
}

function assertLocalMutationAllowed(url: string, dryRun: boolean) {
	if (dryRun) return;

	const allowFlag = String(process.env[REQUIRE_CONFIRM_ENV] || "").trim().toLowerCase();
	if (allowFlag !== "true") {
		throw new Error(
			`Refusing to mutate indexes without ${REQUIRE_CONFIRM_ENV}=true. Use --dry-run for inspection-only mode.`,
		);
	}

	if (!isLocalMongoUrl(url)) {
		throw new Error(`Refusing to mutate indexes on non-local Mongo target: ${url}`);
	}
}

function isStaleTimesheetLineIndex(index: any) {
	const key = index?.key || {};
	return (
		STALE_TIMESHEET_LINE_INDEXES.has(String(index?.name || "")) ||
		(index?.unique === true &&
			key.organizationId === 1 &&
			key.timesheetId === 1 &&
			key.date === 1 &&
			key.revisionNo === undefined)
	);
}

async function main() {
	const dryRun = process.argv.includes("--dry-run");
	const databaseUrl = getDatabaseUrl();
	assertLocalMutationAllowed(databaseUrl, dryRun);
	const client = new MongoClient(databaseUrl);

	await client.connect();
	try {
		const db = client.db();
		const collection = db.collection(TIMESHEET_LINES);
		const indexes = await collection.indexes();

		console.log(
			`[apply-indexes] ${TIMESHEET_LINES} indexes before: ${indexes
				.map((index) => index.name)
				.join(", ")}`,
		);

		for (const index of indexes) {
			if (!isStaleTimesheetLineIndex(index)) continue;
			console.log(`[apply-indexes] dropping stale index: ${index.name}`);
			if (!dryRun) {
				await collection.dropIndex(String(index.name));
			}
		}

		const refreshedIndexes = dryRun ? indexes : await collection.indexes();
		const hasDesiredIndex = refreshedIndexes.some(
			(index) => String(index.name || "") === DESIRED_TIMESHEET_LINE_UNIQUE_INDEX,
		);

		if (!hasDesiredIndex) {
			console.log(`[apply-indexes] creating index: ${DESIRED_TIMESHEET_LINE_UNIQUE_INDEX}`);
			if (!dryRun) {
				await collection.createIndex(
					{ organizationId: 1, timesheetId: 1, date: 1, revisionNo: 1 },
					{
						name: DESIRED_TIMESHEET_LINE_UNIQUE_INDEX,
						unique: true,
					},
				);
			}
		}

		const finalIndexes = dryRun ? refreshedIndexes : await collection.indexes();
		console.log(
			`[apply-indexes] ${TIMESHEET_LINES} indexes after: ${finalIndexes
				.map((index) => index.name)
				.join(", ")}`,
		);
		if (dryRun) {
			console.log("[apply-indexes] dry run only; no indexes were changed.");
		}
	} finally {
		await client.close();
	}
}

main().catch((error) => {
	console.error("[apply-indexes] failed:", error);
	process.exit(1);
});
