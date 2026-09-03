import { z } from "zod";

/** String limits aligned with typical API / DB varchar usage */
export const EMPLOYEE_FORM_LIMITS = {
	firstName: 100,
	lastName: 100,
	middleName: 100,
	prefix: 40,
	placeOfBirth: 200,
	nationality: 80,
	primaryLanguage: 80,
	vipCode: 50,
	currency: 10,
	contactEmail: 254,
	street: 500,
	city: 120,
	state: 120,
	country: 120,
	postalCode: 32,
	phoneNumber: 32,
	idDocumentNumber: 80,
	userEmail: 254,
	userName: 80,
	password: 128,
	employeeCode: 64,
} as const;

const genderEnum = z.enum([
	"male",
	"female",
	"other",
	"prefer_not_to_say",
	"unknown",
	"not_applicable",
]);

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

const validateActiveSchedule = (activeSchedule: any, ctx: z.RefinementCtx) => {
	if (!activeSchedule || typeof activeSchedule !== "object") return;
	const pattern = Array.isArray(activeSchedule.pattern) ? activeSchedule.pattern : [];
	pattern.forEach((day: any, index: number) => {
		if (day?.shiftTypeId || !day?.shiftSnapshot) return;
		if (!hasValidWorkSlot(day.shiftSnapshot)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Manual schedule days need at least one work slot with different start and end times.",
				path: ["employee", "activeSchedule", "pattern", index, "shiftSnapshot", "timeSlots"],
			});
		}
	});
};

/**
 * RHF + zodResolver shape (subset enforced here; rest passthrough for step-wise validation).
 * Matches ~/types/employee-form.types.ts closely enough for field-level errors.
 */
export const EmployeeFormRhfSchema = z
	.object({
		person: z
			.object({
				personalInfo: z
					.object({
						prefix: z.string().max(EMPLOYEE_FORM_LIMITS.prefix).optional(),
						firstName: z
							.string()
							.min(1, "First name is required")
							.max(EMPLOYEE_FORM_LIMITS.firstName),
						middleName: z.string().max(EMPLOYEE_FORM_LIMITS.middleName).optional(),
						lastName: z
							.string()
							.min(1, "Last name is required")
							.max(EMPLOYEE_FORM_LIMITS.lastName),
						dateOfBirth: z.string().min(1, "Date of birth is required"),
						placeOfBirth: z.string().max(EMPLOYEE_FORM_LIMITS.placeOfBirth).optional(),
						age: z.number().min(0).max(150).optional(),
						nationality: z
							.string()
							.min(1, "Nationality is required")
							.max(EMPLOYEE_FORM_LIMITS.nationality),
						primaryLanguage: z.string().max(EMPLOYEE_FORM_LIMITS.primaryLanguage).optional(),
						gender: genderEnum,
						currency: z.string().max(EMPLOYEE_FORM_LIMITS.currency).optional(),
						vipCode: z.string().max(EMPLOYEE_FORM_LIMITS.vipCode).optional(),
					})
					.passthrough(),
				contactInfo: z
					.object({
						email: z
							.string()
							.min(1, "Email is required")
							.max(EMPLOYEE_FORM_LIMITS.contactEmail)
							.email("Invalid email"),
						phones: z.array(z.any()).optional(),
						fax: z.string().optional(),
						address: z.array(z.any()).optional(),
					})
					.passthrough(),
				identification: z.object({}).passthrough(),
			})
			.passthrough(),
		user: z
			.object({
				email: z
					.string()
					.max(EMPLOYEE_FORM_LIMITS.userEmail)
					.refine((v) => v === "" || z.string().email().safeParse(v).success, {
						message: "Invalid email",
					}),
				userName: z.string().max(EMPLOYEE_FORM_LIMITS.userName),
				password: z.string().max(EMPLOYEE_FORM_LIMITS.password),
				roleId: z.string(),
				status: z.enum(["active", "inactive"]).optional(),
				loginMethod: z.enum(["email", "username"]).optional(),
				organizationId: z.string().optional(),
				avatar: z.string().optional(),
			})
			.passthrough(),
		employee: z.object({}).passthrough(),
	})
	.passthrough()
	.superRefine((value, ctx) => {
		validateActiveSchedule((value as any)?.employee?.activeSchedule, ctx);
	});

export type EmployeeFormRhfValues = z.infer<typeof EmployeeFormRhfSchema>;
