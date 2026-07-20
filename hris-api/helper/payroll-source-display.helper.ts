/**
 * Display helpers for payroll source details (EmployeeBenefit / EmployeeLoan lines).
 * Primary label = enrollment / adjustment name; category = benefit type name.
 */

export type PayrollSourceDisplayDetail = {
	id?: string;
	source?: string | null;
	code?: string | null;
	name?: string | null;
	benefitTypeName?: string | null;
	direction?: string | null;
	reconciliationAction?: string | null;
	amount?: number | null;
};

export type PayrollSourceDisplayRole = "gross" | "postNet" | "deduction";

/** Register fields that can be fully represented by payrollSourceDetails (avoid double listing). */
export const PAYROLL_SOURCE_REGISTER_FIELD_BY_CODE: Record<string, string> = {
	DMA: "deMinimisAllowance",
	OBA: "obAllowance",
	AON: "adjustmentOtNd",
	PFA: "perfectAttendance",
	MLA: "mealAllowance",
	LLA: "lineLeaderAllowance",
	HYS: "hysMealAllowance",
	OTM: "otMealAllowance",
	TSA: "technicalSkillsAllowance",
	UFD: "uniformDeduction",
	MHDMF2: "modifiedHdmf2",
};

const REGISTER_FIELD_BY_TYPE_NAME: Record<string, string> = {
	deminimisallowance: "deMinimisAllowance",
	oballowance: "obAllowance",
	adjustmentotnd: "adjustmentOtNd",
	perfectattendance: "perfectAttendance",
	mealallowance: "mealAllowance",
	lineleaderallowance: "lineLeaderAllowance",
	hysmealallowance: "hysMealAllowance",
	otmealallowance: "otMealAllowance",
	overtimemealallownce: "otMealAllowance",
	technicalskillsallowance: "technicalSkillsAllowance",
	uniformdeduction: "uniformDeduction",
	modifiedhdmf2: "modifiedHdmf2",
};

const normalizeKey = (value: unknown): string =>
	String(value || "")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");

export function getPayrollSourceDisplayRole(
	detail: PayrollSourceDisplayDetail,
): PayrollSourceDisplayRole {
	const direction = String(detail.direction || "").toUpperCase();
	const action = String(detail.reconciliationAction || "").toUpperCase();
	if (direction === "LOAN" || direction === "DEDUCTION") {
		return "deduction";
	}
	if (action === "RECEIVABLE_ONLY") {
		return "postNet";
	}
	// NET_ADJUSTMENT and GROSS_INCLUDED (default) appear in gross section for display.
	return "gross";
}

export function formatPayrollSourcePrimaryLabel(detail: PayrollSourceDisplayDetail): string {
	const name = String(detail.name || "").trim();
	if (name) return name;
	const typeName = String(detail.benefitTypeName || "").trim();
	if (typeName) return typeName;
	return "Employee benefit";
}

/** Single-line label with category when enrollment name differs from type. */
export function formatPayrollSourceLabelWithCategory(
	detail: PayrollSourceDisplayDetail,
): string {
	const primary = formatPayrollSourcePrimaryLabel(detail);
	const typeName = String(detail.benefitTypeName || "").trim();
	if (typeName && normalizeKey(typeName) !== normalizeKey(primary)) {
		return `${primary} (${typeName})`;
	}
	return primary;
}

export function getCoveredRegisterFieldsFromSourceDetails(
	details: PayrollSourceDisplayDetail[],
): Set<string> {
	const covered = new Set<string>();
	for (const detail of details) {
		if (Math.abs(Number(detail.amount || 0)) < 0.005) continue;
		const code = String(detail.code || "").toUpperCase();
		if (code && PAYROLL_SOURCE_REGISTER_FIELD_BY_CODE[code]) {
			covered.add(PAYROLL_SOURCE_REGISTER_FIELD_BY_CODE[code]);
		}
		const typeKey = normalizeKey(detail.benefitTypeName);
		if (typeKey && REGISTER_FIELD_BY_TYPE_NAME[typeKey]) {
			covered.add(REGISTER_FIELD_BY_TYPE_NAME[typeKey]);
		}
		const nameKey = normalizeKey(detail.name);
		if (nameKey && REGISTER_FIELD_BY_TYPE_NAME[nameKey]) {
			covered.add(REGISTER_FIELD_BY_TYPE_NAME[nameKey]);
		}
	}
	return covered;
}

export function groupPayrollSourceDetailsByRole(details: PayrollSourceDisplayDetail[]) {
	const gross: PayrollSourceDisplayDetail[] = [];
	const postNet: PayrollSourceDisplayDetail[] = [];
	const deduction: PayrollSourceDisplayDetail[] = [];
	for (const detail of details) {
		if (Math.abs(Number(detail.amount || 0)) < 0.005) continue;
		const role = getPayrollSourceDisplayRole(detail);
		if (role === "postNet") postNet.push(detail);
		else if (role === "deduction") deduction.push(detail);
		else gross.push(detail);
	}
	return { gross, postNet, deduction };
}

export function asPayrollSourceDetails(value: unknown): PayrollSourceDisplayDetail[] {
	if (!Array.isArray(value)) return [];
	return value.filter(
		(item) => item && typeof item === "object" && Math.abs(Number((item as any).amount || 0)) >= 0.005,
	) as PayrollSourceDisplayDetail[];
}
