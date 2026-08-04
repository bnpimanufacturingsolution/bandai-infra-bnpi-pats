/**
 * BNPI compensation / adjustment ComCode catalog.
 * Source: BNPI payroll workbook ComCode list (BGE, DMA, AON, …).
 * Used when benefitType.name is just the code (e.g. "MTX") so Run Payroll
 * Payroll Adjustments can show CODE · human description.
 */

export type BnpiComCodeEntry = {
	code: string;
	description: string;
	/** BNPI type column when known */
	bnpiType?: string;
	/** Run Payroll chip filter bucket */
	filter:
		| "attendance"
		| "allowance"
		| "overtime"
		| "deduction"
		| "loan"
		| "other";
};

/** Canonical ComCode → description (from BNPI catalog screenshot + known HRIS labels). */
export const BNPI_COMCODE_CATALOG: Record<string, BnpiComCodeEntry> = {
	BGE: {
		code: "BGE",
		description: "Birthday Gift (Employee)",
		bnpiType: "INCENTIVE",
		filter: "other",
	},
	BGK: {
		code: "BGK",
		description: "Birthday Gift (Kid)",
		bnpiType: "INCENTIVE",
		filter: "other",
	},
	CGK: {
		code: "CGK",
		description: "Christmas Gift (Kid)",
		bnpiType: "INCENTIVE",
		filter: "other",
	},
	CGF: {
		code: "CGF",
		description: "1K Christmas Gift",
		bnpiType: "INCENTIVE",
		filter: "other",
	},
	DMA: {
		code: "DMA",
		description: "De Minimis Allowance",
		bnpiType: "ALLOWANCE",
		filter: "allowance",
	},
	ECD: {
		code: "ECD",
		description: "Excess Deduction",
		bnpiType: "ADJUSTMENT",
		filter: "deduction",
	},
	LLA: {
		code: "LLA",
		description: "Line Leader Allowance",
		bnpiType: "ALLOWANCE",
		filter: "allowance",
	},
	MLA: {
		code: "MLA",
		description: "Meal Allowance",
		bnpiType: "ALLOWANCE",
		filter: "allowance",
	},
	PFA: {
		code: "PFA",
		description: "Perfect Attendance",
		bnpiType: "INCENTIVE",
		filter: "attendance",
	},
	ANT: {
		code: "ANT",
		description: "Adjustment Non-Tax",
		bnpiType: "ADJUSTMENT",
		filter: "other",
	},
	AON: {
		code: "AON",
		description: "Adjustment OT/ND",
		bnpiType: "ADJUSTMENT",
		filter: "overtime",
	},
	ABS: {
		code: "ABS",
		description: "Adjustment Basic",
		bnpiType: "ADJUSTMENT",
		filter: "other",
	},
	OTC: {
		code: "OTC",
		description: "Other Compensation",
		bnpiType: "INCENTIVE",
		filter: "other",
	},
	OTM: {
		code: "OTM",
		description: "OT Meal Allowance",
		bnpiType: "ALLOWANCE",
		filter: "allowance",
	},
	AVL: {
		code: "AVL",
		description: "ACL/VL Conversion",
		bnpiType: "INCENTIVE",
		filter: "allowance",
	},
	AVLTAX: {
		code: "AVLTAX",
		description: "ACL/VL Conversion Tax",
		bnpiType: "INCENTIVE",
		filter: "other",
	},
	"13M": {
		code: "13M",
		description: "13th Month",
		bnpiType: "INCENTIVE",
		filter: "other",
	},
	"13A": {
		code: "13A",
		description: "13th Month Adjustment",
		bnpiType: "ADJUSTMENT",
		filter: "other",
	},
	PDI: {
		code: "PDI",
		description: "Production Incentives",
		bnpiType: "INCENTIVE",
		filter: "other",
	},
	TXR: {
		code: "TXR",
		description: "Tax Refund",
		bnpiType: "REFUND",
		filter: "other",
	},
	CTC: {
		code: "CTC",
		description: "Community Tax Certificate",
		bnpiType: "ONE-TIME",
		filter: "deduction",
	},
	AOL: {
		code: "AOL",
		description: "Adjustment Overused Leave",
		bnpiType: "ADJUSTMENT",
		filter: "other",
	},
	TSA: {
		code: "TSA",
		description: "Technical Skills Allowance",
		bnpiType: "ALLOWANCE",
		filter: "allowance",
	},
	// HRIS / mass-upload codes not always in the BNPI screenshot but live in DB
	MTX: {
		code: "MTX",
		description: "Matrix / Other Comp",
		bnpiType: "ALLOWANCE",
		filter: "other",
	},
	INC: {
		code: "INC",
		description: "Incentive",
		bnpiType: "INCENTIVE",
		filter: "other",
	},
	ARP: {
		code: "ARP",
		description: "Attendance Recognition Pay",
		bnpiType: "INCENTIVE",
		filter: "attendance",
	},
	OAD: {
		code: "OAD",
		description: "Other Compensation",
		bnpiType: "ADJUSTMENT",
		filter: "other",
	},
	OBA: {
		code: "OBA",
		description: "OB Allowance",
		bnpiType: "ALLOWANCE",
		filter: "allowance",
	},
	HYS: {
		code: "HYS",
		description: "HYS Meal Allowance",
		bnpiType: "ALLOWANCE",
		filter: "allowance",
	},
	LVP: {
		code: "LVP",
		description: "Leave Pay / ACL-VL Conversion",
		bnpiType: "ALLOWANCE",
		filter: "allowance",
	},
	UFD: {
		code: "UFD",
		description: "Uniform Deduction",
		bnpiType: "DEDUCTION",
		filter: "deduction",
	},
	MHDMF2: {
		code: "MHDMF2",
		description: "Modified HDMF 2",
		bnpiType: "DEDUCTION",
		filter: "deduction",
	},
	NEGADJ: {
		code: "NEGADJ",
		description: "Negative Adjustment",
		bnpiType: "ADJUSTMENT",
		filter: "deduction",
	},
	UNIDED: {
		code: "UNIDED",
		description: "Unidentified Deduction",
		bnpiType: "DEDUCTION",
		filter: "deduction",
	},
};

export function normalizeComCode(code: string | null | undefined): string {
	return String(code || "")
		.trim()
		.toUpperCase();
}

/**
 * Resolve a human-readable description for a benefit row.
 * Prefer real benefitType.name when it is not just the code;
 * then catalog; then cleaned benefitType.description; then enrollment name.
 */
export function resolveBenefitDisplay(input: {
	code?: string | null;
	typeName?: string | null;
	typeDescription?: string | null;
	enrollmentName?: string | null;
}): {
	code: string;
	description: string;
	/** Primary line: "CODE · Description" or description alone */
	title: string;
	/** Chip / source label (short) */
	sourceLabel: string;
	filter: BnpiComCodeEntry["filter"];
	fromCatalog: boolean;
} {
	const code = normalizeComCode(input.code);
	const catalog = code ? BNPI_COMCODE_CATALOG[code] : undefined;
	const typeName = String(input.typeName || "").trim();
	const typeDesc = String(input.typeDescription || "").trim();
	const enrollName = String(input.enrollmentName || "").trim();

	const typeNameIsUseful =
		Boolean(typeName) &&
		typeName.toUpperCase() !== code &&
		!/^needs_?confirmation/i.test(typeName);

	const typeDescIsUseful =
		Boolean(typeDesc) &&
		!/needs_?confirmation/i.test(typeDesc) &&
		!/^auto-created/i.test(typeDesc) &&
		typeDesc.toUpperCase() !== code;

	const enrollNameIsUseful =
		Boolean(enrollName) &&
		enrollName.toUpperCase() !== code &&
		enrollName.toUpperCase() !== typeName.toUpperCase();

	let description =
		(typeNameIsUseful ? typeName : "") ||
		catalog?.description ||
		(typeDescIsUseful ? typeDesc : "") ||
		(enrollNameIsUseful ? enrollName : "") ||
		typeName ||
		code ||
		"Payroll adjustment";

	// If we still only have the code, use catalog when present
	if (description.toUpperCase() === code && catalog?.description) {
		description = catalog.description;
	}

	const sourceLabel = catalog?.description || description;
	const title = code ? `${code} · ${description}` : description;

	return {
		code,
		description,
		title,
		sourceLabel,
		filter: catalog?.filter || "other",
		fromCatalog: Boolean(catalog),
	};
}
