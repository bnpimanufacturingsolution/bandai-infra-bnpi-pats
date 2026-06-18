import { runEnterpriseMigrationStage } from "./stage-runner";

runEnterpriseMigrationStage("POST_MIGRATION_RECONCILIATION").catch((error) => {
	console.error("Enterprise stage failed:", error);
	process.exit(1);
});
