import { runEnterpriseMigrationStage } from "./stage-runner";

runEnterpriseMigrationStage("IDENTITY_MASTER").catch((error) => {
	console.error("Enterprise stage failed:", error);
	process.exit(1);
});
