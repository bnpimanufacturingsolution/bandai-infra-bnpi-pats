/**
 * Training & Performance access vocabulary and policy constants.
 *
 * Single source of truth for the HRIS control plane (Phase 2 frozen
 * architecture). LMS owns what a role permits; EPMR owns what a subrole
 * permits; HRIS only stores/validates/assigns these vocabulary values.
 */

/** LMS base roles (mirrors lms-api/config/common.ts USER_ROLE). */
export const LMS_USER_ROLES = [
	"superadmin",
	"admin",
	"instructor",
	"employee",
	"student",
	"user",
	"viewer",
] as const;

export type LmsRole = (typeof LMS_USER_ROLES)[number];

/** EPMR performance subroles (mirrors lms-api/config/common.ts PERFORMANCE_USER_SUBROLE). */
export const PERFORMANCE_USER_SUBROLES = [
	"epmr_admin",
	"epmr_ratee",
	"epmr_rater",
	"epmr_qa",
] as const;

export type EpmrSubrole = (typeof PERFORMANCE_USER_SUBROLES)[number];

/** Canonical ordering (Phase 2 §12) — used for stable output/audit/bridge payloads. */
export const EPMR_SUBROLE_ORDER: EpmrSubrole[] = [...PERFORMANCE_USER_SUBROLES];

/** Roles an HRIS administrator may assign via the Training & Performance API. */
export const ASSIGNABLE_LMS_ROLES: LmsRole[] = ["employee", "instructor", "admin"];

/** Roles NEVER assignable through HRIS (system/seed or out of scope). */
export const NON_ASSIGNABLE_LMS_ROLES: LmsRole[] = [
	"superadmin",
	"student",
	"user",
	"viewer",
];

/** Policy default: every eligible employee receives these EPMR subroles. */
export const DEFAULT_EPMR_SUBROLES: EpmrSubrole[] = ["epmr_ratee", "epmr_rater"];

/** Only policy defaults may be suppressed via epmrRemovals. */
export const REMOVABLE_EPMR_SUBROLES: EpmrSubrole[] = [...DEFAULT_EPMR_SUBROLES];

/** LMS roles that trigger system inheritance of all EPMR subroles. */
export const SUPERADMIN_LMS_ROLES: LmsRole[] = ["superadmin"];

/** LMS access token vocabulary for the external-handoff contract. */
export const LMS_ACCESS_TOKENS = ["ADMIN", "INSTRUCTOR", "USER", "EMPLOYEE"] as const;

export type LmsAccessToken = (typeof LMS_ACCESS_TOKENS)[number];

/** Effective LMS role → LMS external-handoff access token. */
export const LMS_ACCESS_TOKEN_BY_ROLE: Record<LmsRole, LmsAccessToken | null> = {
	superadmin: "ADMIN",
	admin: "ADMIN",
	instructor: "INSTRUCTOR",
	employee: "EMPLOYEE",
	user: "USER",
	student: null,
	viewer: null,
};

/** LMS shell persona used by the EPMR bridge `role` query param. */
export const LMS_PERSONA_BY_ROLE: Record<LmsRole, string> = {
	superadmin: "admin",
	admin: "admin",
	instructor: "instructor",
	employee: "employee",
	user: "user",
	student: "student",
	viewer: "viewer",
};
