import { runEnterpriseMigrationStage } from "./stage-runner";

runEnterpriseMigrationStage("PRE_MIGRATION_CONTROLS").catch((error) => {
	console.error("Enterprise stage failed:", error);
	process.exit(1);
});
