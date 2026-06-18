import type { StatementOfAccount } from "~/zod/statementofaccount.zod";
import type { SOALineItem } from "~/zod/soalineitem.zod";
import type { SOARemittance } from "~/zod/soaremittance.zod";

export type StatementOfAccountBillingRow = Pick<
	StatementOfAccount,
	| "id"
	| "soaNumber"
	| "name"
	| "startDate"
	| "endDate"
	| "dueDate"
	| "totalAmount"
	| "totalRemitted"
	| "totalOutstanding"
	| "status"
	| "eppReconciled"
	| "remitteeName"
>;

const ORG_ID = "bandai-ph-org";
const NOW = new Date("2026-03-04T09:00:00.000Z");

export const MOCK_SOA_BILLINGS: StatementOfAccountBillingRow[] = [
	{
		id: "65f100000000000000000001",
		soaNumber: "SOA-2026-0001",
		name: "January 2026 Government Contributions",
		startDate: new Date("2026-01-01"),
		endDate: new Date("2026-01-15"),
		dueDate: new Date("2026-01-25"),
		totalAmount: 128450.75,
		totalRemitted: 0,
		totalOutstanding: 128450.75,
		status: "DRAFT",
		eppReconciled: false,
		remitteeName: "SSS",
	},
	{
		id: "65f100000000000000000002",
		soaNumber: "SOA-2026-0002",
		name: "January 2026 PhilHealth Billing",
		startDate: new Date("2026-01-16"),
		endDate: new Date("2026-01-31"),
		dueDate: new Date("2026-02-10"),
		totalAmount: 117890.5,
		totalRemitted: 0,
		totalOutstanding: 117890.5,
		status: "PENDING_REVIEW",
		eppReconciled: false,
		remitteeName: "PhilHealth",
	},
	{
		id: "65f100000000000000000003",
		soaNumber: "SOA-2026-0003",
		name: "February 2026 Pag-IBIG Billing",
		startDate: new Date("2026-02-01"),
		endDate: new Date("2026-02-15"),
		dueDate: new Date("2026-02-25"),
		totalAmount: 108620.0,
		totalRemitted: 0,
		totalOutstanding: 108620.0,
		status: "APPROVED",
		eppReconciled: false,
		remitteeName: "Pag-IBIG",
	},
	{
		id: "65f100000000000000000004",
		soaNumber: "SOA-2026-0004",
		name: "February 2026 SSS Billing",
		startDate: new Date("2026-02-16"),
		endDate: new Date("2026-02-28"),
		dueDate: new Date("2026-03-10"),
		totalAmount: 132300.25,
		totalRemitted: 60000.0,
		totalOutstanding: 72300.25,
		status: "PARTIALLY_REMITTED",
		eppReconciled: false,
		remitteeName: "SSS",
	},
	{
		id: "65f100000000000000000005",
		soaNumber: "SOA-2026-0005",
		name: "March 2026 PhilHealth Billing",
		startDate: new Date("2026-03-01"),
		endDate: new Date("2026-03-15"),
		dueDate: new Date("2026-03-25"),
		totalAmount: 125000.0,
		totalRemitted: 125000.0,
		totalOutstanding: 0,
		status: "REMITTED",
		eppReconciled: false,
		remitteeName: "PhilHealth",
	},
	{
		id: "65f100000000000000000006",
		soaNumber: "SOA-2026-0006",
		name: "March 2026 Pag-IBIG Billing",
		startDate: new Date("2026-03-16"),
		endDate: new Date("2026-03-31"),
		dueDate: new Date("2026-04-10"),
		totalAmount: 118440.0,
		totalRemitted: 118440.0,
		totalOutstanding: 0,
		status: "CLOSED",
		eppReconciled: true,
		remitteeName: "Pag-IBIG",
	},
	{
		id: "65f100000000000000000007",
		soaNumber: "SOA-2026-0007",
		name: "April 2026 SSS Billing",
		startDate: new Date("2026-04-01"),
		endDate: new Date("2026-04-15"),
		dueDate: new Date("2026-04-25"),
		totalAmount: 130220.0,
		totalRemitted: 0,
		totalOutstanding: 130220.0,
		status: "DISPUTED",
		eppReconciled: false,
		remitteeName: "SSS",
	},
];

export const MOCK_SOA_DETAILS: StatementOfAccount[] = MOCK_SOA_BILLINGS.map((billing) => ({
	id: billing.id,
	organizationId: ORG_ID,
	soaNumber: billing.soaNumber,
	name: billing.name,
	startDate: billing.startDate,
	endDate: billing.endDate,
	dueDate: billing.dueDate,
	payrollPeriodIds: ["65f10000000000000000a001", "65f10000000000000000a002"],
	totalEmployeeShare: Number((billing.totalAmount * 0.45).toFixed(2)),
	totalEmployerShare: Number((billing.totalAmount * 0.55).toFixed(2)),
	totalTax: Number((billing.totalAmount * 0.08).toFixed(2)),
	totalAmount: billing.totalAmount,
	totalRemitted: billing.totalRemitted,
	totalOutstanding: billing.totalOutstanding,
	eppReferenceId: `EPP-REF-${billing.soaNumber.split("-").pop()}`,
	eppBillingId: `EPP-BILL-${billing.soaNumber.split("-").pop()}`,
	eppReconciled: billing.eppReconciled,
	eppReconciledAt: billing.eppReconciled ? new Date("2026-04-12") : undefined,
	eppReconciledById: billing.eppReconciled ? "65f10000000000000000f001" : undefined,
	remitteeName: billing.remitteeName,
	remitteeAccount: billing.remitteeName ? `${billing.remitteeName}-PAYABLE` : undefined,
	remitteeDetails: {
		channel: "Bank Transfer",
		bank: "BPI Corporate",
	},
	status: billing.status,
	notes: billing.status === "DISPUTED" ? "Amount discrepancy raised by finance." : undefined,
	description: `Billing details for ${billing.soaNumber}`,
	metadata: {
		source: "mock",
	},
	isDeleted: false,
	createdAt: NOW,
	updatedAt: NOW,
}));

export const MOCK_SOA_LINE_ITEMS: SOALineItem[] = [
	{
		id: "65f200000000000000000001",
		statementOfAccountId: "65f100000000000000000004",
		category: "SSS Employee Share",
		description: "Employee contribution component",
		employeePayrollId: "65f300000000000000000001",
		taxableAmount: 60333.6,
		taxAmount: 4826.69,
		employeeShare: 27150.12,
		employerShare: 33183.48,
		totalAmount: 60333.6,
		metadata: { source: "payroll" },
		createdAt: NOW,
		updatedAt: NOW,
	},
	{
		id: "65f200000000000000000002",
		statementOfAccountId: "65f100000000000000000004",
		category: "SSS Employer Share",
		description: "Employer contribution component",
		employeePayrollId: "65f300000000000000000002",
		taxableAmount: 71966.65,
		taxAmount: 5757.33,
		employeeShare: 32400.0,
		employerShare: 39566.65,
		totalAmount: 71966.65,
		metadata: { source: "payroll" },
		createdAt: NOW,
		updatedAt: NOW,
	},
	{
		id: "65f200000000000000000003",
		statementOfAccountId: "65f100000000000000000007",
		category: "SSS Employee Share",
		description: "Employee contribution component",
		employeePayrollId: "65f300000000000000000003",
		taxableAmount: 63500.0,
		taxAmount: 5080.0,
		employeeShare: 28600.0,
		employerShare: 34900.0,
		totalAmount: 63500.0,
		metadata: { source: "payroll" },
		createdAt: NOW,
		updatedAt: NOW,
	},
	{
		id: "65f200000000000000000004",
		statementOfAccountId: "65f100000000000000000007",
		category: "SSS Employer Share",
		description: "Employer contribution component",
		employeePayrollId: "65f300000000000000000004",
		taxableAmount: 66720.0,
		taxAmount: 5337.6,
		employeeShare: 30000.0,
		employerShare: 36720.0,
		totalAmount: 66720.0,
		metadata: { source: "payroll" },
		createdAt: NOW,
		updatedAt: NOW,
	},
	{
		id: "65f200000000000000000005",
		statementOfAccountId: "65f100000000000000000005",
		category: "PhilHealth Contributions",
		description: "Monthly PhilHealth remittance basis",
		employeePayrollId: "65f300000000000000000005",
		taxableAmount: 125000.0,
		taxAmount: 10000.0,
		employeeShare: 56250.0,
		employerShare: 68750.0,
		totalAmount: 125000.0,
		metadata: { source: "payroll" },
		createdAt: NOW,
		updatedAt: NOW,
	},
];

export const MOCK_SOA_REMITTANCES: SOARemittance[] = [
	{
		id: "65f400000000000000000001",
		statementOfAccountId: "65f100000000000000000004",
		amount: 60000.0,
		paymentMethod: "BANK_TRANSFER",
		referenceNumber: "BPI-TRX-SSS-0004",
		paymentDate: new Date("2026-03-05"),
		category: "PARTIAL_PAYMENT",
		status: "CONFIRMED",
		notes: "First tranche remittance posted.",
		metadata: { source: "treasury" },
		createdAt: NOW,
		updatedAt: NOW,
	},
	{
		id: "65f400000000000000000002",
		statementOfAccountId: "65f100000000000000000005",
		amount: 125000.0,
		paymentMethod: "BANK_TRANSFER",
		referenceNumber: "BPI-TRX-PHIC-0005",
		paymentDate: new Date("2026-03-18"),
		category: "FULL_PAYMENT",
		status: "REMITTED",
		notes: "Fully remitted.",
		metadata: { source: "treasury" },
		createdAt: NOW,
		updatedAt: NOW,
	},
	{
		id: "65f400000000000000000003",
		statementOfAccountId: "65f100000000000000000006",
		amount: 118440.0,
		paymentMethod: "BANK_TRANSFER",
		referenceNumber: "BPI-TRX-HD-0006",
		paymentDate: new Date("2026-04-08"),
		category: "FULL_PAYMENT",
		status: "CONFIRMED",
		notes: "Matched with EPP billing entry.",
		metadata: { source: "treasury" },
		createdAt: NOW,
		updatedAt: NOW,
	},
];

export const getMockSoaById = (id: string) =>
	MOCK_SOA_DETAILS.find((item) => item.id === id) || null;

export const getMockSoaLineItemsBySoaId = (statementOfAccountId: string) =>
	MOCK_SOA_LINE_ITEMS.filter((item) => item.statementOfAccountId === statementOfAccountId);

export const getMockSoaRemittancesBySoaId = (statementOfAccountId: string) =>
	MOCK_SOA_REMITTANCES.filter((item) => item.statementOfAccountId === statementOfAccountId);

export const getMockReconciliationQueue = () =>
	MOCK_SOA_BILLINGS.filter(
		(item) =>
			!item.eppReconciled || item.status === "PARTIALLY_REMITTED" || item.status === "DISPUTED",
	);
