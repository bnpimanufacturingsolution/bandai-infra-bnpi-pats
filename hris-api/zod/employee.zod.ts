import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";
import { CreatePersonSchema, UpdatePersonSchema } from "./person.zod";
import { UpdateUserSchema } from "./user.zod";
import {
	createEmployeeBenefitScheduleSchema,
	CreateEmployeeBenefitInputSchema,
} from "./employeebenefit.zod";

// EmploymentStatus Enum
export const EmploymentStatus = z.enum([
	"ACTIVE",
	"RESIGNATION_REQUESTED",
	"SERVING_NOTICE",
	"OFFBOARDING",
	"ONBOARDING",
	"INACTIVE",
	"TERMINATED",
	"RESIGNED",
	"FORMER_EMPLOYEE",
	"RETIRED",
	"ON_LEAVE",
]);

export type EmploymentStatus = z.infer<typeof EmploymentStatus>;

// EmploymentType Enum
export const EmploymentType = z.enum([
	"REGULAR",
	"PROBATIONARY",
	"CONTRACTUAL",
	"PART_TIME",
	"CONSULTANT",
	"INTERN",
]);

export type EmploymentType = z.infer<typeof EmploymentType>;

// PayFrequency Enum
export const PayFrequency = z.enum([
	"DAILY",
	"WEEKLY",
	"BIWEEKLY",
	"SEMI_MONTHLY",
	"MONTHLY",
	"QUARTERLY",
	"ANNUALLY",
]);

export type PayFrequency = z.infer<typeof PayFrequency>;

// WorkLocation Enum
export const WorkLocation = z.enum(["ONSITE", "REMOTE", "HYBRID"]);

export type WorkLocation = z.infer<typeof WorkLocation>;

export const WorkforceSource = z.enum(["DIRECT", "AGENCY"]);

export type WorkforceSource = z.infer<typeof WorkforceSource>;

// Leave type codes are master-data driven. DM3 imports client codes such as VL, SL, and ACL.
export const LeaveType = z.string().trim().min(1);

export type LeaveType = z.infer<typeof LeaveType>;

// LeaveBalanceDetail Schema (for input - available is optional and will be calculated)
export const LeaveBalanceDetailSchema = z
	.object({
		leaveType: LeaveType,
		totalEntitled: z.number().nonnegative(),
		used: z.number().nonnegative().default(0),
		pending: z.number().nonnegative().default(0),
		available: z.number().nonnegative().optional(), // Optional in input, will be calculated
		carriedOver: z.number().nonnegative().optional().nullable(),
		maxCarryOver: z.number().nonnegative().optional().nullable(),
		periodStart: z.coerce.date(),
		periodEnd: z.coerce.date(),
	})
	.transform((data) => {
		// Calculate available if not provided
		const used = data.used ?? 0;
		const pending = data.pending ?? 0;
		const available = data.available ?? data.totalEntitled - used - pending;
		return {
			...data,
			used,
			pending,
			available,
		};
	});

export type LeaveBalanceDetail = z.infer<typeof LeaveBalanceDetailSchema>;

// EmployeeDocument Schema
export const EmployeeDocumentSchema = z.object({
	name: z.string().min(1, "Document name is required"),
	type: z.string().min(1, "Document type is required"),
	documentTypeId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional()
		.nullable(),
	number: z.string().min(1, "Document number is required").optional().nullable(),
	issueDate: z.coerce.date().optional().nullable(),
	expiryDate: z.coerce.date().optional().nullable(),
	fileUrl: z.string().optional().nullable(),
	ext: z.string().optional().nullable(),
	fieldValues: z.record(z.any()).optional().nullable(),
	metadata: z.any().optional().nullable(),
});

export type EmployeeDocument = z.infer<typeof EmployeeDocumentSchema>;

const parseTimeToMinutes = (value?: unknown) => {
	const text = String(value || "").trim();
	const match = text.match(/^(\d{1,2}):(\d{2})$/);
	if (!match) return null;
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
	if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
	return hours * 60 + minutes;
};

const hasValidWorkSlot = (snapshot: any) => {
	if (!snapshot || snapshot.isOff === true) return true;
	const slots = Array.isArray(snapshot.timeSlots) ? snapshot.timeSlots : [];
	const workSlots = slots.filter((slot: any) => String(slot?.type || "work").toLowerCase() === "work");
	return workSlots.some((slot: any) => {
		const start = parseTimeToMinutes(slot?.startTime);
		const end = parseTimeToMinutes(slot?.endTime);
		if (start === null || end === null) return false;
		return end !== start;
	});
};

const ShiftTypeSnapshotSchema = z.object({
	name: z.string().optional().nullable(),
	code: z.string().optional().nullable(),
	isOvernight: z.boolean().optional(),
	isOff: z.boolean().optional(),
	timeSlots: z
		.array(
			z.object({
				type: z.string(),
				label: z.string().optional().nullable(),
				startTime: z.string(),
				endTime: z.string(),
			}),
		)
		.optional(),
});

const EmployeeEmbeddedScheduleDaySchema = z.object({
	day: z.number().int().min(1),
	shiftTypeId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional()
		.nullable(),
	shiftSnapshot: ShiftTypeSnapshotSchema.optional().nullable(),
}).superRefine((value, ctx) => {
	if (value.shiftTypeId || !value.shiftSnapshot) return;
	if (!hasValidWorkSlot(value.shiftSnapshot)) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "Manual schedule days need at least one work slot with different start and end times.",
			path: ["shiftSnapshot", "timeSlots"],
		});
	}
});

const EmployeeEmbeddedScheduleSchema = z.object({
	templateId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional()
		.nullable(),
	templateCode: z.string().optional().nullable(),
	templateName: z.string().optional().nullable(),
	cycleDays: z.number().int().min(1),
	graceLateMinutes: z.number().int().min(0).optional().nullable(),
	graceEarlyOutMinutes: z.number().int().min(0).optional().nullable(),
	pattern: z.array(EmployeeEmbeddedScheduleDaySchema),
	effectiveStartDate: z.coerce.date().optional().nullable(),
	assignedAt: z.coerce.date().optional().nullable(),
	assignedByEmployeeId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional()
		.nullable(),
	reason: z.string().optional().nullable(),
	version: z.number().int().optional().nullable(),
});

// Employee Schema (full, including ID)
export const EmployeeSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	organizationId: z.string().min(1),
	employeeId: z.string().min(1),
	deviceEmpId: z.string().optional().nullable(),
	personId: z.string().refine((val) => isValidObjectId(val)),
	userId: z.string().optional(),
	role: z.string().optional(),
	employmentHireDate: z.coerce.date(),
	employmentStartDate: z.coerce.date().optional(),
	employmentTerminationDate: z.coerce.date().optional(),
	employmentStatus: EmploymentStatus,
	employmentType: z.enum([
		"REGULAR",
		"PROBATIONARY",
		"CONTRACTUAL",
		"PART_TIME",
		"CONSULTANT",
		"INTERN",
	]),
	workforceSource: WorkforceSource.default("DIRECT"),
	agencyId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional()
		.nullable(),
	probationEndDate: z.coerce.date().optional(),
	departmentId: z.string().refine((val) => isValidObjectId(val)),
	sectionId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional()
		.nullable(),
	positionId: z.string().refine((val) => isValidObjectId(val)),
	levelId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional()
		.nullable(),
	embeddedSchedule: EmployeeEmbeddedScheduleSchema.optional().nullable(),
	reportToId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional()
		.nullable(),
	workLocation: z.enum(["ONSITE", "REMOTE", "HYBRID"]),
	pregnant: z.boolean().optional(),
	expectedDueDate: z.coerce.date().optional().nullable(),
	leaveBalances: z.array(LeaveBalanceDetailSchema).optional(),
	leaveBalancesLastUpdated: z.coerce.date().optional().nullable(),
	basicSalary: z.number(),
	currency: z.string().min(1),
	payFrequency: PayFrequency,
	isTour: z.boolean().optional().default(false),
	isDeleted: z.boolean(),
	isManager: z.boolean(),
	/** true when role is hris-hr-manager (mutually exclusive with isManager) */
	isHrManager: z.boolean().optional().default(false),
	employmentHistory: z.array(z.any()).default([]),
	metadata: z.any().optional(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	attendances: z.array(z.string()),
	requests: z.array(z.string()),
	employeePayrolls: z.array(z.string()),
	employeeBenefits: z
		.array(
			createEmployeeBenefitScheduleSchema(
				CreateEmployeeBenefitInputSchema.extend({ id: z.string().optional() }),
			),
		)
		.or(z.array(z.string())),
	employeeLoans: z.array(z.string()),
	documents: z.array(EmployeeDocumentSchema),
});

export type Employee = z.infer<typeof EmployeeSchema>;

// Create Employee Base Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateEmployeeBaseSchema = EmployeeSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	// Exclude relation arrays that are not directly writable on create payload
	attendances: true,
	requests: true,
	employeePayrolls: true,
	employeeBenefits: true,
	employeeLoans: true,
})
	.partial({
		userId: true,
		role: true,
		employmentStartDate: true,
		employmentTerminationDate: true,
		probationEndDate: true,
		reportToId: true,
		isDeleted: true,
		isManager: true,
		isHrManager: true,
		leaveBalances: true,
		leaveBalancesLastUpdated: true,
	})
	.extend({
		employeeBenefits: z
			.array(
				createEmployeeBenefitScheduleSchema(
					CreateEmployeeBenefitInputSchema.omit({
						employeeId: true, // Employee ID is not known at creation
					}).extend({ id: z.string().optional(), employeeId: z.string().optional() }),
				),
			)
			.optional(),
	});

// Create Employee Schema with business-rule refinement
export const CreateEmployeeSchema = CreateEmployeeBaseSchema.superRefine((data, ctx) => {
	if (data.workforceSource === "AGENCY" && !data.agencyId) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["agencyId"],
			message: "agencyId is required when workforceSource is AGENCY",
		});
	}
});

export type CreateEmployee = z.infer<typeof CreateEmployeeSchema>;

// Update Employee Schema (partial, excluding immutable fields and relations)
export const UpdateEmployeeSchema = EmployeeSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	// Usually controlled by dedicated endpoints/soft-delete logic
	isDeleted: true,
	// Exclude relation arrays; nested updates are not handled here
	attendances: true,
	requests: true,
	employeePayrolls: true,
	employeeBenefits: true,
	employeeLoans: true,
	// Exclude personId as it should not change after employee is created
	personId: true,
})
	.extend({
		employeeBenefits: z.array(
			createEmployeeBenefitScheduleSchema(
				CreateEmployeeBenefitInputSchema.extend({ id: z.string().optional() }),
			),
		),
	})
	.partial()
	.superRefine((data, ctx) => {
		if (data.workforceSource === "AGENCY" && !data.agencyId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["agencyId"],
				message: "agencyId is required when workforceSource is AGENCY",
			});
		}
	});

export type UpdateEmployee = z.infer<typeof UpdateEmployeeSchema>;

export type EmployeeWithRelations = Employee & {};

// Composite schema for creating employee with account
export const CreateEmployeeWithAccountSchema = z.object({
	roleId: z.string(),
	person: CreatePersonSchema,
	employee: CreateEmployeeBaseSchema.partial({
		personId: true, // personId is optional because person is created first in this flow
	}).superRefine((data, ctx) => {
		if (data.workforceSource === "AGENCY" && !data.agencyId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["agencyId"],
				message: "agencyId is required when workforceSource is AGENCY",
			});
		}
	}),
});

// Composite schema for updating employee with account
export const UpdateEmployeeWithAccountSchema = z.object({
	user: UpdateUserSchema.optional(),
	person: UpdatePersonSchema.optional(),
	employee: UpdateEmployeeSchema.optional(),
});
