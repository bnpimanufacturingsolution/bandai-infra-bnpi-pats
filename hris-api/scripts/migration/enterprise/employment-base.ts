import { runEnterpriseMigrationStage } from "./stage-runner";

runEnterpriseMigrationStage("EMPLOYMENT_BASE").catch((error) => {
	console.error("Enterprise stage failed:", error);
	process.exit(1);
});
