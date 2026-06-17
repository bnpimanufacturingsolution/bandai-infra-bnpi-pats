export const resolveMigrationReportEnabled = (env: NodeJS.ProcessEnv) => {
	const explicit = String(env.MIGRATION_REPORT_ENABLED || "").trim().toLowerCase();
	if (!explicit) return Boolean(String(env.MIGRATION_REPORT_TEMPLATE_PATH || "").trim());
	return explicit === "true";
};
