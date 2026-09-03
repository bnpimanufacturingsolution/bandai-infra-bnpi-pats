const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

const isTruthy = (value: string | undefined) => TRUE_VALUES.has(String(value || "").trim().toLowerCase());

export const SEED_WRITE_SCRIPT_NAMES = [
	"prisma-seed",
	"seed:pan",
	"seed:bulk-backdated-employees",
	"seed:calculator",
	"seed:defaults",
	"seed:holidays",
	"seed:reset-demo-requests",
	"seed:soa",
	"seed:eligibility",
] as const;

export function isSeedDryRunRequested(
	env: Record<string, string | undefined> = process.env,
	argv = process.argv,
) {
	const requestedViaMigrationEnv = isTruthy(env.MIGRATION_DRY_RUN);
	const requestedViaGenericEnv = isTruthy(env.DRY_RUN);
	const requestedViaArgv = argv.some((arg) => {
		const normalized = String(arg || "").trim().toLowerCase();
		return normalized === "--dry-run" || normalized.startsWith("--dry-run=");
	});

	return requestedViaMigrationEnv || requestedViaGenericEnv || requestedViaArgv;
}

export function assertSeedDryRunNotRequested(scriptName: string) {
	if (!isSeedDryRunRequested()) return;

	throw new Error(
		[
			`${scriptName} is a seed/write script and does not support dry-run mode.`,
			`Use the enterprise migration commands with MIGRATION_DRY_RUN=true for validation-only checks.`,
			`Do not run seed scripts when DRY_RUN or MIGRATION_DRY_RUN is set.`,
		].join(" "),
	);
}
