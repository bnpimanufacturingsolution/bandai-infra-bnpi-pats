import { z } from "zod";
import { isValidObjectId } from "~/lib/object-id";

// SOAStatus Enum
export const SOAStatus = z.enum([
	"DRAFT",
	"PENDING_REVIEW",
	"APPROVED",
	"PARTIALLY_REMITTED",
	"REMITTED",
	"RECONCILED",
	"DISPUTED",
	"CLOSED",
]);

export type SOAStatus = z.infer<typeof SOAStatus>;

// StatementOfAccount Schema (full, including ID)
export const StatementOfAccountSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	organizationId: z.string().min(1),
	soaNumber: z.string().min(1),
	name: z.string().min(1),
	startDate: z.coerce.date(),
	endDate: z.coerce.date(),
	dueDate: z.coerce.date().optional(),
	payrollPeriodIds: z.array(z.string().refine((val) => isValidObjectId(val))),
	totalEmployeeShare: z.number(),
	totalEmployerShare: z.number(),
	totalTax: z.number(),
	totalAmount: z.number(),
	totalRemitted: z.number(),
	totalOutstanding: z.number(),
	eppReferenceId: z.string().optional(),
	eppBillingId: z.string().optional(),
	eppReconciled: z.boolean(),
	eppReconciledAt: z.coerce.date().optional(),
	eppReconciledById: z.string().refine((val) => isValidObjectId(val)).optional(),
	remitteeName: z.string().optional(),
	remitteeAccount: z.string().optional(),
	remitteeDetails: z.any().optional(),
	status: SOAStatus,
	notes: z.string().optional(),
	description: z.string().optional(),
	metadata: z.any().optional(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type StatementOfAccount = z.infer<typeof StatementOfAccountSchema>;

const normalizeTaxAmountAlias = (input: unknown) => {
	if (!input || typeof input !== "object") return input;
	const value = { ...(input as Record<string, unknown>) };
	if (value.totalTax === undefined && value.taxAmount !== undefined) {
		value.totalTax = value.taxAmount;
	}
	return value;
};

const StatementOfAccountMutableSchema = StatementOfAccountSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
});

// Create StatementOfAccount Schema (excluding ID, createdAt, updatedAt)
export const CreateStatementofaccountSchema = z.preprocess(
	normalizeTaxAmountAlias,
	StatementOfAccountMutableSchema.partial({
		totalEmployeeShare: true,
		totalEmployerShare: true,
		totalTax: true,
		totalAmount: true,
		totalRemitted: true,
		totalOutstanding: true,
		dueDate: true,
		eppReferenceId: true,
		eppBillingId: true,
		eppReconciled: true,
		eppReconciledAt: true,
		eppReconciledById: true,
		remitteeName: true,
		remitteeAccount: true,
		remitteeDetails: true,
		status: true,
		notes: true,
		description: true,
		metadata: true,
		isDeleted: true,
		payrollPeriodIds: true,
	}),
);

export type CreateStatementofaccount = z.infer<typeof CreateStatementofaccountSchema>;

// Update StatementOfAccount Schema (all fields optional)
export const UpdateStatementofaccountSchema = z.preprocess(
	normalizeTaxAmountAlias,
	StatementOfAccountMutableSchema.partial(),
);

export type UpdateStatementofaccount = z.infer<typeof UpdateStatementofaccountSchema>;

export type StatementOfAccountWithRelations = StatementOfAccount & {};
