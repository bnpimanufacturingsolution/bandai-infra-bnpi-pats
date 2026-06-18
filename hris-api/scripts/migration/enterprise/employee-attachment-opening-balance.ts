import { runEnterpriseMigrationStage } from "./stage-runner";

runEnterpriseMigrationStage("EMPLOYEE_ATTACHMENT_OPENING_BALANCE").catch((error) => {
	console.error("Enterprise stage failed:", error);
	process.exit(1);
});
