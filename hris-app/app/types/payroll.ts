// Payroll-related types
export interface PayrollItem {
	id: string;
	employeeId: string;
	period: string;
	payDate: string;
	grossPay: number;
	netPay: number;
	status: PayrollStatus;
	deductions: Deduction[];
	bonuses: Bonus[];
	overtime: OvertimeItem[];
	hoursWorked: number;
	hourlyRate?: number;
	salary?: number;
}

export type PayrollStatus = "pending" | "processed" | "paid" | "cancelled";

export interface Deduction {
	id: string;
	type: DeductionType;
	name: string;
	amount: number;
	percentage?: number;
	isMandatory: boolean;
}

export type DeductionType = "tax" | "insurance" | "retirement" | "loan" | "advance" | "other";

export interface Bonus {
	id: string;
	type: BonusType;
	name: string;
	amount: number;
	description?: string;
}

export type BonusType =
	| "performance"
	| "attendance"
	| "holiday"
	| "overtime"
	| "commission"
	| "other";

export interface OvertimeItem {
	id: string;
	date: string;
	hours: number;
	rate: number;
	amount: number;
	approvedBy?: string;
}

export interface PayrollSummary {
	totalEmployees: number;
	totalGrossPay: number;
	totalDeductions: number;
	totalNetPay: number;
	totalBonuses: number;
	period: string;
}

export interface Payslip {
	id: string;
	employeeId: string;
	employeeName: string;
	period: string;
	payDate: string;
	grossPay: number;
	netPay: number;
	deductions: Deduction[];
	bonuses: Bonus[];
	overtime: OvertimeItem[];
	hoursWorked: number;
	hourlyRate?: number;
	salary?: number;
	status: PayrollStatus;
	generatedAt: string;
	generatedBy: string;
}
