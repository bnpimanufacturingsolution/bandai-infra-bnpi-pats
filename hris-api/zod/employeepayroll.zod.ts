import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

import type { Employee } from "./employee.zod";
import type { PayrollPeriod } from "./payrollperiod.zod";
import type { Timesheet } from "./timesheet.zod";

const PayrollRegisterNumberFieldNames = [
	"monthlySalary",
	"dailySalary",
	"hourlySalary",
	"numberOfDays",
	"lateUndertimeAmount",
	"regularOtHours",
	"restDayHours",
	"restDayHoursPay",
	"restDayOtHours",
	"restDayOtPay",
	"specialHolidayOtHours",
	"specialHolidayOtPay",
	"sunSpecialHolidayOtExcessHours",
	"sunSpecialHolidayOtExcessPay",
	"specialHolidayRestDayOtHours",
	"specialHolidayRestDayOtPay",
	"specialRestDayExcessHours",
	"specialRestDayExcessOtPay",
	"legalHolidayOtHours",
	"legalHolidayOtPay",
	"legalHolidayExcessPay",
	"legalHolidayRestDayPay",
	"legalHolidayExcess1Pay",
	"legalHolidayRestDayExcessPay",
	"leavePay",
	"christmasGift",
	"specialBonus",
	"mandatoryContributionAdjustment",
	"guaranteedBonus",
	"hysMealAllowance",
	"obAllowance",
	"otherAdjustment",
	"overtimeMealAllowance",
	"sportsfestOt",
	"fringeBenefit",
	"annualIncentive",
	"technicalSkillsAllowance",
	"aclVlConversionTaxable",
	"adjustmentOverusedLeave",
	"thirteenthMonthAdjustment",
	"productionIncentives",
	"otherCompensation",
	"adjustmentBasic",
	"adjustmentOtNd",
	"adjustmentNonTax",
	"excessDeduction",
	"deMinimisAllowance",
	"christmasGiftKid",
	"birthdayGiftKid",
	"birthdayGiftEmployee",
	"fringeBenefitTax",
	"sssEmergencyLoan",
	"philHealthContributionAdjustment",
	"excessInternetUsage",
	"taxPayable",
	"adjustmentBasicDeduction",
	"excessMlBenefits",
	"uniformDeduction",
	"sssLoanRestructuringProgram",
	"phicOnePercentDifferential",
	"modifiedHdmf2",
	"communityTaxCertificate",
	"hdmfContributionAdjustment",
	"personalCallsUsage",
	"healthInsurance",
	"shuttleService",
	"negativeAdjustment",
	"bnpiEmergencyLoan",
	"bnpiSalaryLoan",
	"rcbcLoan",
	"hdmfCalamityLoan",
	"hdmfSalaryLoan",
	"sssCalamityLoan",
	"sssSalaryLoan",
	"adjustmentHolidayPay",
	"communityTaxCert",
	"oneKChristmasGift",
	"taxRefund",
	"thirteenthMonthPay",
	"aclVlConversion",
	"otMealAllowance",
	"perfectAttendance",
	"mealAllowance",
	"lineLeaderAllowance",
	"totalReceivable",
] as const;
const PayrollRegisterNumberFields = Object.fromEntries(
	PayrollRegisterNumberFieldNames.map((field) => [field, z.number()]),
) as Record<(typeof PayrollRegisterNumberFieldNames)[number], z.ZodNumber>;

export const EmployeePayrollComputationRowSchema = z.object({
	label: z.string(),
	field: z.string(),
	operation: z.enum(["ADD", "SUBTRACT"]),
	amount: z.number(),
	payrollRole: z.enum([
		"INCLUDED_IN_GROSSPAY",
		"DEDUCTED_INSIDE_GROSSPAY",
		"DEDUCTED_AFTER_GROSSPAY",
		"ADDED_AFTER_NETPAY",
	]),
	explanation: z.string(),
	/** Present on employeeBenefit source lines for tax grouping in UI. */
	isTaxable: z.boolean().nullable().optional(),
	/** True when row comes from metadata.payrollSourceDetails (benefit/loan). */
	isBenefitSource: z.boolean().optional(),
});

export const EmployeePayrollComputationViewSchema = z.object({
	rateSummary: z.object({
		method: z.string(),
		monthlySalary: z.number(),
		dailySalary: z.number(),
		numberOfDays: z.number(),
		regularOtHours: z.number(),
		bnpiDailyRate: z.number(),
		bnpiHourlyRate: z.number(),
		rateNote: z.string(),
	}),
	grossPayRows: z.array(EmployeePayrollComputationRowSchema),
	grossPayFormula: z.object({
		rowsTotal: z.number(),
		targetGrossPay: z.number(),
		gap: z.number(),
	}),
	deductionRows: z.array(EmployeePayrollComputationRowSchema),
	deductionFormula: z.object({
		rowsTotal: z.number(),
		targetTotalDeductions: z.number(),
		gap: z.number(),
	}),
	netPayFormula: z.object({
		grossPay: z.number(),
		totalDeductions: z.number(),
		netPay: z.number(),
		gap: z.number(),
	}),
	postNetRows: z.array(EmployeePayrollComputationRowSchema),
	totalReceivableFormula: z.object({
		netPay: z.number(),
		postNetTotal: z.number(),
		totalReceivable: z.number(),
		gap: z.number(),
	}),
	supportingFields: z.object({
		leavePay: z.number(),
		allowances: z.number(),
		loanDeductions: z.number(),
		otherDeductions: z.number(),
	}),
});

export type EmployeePayrollComputationView = z.infer<
	typeof EmployeePayrollComputationViewSchema
>;

// EmployeePayroll Schema (full, including ID)
export const EmployeePayrollSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	organizationId: z.string().min(1),
	employeeId: z.string().refine((val) => isValidObjectId(val)),
	payrollPeriodId: z.string().refine((val) => isValidObjectId(val)),

	// Direct link to timesheet - source of truth (one-to-one)
	timesheetId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional()
		.nullable(),

	// Earnings
	basicPay: z.number(),
	overtimePay: z.number(),
	nightDiffPay: z.number(),
	holidayPay: z.number(),
	allowances: z.number(),
	bonuses: z.number(),

	// Deductions
	taxAmount: z.number(),
	sssContribution: z.number(),
	philHealthContribution: z.number(),
	pagibigContribution: z.number(),
	loanDeductions: z.number(),
	absentDeduction: z.number(),
	lateDeduction: z.number(),
	earlyOutDeduction: z.number(),
	otherDeductions: z.number(),

	// Totals
	grossPay: z.number(),
	taxableIncome: z.number(),
	totalDeductions: z.number(),
	netPay: z.number(),
	...PayrollRegisterNumberFields,

	// Timesheet snapshot - frozen at payroll generation time
	// Stores complete hours/attendance data for audit trail
	timesheetSnapshot: z.any().optional().nullable(), // JSON field

	// Payroll calculation metadata - rates and computation details
	metadata: z.any().optional().nullable(), // JSON field

	// Rate calculation breakdown - detailed formulas and step-by-step calculations
	rateBreakdown: z.any().optional().nullable(), // JSON field

	// Daily breakdown - day-by-day attendance and earnings detail
	dailyBreakdown: z.any().optional().nullable(), // JSON field

	// Status
	isPaid: z.boolean(),
	paidAt: z.coerce.date().optional().nullable(),
	paymentMethod: z.string().optional().nullable(),
	referenceNumber: z.string().optional().nullable(),
	isPublished: z.boolean(),
	publishedAt: z.coerce.date().optional().nullable(),
	publishedBy: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional()
		.nullable(),
	payslipGeneratedAt: z.coerce.date().optional().nullable(),
	payslipReleasedAt: z.coerce.date().optional().nullable(),
	payslipReleasedBy: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional()
		.nullable(),
	hasPaymentIssue: z.boolean(),
	paymentIssueAt: z.coerce.date().optional().nullable(),
	paymentIssueBy: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional()
		.nullable(),
	paymentIssueNote: z.string().optional().nullable(),
	snapshotLockedAt: z.coerce.date().optional().nullable(),
	snapshotLockedBy: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional()
		.nullable(),
	snapshotLockReason: z.string().optional().nullable(),
	generationRunId: z.string().optional().nullable(),
	generationKey: z.string().optional().nullable(),

	notes: z.string().optional().nullable(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type EmployeePayroll = z.infer<typeof EmployeePayrollSchema>;

// Create EmployeePayroll Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateEmployeePayrollSchema = EmployeePayrollSchema.omit({
	id: true,
	isDeleted: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	timesheetId: true,
	timesheetSnapshot: true,
	metadata: true,
	rateBreakdown: true,
	dailyBreakdown: true,
	absentDeduction: true,
	lateDeduction: true,
	earlyOutDeduction: true,
	...Object.fromEntries(PayrollRegisterNumberFieldNames.map((field) => [field, true] as const)),
	paidAt: true,
	paymentMethod: true,
	referenceNumber: true,
	publishedAt: true,
	publishedBy: true,
	payslipGeneratedAt: true,
	payslipReleasedAt: true,
	payslipReleasedBy: true,
	paymentIssueAt: true,
	paymentIssueBy: true,
	paymentIssueNote: true,
	snapshotLockedAt: true,
	snapshotLockedBy: true,
	snapshotLockReason: true,
	generationRunId: true,
	generationKey: true,
	notes: true,
});

export type CreateEmployeePayroll = z.infer<typeof CreateEmployeePayrollSchema>;

// Update EmployeePayroll Schema (partial, excluding immutable fields and relations)
export const UpdateEmployeePayrollSchema = EmployeePayrollSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
	organizationId: true, // Immutable
	employeeId: true, // Immutable
	payrollPeriodId: true, // Immutable
}).partial();

export type UpdateEmployeePayroll = z.infer<typeof UpdateEmployeePayrollSchema>;

export type EmployeePayrollWithRelations = EmployeePayroll & {
	employee: Employee;
	payrollPeriod: PayrollPeriod;
	timesheet?: Timesheet | null;
};
