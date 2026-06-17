/**
 * URL `flow` values for the company-profile phase of system setup.
 */
export type SetupFlowId =
	| "welcome"
	| "payroll"
	| "holidays"
	| "workflows"
	| "review";

const SETUP_FLOW_IDS = new Set<SetupFlowId>([
	"welcome",
	"payroll",
	"holidays",
	"workflows",
	"review",
]);

export function isSetupFlowId(value: string | null | undefined): value is SetupFlowId {
	return value != null && SETUP_FLOW_IDS.has(value as SetupFlowId);
}

export function defaultFlowForHrState(hasHrSettings: boolean): SetupFlowId {
	return hasHrSettings ? "payroll" : "welcome";
}
