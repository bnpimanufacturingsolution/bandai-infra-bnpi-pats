import { runEnterpriseMigrationStage } from "./stage-runner";

runEnterpriseMigrationStage("EMPLOYMENT_RELATIONSHIP_PATCH").catch((error) => {
	console.error("Enterprise stage failed:", error);
	process.exit(1);
});
