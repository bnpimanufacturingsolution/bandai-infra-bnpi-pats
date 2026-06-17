import { runEnterpriseMigrationStage } from "./stage-runner";

runEnterpriseMigrationStage("CLOSED_HISTORICAL_OPERATIONAL_LEDGER").catch((error) => {
	console.error("Enterprise stage failed:", error);
	process.exit(1);
});
