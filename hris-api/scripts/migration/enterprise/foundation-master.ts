import { runEnterpriseMigrationStage } from "./stage-runner";

runEnterpriseMigrationStage("FOUNDATION_MASTER").catch((error) => {
	console.error("Enterprise stage failed:", error);
	process.exit(1);
});
