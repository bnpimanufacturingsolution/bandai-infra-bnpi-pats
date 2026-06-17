import { z } from "zod";
import { CreatePersonSchema, UpdatePersonSchema } from "./person.zod";
import { UpdateUserSchema } from "./user.zod";
import { EmployeeScheduleAssignmentSchema } from "./schedule.zod";

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
	type: z.string().min(1, "Document type is required"),
	number: z.string().min(1, "Document number is required"),
	issueDate: z.coerce.date(),
	expiryDate: z.coerce.date().optional().nullable(),
});

export type EmployeeDocument = z.infer<typeof EmployeeDocumentSchema>;

// Employee Schema (full, including ID)
export const EmployeeSchema = z.object({
	id: z.string(),
	organizationId: z.string().min(1),
	employeeId: z.string().min(1),
	deviceEmpId: z.string().optional().nullable(),
	personId: z.string(),
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
	probationEndDate: z.coerce.date().optional(),
	departmentId: z.string(),
	positionId: z.string(),
	levelId: z.string().optional().nullable(),
	reportToId: z.string().optional().nullable(),
	schedule: EmployeeScheduleAssignmentSchema.optional().nullable(),
	workLocation: z.enum(["ONSITE", "REMOTE", "HYBRID"]),
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
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	attendances: z.array(z.string()),
	requests: z.array(z.string()),
	employeePayrolls: z.array(z.string()),
	employeeBenefits: z.array(z.string()),
	employeeLoans: z.array(z.string()),
	documents: z.array(EmployeeDocumentSchema),
});

export type Employee = z.infer<typeof EmployeeSchema>;

// Create Employee Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateEmployeeSchema = EmployeeSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	// Exclude relation arrays that are not directly writable on create payload
	attendances: true,
	requests: true,
	employeePayrolls: true,
	employeeBenefits: true,
	employeeLoans: true,
}).partial({
	userId: true,
	employmentStartDate: true,
	employmentTerminationDate: true,
	probationEndDate: true,
	reportToId: true,
	schedule: true,
	isDeleted: true,
	isManager: true,
	leaveBalances: true,
	leaveBalancesLastUpdated: true,
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
	// Exclude relation ID fields - these should be handled via relation syntax if needed
	personId: true,
	departmentId: true,
	positionId: true,
	reportToId: true,
}).partial();

export type UpdateEmployee = z.infer<typeof UpdateEmployeeSchema>;

export type EmployeeWithRelations = Employee & {};

// Composite schema for creating employee with account
export const CreateEmployeeWithAccountSchema = z.object({
	roleId: z.string(),
	person: CreatePersonSchema,
	employee: CreateEmployeeSchema.partial({
		personId: true, // personId is optional because person is created first in this flow
	}),
});

// Composite schema for updating employee with account
export const UpdateEmployeeWithAccountSchema = z.object({
	user: UpdateUserSchema.optional(),
	person: UpdatePersonSchema.optional(),
	employee: UpdateEmployeeSchema.optional(),
});
