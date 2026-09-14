import { PrismaClient } from "../generated/prisma";

/**
 * Agency scope resolution.
 *
 * Employees linked to an agency have `Employee.agencyId` set.
 * The agency actor's identity lives in `User.metadata` as `{ agencyId, agencyCode }`.
 * This helper resolves which agency the acting user belongs to and whether
 * a target employee belongs to that same agency.
 */

export interface AgencyScopeResult {
	/** The caller's agency ID (null if not an agency actor). */
	callerAgencyId: string | null;
	/** The caller's agency code (null if not an agency actor). */
	callerAgencyCode: string | null;
	/** True when the caller has the `hris-agency` role. */
	isAgencyActor: boolean;
}

/**
 * Resolve the calling user's agency identity from `User.metadata`.
 *
 * `User.metadata` is stored as JSON; agency actors carry `{ agencyId, agencyCode }`.
 */
export async function resolveCallerAgencyId(
	prisma: PrismaClient,
	userId: string,
): Promise<AgencyScopeResult> {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { metadata: true, role: true },
	});

	if (!user) {
		return { callerAgencyId: null, callerAgencyCode: null, isAgencyActor: false };
	}

	const meta = (user.metadata ?? {}) as Record<string, unknown>;
	const agencyId = typeof meta.agencyId === "string" ? meta.agencyId : null;
	const agencyCode = typeof meta.agencyCode === "string" ? meta.agencyCode : null;
	const isAgencyActor = (user.role ?? "").trim().toLowerCase() === "hris-agency";

	return { callerAgencyId: agencyId, callerAgencyCode: agencyCode, isAgencyActor };
}

/**
 * Returns true when `targetEmployee.agencyId` matches the caller's agency.
 * Returns `false` when the caller is not an agency actor or the target has no agency.
 */
export function isSameAgencyEmployee(
	scope: AgencyScopeResult,
	targetAgencyId: string | null | undefined,
): boolean {
	if (!scope.isAgencyActor || !scope.callerAgencyId) return false;
	return scope.callerAgencyId === targetAgencyId;
}

/**
 * Returns a Prisma `where` fragment that scopes a query to employees
 * belonging to the caller's agency. Returns an empty object when the
 * caller is not an agency actor (no scoping needed).
 *
 * Pass `relation` when the scoped model does not carry `agencyId` itself
 * (e.g. Timesheet -> `employee: { agencyId }`).
 */
export function agencyScopeWhere(
	scope: AgencyScopeResult,
	relation?: string,
): Record<string, unknown> {
	if (!scope.isAgencyActor || !scope.callerAgencyId) return {};
	if (relation) return { [relation]: { agencyId: scope.callerAgencyId } };
	return { agencyId: scope.callerAgencyId };
}
