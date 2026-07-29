import { z } from "zod";

export const SpecialPayrollRunStatusSchema = z.enum([
	"FINALIZED",
	"RELEASED",
	"CANCELLED",
]);

export type SpecialPayrollRunStatus = z.infer<typeof SpecialPayrollRunStatusSchema>;

export const SpecialPayrollManualRowSchema = z.object({
	employeeId: z.string().min(1).optional(),
	employeeNumber: z.string().min(1),
	compensationCode: z.string().min(1),
	amount: z.number().positive().finite(),
	employeeName: z.string().optional().nullable(),
	sourcePayDate: z.union([z.string(), z.coerce.date()]).optional().nullable(),
	sourceRowNumber: z.number().int().positive().optional().nullable(),
});

export const SpecialPayrollPreviewBodySchema = z.object({
	label: z.string().trim().min(1, "Run label is required").max(200),
	contextPayrollPeriodId: z.string().min(1).optional().nullable(),
	contextPeriodCode: z.string().optional().nullable(),
	/** Manual rows; import preview uses multipart file instead. */
	rows: z.array(SpecialPayrollManualRowSchema).min(1, "At least one row is required"),
});

export type SpecialPayrollPreviewBody = z.infer<typeof SpecialPayrollPreviewBodySchema>;

export const SpecialPayrollCreateBodySchema = z.object({
	previewId: z.string().min(1),
	idempotencyKey: z.string().min(8).max(200),
	label: z.string().trim().min(1).max(200).optional(),
	/** Optional re-send of rows for revalidation; if omitted, cache must still be valid. */
	rows: z.array(SpecialPayrollManualRowSchema).optional(),
	contextPayrollPeriodId: z.string().min(1).optional().nullable(),
	contextPeriodCode: z.string().optional().nullable(),
	sourceFilename: z.string().optional().nullable(),
	sourceHash: z.string().optional().nullable(),
	sourceFingerprint: z.string().optional().nullable(),
});

export type SpecialPayrollCreateBody = z.infer<typeof SpecialPayrollCreateBodySchema>;

export const SpecialPayrollCancelBodySchema = z.object({
	reason: z.string().trim().max(500).optional().nullable(),
});

export type SpecialPayrollCancelBody = z.infer<typeof SpecialPayrollCancelBodySchema>;
