import { z } from "zod";

export const DISCIPLINARY_OFFENSE_TYPES = [
	"TARDINESS",
	"ABSENTEEISM",
	"MISCONDUCT",
	"POLICY_VIOLATION",
	"PERFORMANCE",
	"OTHER",
] as const;

export const DISCIPLINARY_SEVERITIES = ["LOW", "MEDIUM", "HIGH"] as const;

export const DISCIPLINARY_STATUSES = ["OPEN", "ONGOING", "RESOLVED", "DISMISSED"] as const;

const baseFields = {
	employeeId: z.string().min(1),
	offenseType: z.enum(DISCIPLINARY_OFFENSE_TYPES),
	offenseDate: z.coerce.date(),
	description: z.string().min(1),
	severity: z.enum(DISCIPLINARY_SEVERITIES).default("MEDIUM"),
	status: z.enum(DISCIPLINARY_STATUSES).default("OPEN"),
	actionTaken: z.string().optional(),
	resolutionNotes: z.string().optional(),
	attachmentDocumentId: z.string().optional(),
	metadata: z.any().optional(),
};

export const CreateDisciplinaryActionSchema = z.object(baseFields);

export const UpdateDisciplinaryActionSchema = z
	.object({
		...baseFields,
		employeeId: z.string().min(1).optional(),
	})
	.partial();

export type CreateDisciplinaryActionInput = z.infer<typeof CreateDisciplinaryActionSchema>;
export type UpdateDisciplinaryActionInput = z.infer<typeof UpdateDisciplinaryActionSchema>;
export type DisciplinaryActionInput = CreateDisciplinaryActionInput & { id: string };
