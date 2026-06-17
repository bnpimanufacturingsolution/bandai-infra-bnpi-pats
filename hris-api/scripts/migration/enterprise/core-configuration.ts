import { runEnterpriseMigrationStage } from "./stage-runner";

runEnterpriseMigrationStage("CORE_CONFIGURATION").catch((error) => {
	console.error("Enterprise stage failed:", error);
	process.exit(1);
});
