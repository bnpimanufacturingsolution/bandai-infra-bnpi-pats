import { MigrationWorkbookId } from "./migration-run.types";

export type MigrationStepMode =
	| "sheet_import"
	| "proof_materialization"
	| "side_effect"
	| "verification"
	| "manual";

export type MigrationStepDefinition = {
	stepCode: string;
	workbookId: string;
	label: string;
	mode: MigrationStepMode;
	dependsOn: string[];
	status: "wired" | "planned" | "manual";
};

const STEP_REGISTRY: MigrationStepDefinition[] = [
	{ stepCode: "DM0.1", workbookId: "dm0", label: "Company Profile", mode: "manual", dependsOn: [], status: "manual" },
	{ stepCode: "DM0.2", workbookId: "dm0", label: "Timesheet Rules", mode: "manual", dependsOn: ["DM0.1"], status: "manual" },
	{ stepCode: "DM0.3", workbookId: "dm0", label: "Payroll Rules / Cycle", mode: "manual", dependsOn: ["DM0.2"], status: "manual" },
	{ stepCode: "DM0.4", workbookId: "dm0", label: "Workflow Templates", mode: "manual", dependsOn: ["DM0.1"], status: "manual" },
	{ stepCode: "DM0.5", workbookId: "dm0", label: "201 Document Types", mode: "manual", dependsOn: ["DM0.1"], status: "manual" },
	{ stepCode: "DM1.1", workbookId: "dm1", label: "Departments", mode: "sheet_import", dependsOn: ["DM0.1"], status: "planned" },
	{ stepCode: "DM1.2", workbookId: "dm1", label: "Sections", mode: "sheet_import", dependsOn: ["DM1.1"], status: "planned" },
	{ stepCode: "DM1.3", workbookId: "dm1", label: "Levels", mode: "sheet_import", dependsOn: ["DM0.1"], status: "planned" },
	{ stepCode: "DM1.4", workbookId: "dm1", label: "Positions", mode: "sheet_import", dependsOn: ["DM1.2", "DM1.3"], status: "planned" },
	{ stepCode: "DM1.5", workbookId: "dm1", label: "Shift Types / Schedules", mode: "sheet_import", dependsOn: ["DM0.2"], status: "planned" },
	{ stepCode: "DM1.6", workbookId: "dm1", label: "Agencies", mode: "sheet_import", dependsOn: ["DM0.1"], status: "planned" },
	{ stepCode: "DM2.1", workbookId: "dm2", label: "Holidays", mode: "sheet_import", dependsOn: ["DM0.1"], status: "planned" },
	{ stepCode: "DM2.2", workbookId: "dm2", label: "Leave Types", mode: "sheet_import", dependsOn: ["DM0.1"], status: "planned" },
	{ stepCode: "DM2.3", workbookId: "dm2", label: "Benefit Types", mode: "sheet_import", dependsOn: ["DM0.3"], status: "planned" },
	{ stepCode: "DM2.4", workbookId: "dm2", label: "Loan Types", mode: "sheet_import", dependsOn: ["DM0.3"], status: "planned" },
	{ stepCode: "DM2.5", workbookId: "dm2", label: "201 Document Types", mode: "sheet_import", dependsOn: ["DM0.5"], status: "planned" },
	{ stepCode: "DM3.validate", workbookId: "dm3", label: "Validate Workbook", mode: "sheet_import", dependsOn: ["DM1.1", "DM1.2", "DM1.3", "DM1.4", "DM2.5"], status: "wired" },
	{ stepCode: "DM3.1", workbookId: "dm3", label: "Employees", mode: "sheet_import", dependsOn: ["DM3.validate"], status: "wired" },
	{ stepCode: "DM3.2", workbookId: "dm3", label: "Employee Schedule Assignments", mode: "sheet_import", dependsOn: ["DM3.1", "DM1.5"], status: "wired" },
	{ stepCode: "DM3.2.attendance_obligations", workbookId: "dm3", label: "Materialize Attendance Obligations", mode: "side_effect", dependsOn: ["DM3.2"], status: "wired" },
	{ stepCode: "DM3.2.timesheet_drafts", workbookId: "dm3", label: "Prepare Draft Timesheet Headers", mode: "side_effect", dependsOn: ["DM3.2.attendance_obligations"], status: "wired" },
	{ stepCode: "DM3.3", workbookId: "dm3", label: "Reporting Lines", mode: "sheet_import", dependsOn: ["DM3.1"], status: "wired" },
	{ stepCode: "DM3.4", workbookId: "dm3", label: "Employee Documents / 201 Files", mode: "sheet_import", dependsOn: ["DM3.1", "DM2.5"], status: "wired" },
	{ stepCode: "DM3.5", workbookId: "dm3", label: "Opening Leave Balances", mode: "sheet_import", dependsOn: ["DM3.1", "DM2.2"], status: "wired" },
	{ stepCode: "DM3.6", workbookId: "dm3", label: "Employee Benefits / Loans", mode: "sheet_import", dependsOn: ["DM3.1", "DM2.3", "DM2.4"], status: "wired" },
	{ stepCode: "DM3.post_actions", workbookId: "dm3", label: "Finalize Employee Post Actions", mode: "side_effect", dependsOn: ["DM3.1", "DM3.2", "DM3.2.timesheet_drafts", "DM3.3", "DM3.4", "DM3.5", "DM3.6"], status: "wired" },
	{ stepCode: "DM3.verify_surfaces", workbookId: "dm3", label: "Verify HRIS Surfaces", mode: "verification", dependsOn: ["DM3.post_actions", "DM3.2.attendance_obligations", "DM3.2.timesheet_drafts"], status: "wired" },
	{ stepCode: "DM4.1", workbookId: "dm4", label: "Attendance History", mode: "proof_materialization", dependsOn: ["DM3.1", "DM3.2"], status: "wired" },
	{ stepCode: "DM4.2", workbookId: "dm4", label: "Timesheets", mode: "proof_materialization", dependsOn: ["DM4.1"], status: "wired" },
	{ stepCode: "DM4.3", workbookId: "dm4", label: "Approved Overtime Details", mode: "proof_materialization", dependsOn: ["DM4.2"], status: "wired" },
	{ stepCode: "DM5.1", workbookId: "dm5", label: "Payroll History", mode: "manual", dependsOn: ["DM0.3", "DM3.1", "DM4.3"], status: "planned" },
	{ stepCode: "DM6.1", workbookId: "dm6", label: "Requests / Approval History", mode: "manual", dependsOn: ["DM0.4", "DM3.1"], status: "planned" },
	{ stepCode: "FINAL.1", workbookId: "final", label: "Reconciliation / Sign-off", mode: "verification", dependsOn: ["DM5.1", "DM6.1"], status: "manual" },
];

export function getMigrationStepRegistry() {
	return STEP_REGISTRY;
}

export function getMigrationStepPlan(workbookId: MigrationWorkbookId) {
	const selectedIndex = STEP_REGISTRY.findIndex((step) => step.workbookId === workbookId);
	const selectedStepCodes = new Set(STEP_REGISTRY.filter((step) => step.workbookId === workbookId).map((step) => step.stepCode));
	const prerequisiteSteps = STEP_REGISTRY.filter((step, index) => {
		if (index >= selectedIndex) return false;
		return STEP_REGISTRY.some((candidate) => selectedStepCodes.has(candidate.stepCode) && candidate.dependsOn.includes(step.stepCode));
	});
	const workbookSteps = STEP_REGISTRY.filter((step) => step.workbookId === workbookId);
	return [...prerequisiteSteps, ...workbookSteps];
}
