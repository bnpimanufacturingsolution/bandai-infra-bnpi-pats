const DRY_RUN_ENV_KEYS = ["MIGRATION_DRY_RUN", "DRY_RUN"] as const;

const cloneWithoutKeys = (
	baseEnv: NodeJS.ProcessEnv,
	keysToRemove: readonly string[],
): NodeJS.ProcessEnv => {
	const nextEnv: NodeJS.ProcessEnv = { ...baseEnv };
	for (const key of keysToRemove) {
		delete nextEnv[key];
	}
	return nextEnv;
};

export const buildEnterpriseSeedSafeEnv = (baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv =>
	cloneWithoutKeys(baseEnv, DRY_RUN_ENV_KEYS);

export const buildEnterpriseDryRunMigrationEnv = (
	baseEnv: NodeJS.ProcessEnv,
	extraEnv: Record<string, string>,
): NodeJS.ProcessEnv => ({
	...cloneWithoutKeys(baseEnv, DRY_RUN_ENV_KEYS),
	...extraEnv,
	MIGRATION_DRY_RUN: "true",
});
