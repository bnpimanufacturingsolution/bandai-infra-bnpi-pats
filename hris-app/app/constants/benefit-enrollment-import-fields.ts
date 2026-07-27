/** Canonical keys for benefit enrollment bulk import (API targets). */

export type BenefitEnrollmentImportField = {
	key: string;
	label: string;
	required?: boolean;
	description?: string;
	aliases?: string[];
};

/**
 * Template / preferred column order:
 * BENEFIT_CODE, AMOUNT, EMPLOYEE_NUMBER, EMPLOYEE_NAME, START_DATE, END_DATE, then optional rest.
 */
export const BENEFIT_ENROLLMENT_REQUIRED_FIELDS: BenefitEnrollmentImportField[] = [
	{
		key: "BENEFIT_CODE",
		label: "Benefit code",
		required: true,
		description: "Benefit type code (e.g. LLA). Prefer this over type name.",
		aliases: ["COMCODE", "ComCode", "CODE", "BenefitCode", "BENEFITCODE"],
	},
	{
		key: "AMOUNT",
		label: "Amount",
		required: true,
		description: "Amount per payroll period",
		aliases: ["Amount"],
	},
	{
		key: "EMPLOYEE_NUMBER",
		label: "Employee number",
		required: true,
		description: "HR employee number (e.g. 01466)",
		aliases: ["EmployeeID", "Employee ID", "EMP_ID", "EmpID", "EMPLOYEEID", "EMPLOYEE"],
	},
	{
		key: "START_DATE",
		label: "Start date",
		required: true,
		description: "When the benefit starts (DD/MM/YYYY or YYYY-MM-DD)",
		aliases: ["StartPayDate", "Start Pay Date", "STARTDATE", "Start Date"],
	},
];

export const BENEFIT_ENROLLMENT_OPTIONAL_FIELDS: BenefitEnrollmentImportField[] = [
	{
		key: "EMPLOYEE_NAME",
		label: "Employee name",
		description: "Display only; not used for matching",
		aliases: ["EmployeeName", "Employee Name", "NAME_EMPLOYEE"],
	},
	{
		key: "END_DATE",
		label: "End date",
		description: "Leave empty for open-ended",
		aliases: ["EndDate", "End Date"],
	},
	{
		key: "BENEFIT_TYPE",
		label: "Benefit type name",
		description: "Fallback when BENEFIT_CODE is not present",
		aliases: ["Benefit Type", "BenefitType", "BENEFIT"],
	},
	{
		key: "NAME",
		label: "Enrollment name",
		description: "Defaults to benefit type name when empty",
		aliases: ["Enrollment Name", "EnrollmentName"],
	},
	{
		key: "DESCRIPTION",
		label: "Description",
		aliases: ["Description"],
	},
	{
		key: "NOTES",
		label: "Notes",
		aliases: ["Notes", "Remarks"],
	},
];

export const ALL_BENEFIT_ENROLLMENT_IMPORT_FIELDS = [
	...BENEFIT_ENROLLMENT_REQUIRED_FIELDS,
	...BENEFIT_ENROLLMENT_OPTIONAL_FIELDS,
];

/**
 * Downloadable template column order (exact headers for auto-map).
 * No IS_ACTIVE — import always creates active enrollments.
 */
export const BENEFIT_ENROLLMENT_TEMPLATE_HEADERS = [
	"BENEFIT_CODE",
	"AMOUNT",
	"EMPLOYEE_NUMBER",
	"EMPLOYEE_NAME",
	"START_DATE",
	"END_DATE",
	"NAME",
	"DESCRIPTION",
	"NOTES",
] as const;

/** Sample values aligned 1:1 with TEMPLATE_HEADERS (no commas in cells). */
export const BENEFIT_ENROLLMENT_TEMPLATE_EXAMPLE_ROW = [
	"LLA",
	"250.00",
	"01466",
	"Ma Angelica N. Leyesa",
	"26/06/2026",
	"",
	"",
	"",
	"",
] as const;
