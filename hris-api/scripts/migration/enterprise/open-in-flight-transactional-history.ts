import { runEnterpriseMigrationStage } from "./stage-runner";

runEnterpriseMigrationStage("OPEN_IN_FLIGHT_TRANSACTIONAL_HISTORY").catch((error) => {
	console.error("Enterprise stage failed:", error);
	process.exit(1);
});
