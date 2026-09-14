import type { UpdateApplicationAccessPayload } from "~/services/application-access.service";

/**
 * Training & Performance access UI helpers (Phase 4).
 *
 * Pure display/translation logic only — the Phase 3 backend remains the
 * access control plane. These helpers translate between the human-facing
 * "desired effective access" selection and the Phase 3 delta-over-defaults
 * PUT contract (epmrGrants / epmrRemovals).
 *
 * Vocabulary mirrors the Phase 3 catalog (lib/application-access/vocabulary.ts):
 * - defaults: epmr_ratee + epmr_rater (policy-derived, never stored as config)
 * - explicit-only: epmr_admin + epmr_qa (only addable via epmrGrants)
 * - removable: defaults only (removals cannot target explicit-only roles)
 */

export const LMS_ROLE_LABELS: Record<string, string> = {
	employee: "Employee",
	instructor: "Instructor",
	admin: "Admin",
	superadmin: "Superadmin",
};

export const EPMR_SUBROLE_LABELS: Record<string, string> = {
	epmr_ratee: "Ratee",
	epmr_rater: "Rater",
	epmr_admin: "Admin",
	epmr_qa: "QA",
};

export const PROVISIONING_LABELS: Record<string, string> = {
	PENDING: "Pending",
	SYNCED: "Synced",
	FAILED: "Failed",
	BLOCKED: "Blocked",
};

export function lmsRoleLabel(role?: string | null): string {
	if (!role) return "—";
	return LMS_ROLE_LABELS[role] ?? role;
}

export function epmrSubroleLabel(subrole: string): string {
	return EPMR_SUBROLE_LABELS[subrole] ?? subrole;
}

export function provisioningLabel(status?: string | null): string {
	if (!status) return "—";
	return PROVISIONING_LABELS[status] ?? status;
}

/** Provenance caption shown under LMS role / EPMR access chips. */
export type AccessProvenanceCaption =
	| "Default access"
	| "Configured"
	| "System controlled"
	| "No access";

export function provenanceCaption(input: {
	eligible: boolean;
	inherited: boolean;
	hasExplicitConfig: boolean;
}): AccessProvenanceCaption {
	if (!input.eligible) return "No access";
	if (input.inherited) return "System controlled";
	if (input.hasExplicitConfig) return "Configured";
	return "Default access";
}

/** The configurable access state an administrator selects in the UI. */
export interface AccessSelection {
	/** null = no explicit override (policy default). */
	lmsRoleOverride: "employee" | "instructor" | "admin" | null;
	/** Desired effective EPMR subroles (human checkboxes). */
	epmrSubroles: string[];
}

/**
 * Translates the desired effective access into the Phase 3 PUT payload.
 *
 * - Explicit-only subroles (epmr_admin, epmr_qa) become grants when selected.
 * - Policy defaults that are deselected become removals.
 * - Selected defaults are implied by policy — never granted explicitly.
 */
export function buildAccessUpdatePayload(
	selection: AccessSelection,
	explicitOnlySubroles: string[],
	defaultSubroles: string[],
): UpdateApplicationAccessPayload {
	const selected = new Set(selection.epmrSubroles);
	return {
		lmsRoleOverride: selection.lmsRoleOverride,
		epmrGrants: explicitOnlySubroles.filter((subrole) => selected.has(subrole)),
		epmrRemovals: defaultSubroles.filter((subrole) => !selected.has(subrole)),
	};
}

/**
 * Derives the initial checkbox state from the employee's explicit
 * configuration: policy defaults minus removals plus grants.
 */
export function selectionFromExplicit(
	explicitConfig: { lmsRoleOverride: string | null; epmrGrants: string[]; epmrRemovals: string[] } | null,
	defaultSubroles: string[],
): string[] {
	const selected = new Set(defaultSubroles);
	if (explicitConfig) {
		for (const removal of explicitConfig.epmrRemovals || []) {
			selected.delete(removal);
		}
		for (const grant of explicitConfig.epmrGrants || []) {
			selected.add(grant);
		}
	}
	return Array.from(selected);
}
