/** Canonical Special Payroll workbook template columns. */
export const SPECIAL_PAYROLL_TEMPLATE_HEADERS = [
	"COMPENSATION_CODE",
	"AMOUNT",
	"EMPLOYEE_NUMBER",
	"EMPLOYEE_NAME",
	"START_PAY_DATE",
] as const;

/** Sample workbook aliases that must map to the template fields. */
export const SPECIAL_PAYROLL_HEADER_ALIASES: Record<string, string> = {
	COMCODE: "COMPENSATION_CODE",
	Amount: "AMOUNT",
	EmployeeID: "EMPLOYEE_NUMBER",
	EmployeeName: "EMPLOYEE_NAME",
	StartPayDate: "START_PAY_DATE",
};

export const SPECIAL_PAYROLL_RUN_TYPE_LABEL = "Special Payroll";
