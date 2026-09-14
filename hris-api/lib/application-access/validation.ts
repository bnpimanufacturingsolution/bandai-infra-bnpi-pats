import { z } from "zod";
import { isValidEntityId } from "../../helper/id-validation.helper";
import { ASSIGNABLE_LMS_ROLES, PERFORMANCE_USER_SUBROLES, DEFAULT_EPMR_SUBROLES } from "./vocabulary";

/**
 * Request validation for the Training & Performance access API.
 * Unknown values are rejected at this boundary (Phase 2 §13); the server
 * owns effective access, provenance, provisioning status, and telemetry —
 * clients can never submit them (Phase 3 §15).
 */

/** z.enum() requires a mutable [string, ...string[]] tuple; vocabularies are readonly. */
const asZodEnumTuple = <T extends readonly string[]>(values: T) =>
	values as unknown as [T[number], ...T[number][]];

const assignableLmsRolesTuple = asZodEnumTuple(ASSIGNABLE_LMS_ROLES);
const epmrSubrolesTuple = asZodEnumTuple(PERFORMANCE_USER_SUBROLES);
const removableSubrolesTuple = asZodEnumTuple(DEFAULT_EPMR_SUBROLES);

export const UpdateApplicationAccessSchema = z
	.object({
		lmsRoleOverride: z.enum(assignableLmsRolesTuple).nullable(),
		epmrGrants: z.array(z.enum(epmrSubrolesTuple)).max(PERFORMANCE_USER_SUBROLES.length),
		epmrRemovals: z.array(z.enum(removableSubrolesTuple)).max(DEFAULT_EPMR_SUBROLES.length),
	})
	.strict()
	.superRefine((value, ctx) => {
		const grants = new Set(value.epmrGrants);
		for (const removal of value.epmrRemovals) {
			if (grants.has(removal)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["epmrRemovals"],
					message: `Subrole "${removal}" cannot be both granted and removed.`,
				});
			}
		}
	});

export type UpdateApplicationAccessInput = z.infer<typeof UpdateApplicationAccessSchema>;

export const EmployeeIdParamSchema = z
	.string()
	.trim()
	.refine(isValidEntityId, "Invalid employee ID format");
