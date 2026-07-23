/**
 * Display helpers for payroll source benefit lines (taxable / non-taxable grouping).
 * Mirrors hris-api `payroll-source-display.helper` tax split for HTML payslip + HR detail.
 */

export type PayrollBenefitDisplayDetail = {
	id?: string;
	source?: string | null;
	code?: string | null;
	name?: string | null;
	benefitTypeName?: string | null;
	direction?: string | null;
	reconciliationAction?: string | null;
	isTaxable?: boolean | null;
	amount?: number | null;
	[key: string]: unknown;
};

export type PayrollBenefitTaxGroup = "nonTaxable" | "taxable";

/** Unknown isTaxable is treated as taxable for safer disclosure on older frozen rows. */
export function isDisplayedAsTaxable(detail: PayrollBenefitDisplayDetail): boolean {
	return detail.isTaxable !== false;
}

export function partitionBenefitDetailsByTaxability<T extends PayrollBenefitDisplayDetail>(
	details: T[],
): { nonTaxable: T[]; taxable: T[] } {
	const nonTaxable: T[] = [];
	const taxable: T[] = [];
	for (const detail of details) {
		if (Math.abs(Number(detail.amount || 0)) < 0.005) continue;
		if (isDisplayedAsTaxable(detail)) taxable.push(detail);
		else nonTaxable.push(detail);
	}
	return { nonTaxable, taxable };
}

export function primaryBenefitLabel(detail: PayrollBenefitDisplayDetail): string {
	const name = String(detail.name || "").trim();
	if (name) return name;
	const typeName = String(detail.benefitTypeName || "").trim();
	if (typeName) return typeName;
	return "Employee benefit";
}

export function secondaryBenefitCategory(detail: PayrollBenefitDisplayDetail): string | null {
	const primary = primaryBenefitLabel(detail);
	const typeName = String(detail.benefitTypeName || "").trim();
	if (!typeName) return null;
	if (typeName.toLowerCase() === primary.toLowerCase()) return null;
	return typeName;
}

/** Ordered tax sections for UI (non-taxable first). */
export function benefitTaxSections<T extends PayrollBenefitDisplayDetail>(
	details: T[],
): Array<{ key: PayrollBenefitTaxGroup; label: string; items: T[] }> {
	const { nonTaxable, taxable } = partitionBenefitDetailsByTaxability(details);
	const sections: Array<{ key: PayrollBenefitTaxGroup; label: string; items: T[] }> = [];
	if (nonTaxable.length) {
		sections.push({ key: "nonTaxable", label: "Non-taxable", items: nonTaxable });
	}
	if (taxable.length) {
		sections.push({ key: "taxable", label: "Taxable", items: taxable });
	}
	return sections;
}
