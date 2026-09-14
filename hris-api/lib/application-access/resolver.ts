import { isEmployeeSelfServiceBlockedStatus } from "../../helper/employee-action-block.helper";
import {
	ASSIGNABLE_LMS_ROLES,
	DEFAULT_EPMR_SUBROLES,
	EPMR_SUBROLE_ORDER,
	LMS_ACCESS_TOKEN_BY_ROLE,
	LMS_PERSONA_BY_ROLE,
	SUPERADMIN_LMS_ROLES,
	type EpmrSubrole,
	type LmsRole,
} from "./vocabulary";

/**
 * Training & Performance access resolver (Phase 2 frozen architecture).
 *
 * Pure function: no DB, no HTTP, no React, no bridge transport.
 * Precedence (Phase 2 §10):
 *   1. Employment eligibility gate (reuses the existing HRIS lifecycle helper)
 *   2. Superadmin system inheritance (overrides grants/removals)
 *   3. Defaults + grants − removals
 *   4. LMS role: override ?? "employee"
 */

/** Explicit employee configuration, exactly what EmployeeApplicationAccess stores. */
export interface TrainingPerformanceAccessConfig {
	lmsRoleOverride?: string | null;
	epmrGrants?: string[] | null;
	epmrRemovals?: string[] | null;
}

/** Minimal employee inputs the resolver needs. */
export interface TrainingPerformanceEmployee {
	employmentStatus?: string | null;
}

export type AccessProvenance = "DEFAULT" | "EXPLICIT" | "INHERITED";

export interface EffectiveTrainingPerformanceAccess {
	/** False when employment status blocks access entirely. */
	eligible: boolean;
	effectiveLmsRole: LmsRole | null;
	effectiveEpmrSubroles: EpmrSubrole[];
	/** Per-subrole provenance for UI/audit display. */
	provenance: {
		lmsRole: AccessProvenance;
		epmrSubroles: Record<EpmrSubrole, AccessProvenance>;
	};
	/** Derived flag — never persisted as source of truth (Phase 2 §7). */
	inherited: boolean;
	/** LMS external-handoff access token (ADMIN|INSTRUCTOR|USER|EMPLOYEE). */
	lmsAccessToken: string | null;
	/** LMS shell persona for the EPMR bridge `role` query param. */
	lmsPersona: string | null;
}

const toSubroleSet = (values: string[] | null | undefined): Set<string> =>
	new Set((values || []).map((value) => String(value).trim().toLowerCase()).filter(Boolean));

const orderSubroles = (set: Set<EpmrSubrole>): EpmrSubrole[] =>
	EPMR_SUBROLE_ORDER.filter((subrole) => set.has(subrole));

export function resolveTrainingPerformanceAccess(
	employee: TrainingPerformanceEmployee | null | undefined,
	accessConfig: TrainingPerformanceAccessConfig | null | undefined,
): EffectiveTrainingPerformanceAccess {
	// 1. Employment eligibility gate — single lifecycle authority (existing helper).
	if (!employee || isEmployeeSelfServiceBlockedStatus(employee.employmentStatus)) {
		return {
			eligible: false,
			effectiveLmsRole: null,
			effectiveEpmrSubroles: [],
			provenance: { lmsRole: "DEFAULT", epmrSubroles: createEmptyProvenance() },
			inherited: false,
			lmsAccessToken: null,
			lmsPersona: null,
		};
	}

	// 2/4. Effective LMS role: override ?? policy default.
	const override = normalizeLmsRole(accessConfig?.lmsRoleOverride);
	const effectiveLmsRole: LmsRole = override ?? "employee";

	// 3. Superadmin system inheritance outranks grants/removals (Phase 2 §7).
	const inherited = SUPERADMIN_LMS_ROLES.includes(effectiveLmsRole);

	let effectiveEpmrSubroles: EpmrSubrole[];
	const epmrProvenance = createEmptyProvenance();

	if (inherited) {
		effectiveEpmrSubroles = [...EPMR_SUBROLE_ORDER];
		for (const subrole of effectiveEpmrSubroles) {
			epmrProvenance[subrole] = "INHERITED";
		}
	} else {
		const effective = new Set<EpmrSubrole>();
		for (const subrole of DEFAULT_EPMR_SUBROLES) {
			effective.add(subrole);
			epmrProvenance[subrole] = "DEFAULT";
		}
		for (const value of toSubroleSet(accessConfig?.epmrGrants)) {
			if (!isEpmrSubrole(value)) continue;
			effective.add(value);
			epmrProvenance[value] = "EXPLICIT";
		}
		for (const value of toSubroleSet(accessConfig?.epmrRemovals)) {
			if (!isEpmrSubrole(value)) continue;
			effective.delete(value);
			epmrProvenance[value] = "EXPLICIT";
		}
		effectiveEpmrSubroles = orderSubroles(effective);
	}

	return {
		eligible: true,
		effectiveLmsRole,
		effectiveEpmrSubroles,
		provenance: { lmsRole: override ? "EXPLICIT" : "DEFAULT", epmrSubroles: epmrProvenance },
		inherited,
		lmsAccessToken: LMS_ACCESS_TOKEN_BY_ROLE[effectiveLmsRole],
		lmsPersona: LMS_PERSONA_BY_ROLE[effectiveLmsRole],
	};
}

export function createEmptyProvenance(): Record<EpmrSubrole, AccessProvenance> {
	return {
		epmr_admin: "DEFAULT",
		epmr_ratee: "DEFAULT",
		epmr_rater: "DEFAULT",
		epmr_qa: "DEFAULT",
	};
}

const EPMR_SUBROLE_SET = new Set<string>(EPMR_SUBROLE_ORDER);

export function isEpmrSubrole(value: string): value is EpmrSubrole {
	return EPMR_SUBROLE_SET.has(value);
}

export function isAssignableLmsRole(value: string): value is LmsRole {
	return (ASSIGNABLE_LMS_ROLES as string[]).includes(value);
}

function normalizeLmsRole(value: string | null | undefined): LmsRole | null {
	const normalized = String(value || "").trim().toLowerCase();
	if (!normalized) return null;
	return (LMS_ROLES_SET as Set<string>).has(normalized) ? (normalized as LmsRole) : null;
}

const LMS_ROLES_SET = new Set<string>([
	"superadmin",
	"admin",
	"instructor",
	"employee",
	"student",
	"user",
	"viewer",
]);
