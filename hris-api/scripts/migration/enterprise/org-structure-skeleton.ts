import { runEnterpriseMigrationStage } from "./stage-runner";

runEnterpriseMigrationStage("ORG_STRUCTURE_SKELETON").catch((error) => {
	console.error("Enterprise stage failed:", error);
	process.exit(1);
});
