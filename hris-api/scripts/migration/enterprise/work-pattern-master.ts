import { runEnterpriseMigrationStage } from "./stage-runner";

runEnterpriseMigrationStage("WORK_PATTERN_MASTER").catch((error) => {
	console.error("Enterprise stage failed:", error);
	process.exit(1);
});
