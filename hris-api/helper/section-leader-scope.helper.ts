import { PrismaClient, Prisma } from "../generated/prisma";

/**
 * Section leader scope resolution (read side).
 *
 * Builds on the assignment model confirmed 2026-09-07:
 * - `SectionLineLeader` (section_line_leaders) assigns leaders to sections.
 * - `Employee.lineLeaderId` optionally pins a member to ONE responsible leader
 *   (used when a section has 2+ leaders so "each leader has a different set
 *   of members under them").
 *
 * Membership convention (both data paths exist in the repo; an employee counts
 * as a member of a section through either):
 *   - `Employee.sectionId`, or
 *   - `Employee.position.sectionId`.
 */

export interface SectionLeaderScopeResult {
	ok: boolean;
	/** Why the check failed (when ok=false). */
	reason?: "not_a_section_leader" | "target_outside_led_sections";
	/** Sections led by the acting employee. */
	ledSectionIds: string[];
	/** Sections the target employee belongs to. */
	targetSectionIds: string[];
}

/** Sections the given employee is assigned to lead. */
export async function getSectionIdsLedByEmployee(
	prisma: PrismaClient,
	employeeId: string,
): Promise<string[]> {
	const memberships = await prisma.sectionLineLeader.findMany({
		where: { employeeId },
		select: { sectionId: true },
	});
	return memberships.map((row) => row.sectionId);
}

/** Active member employee ids for the given sections (sectionId or position.sectionId). */
export async function getSectionEmployeeIds(
	prisma: PrismaClient,
	params: { organizationId: string; sectionIds: string[] },
): Promise<string[]> {
	if (!params.sectionIds.length) return [];
	const members = await prisma.employee.findMany({
		where: {
			organizationId: params.organizationId,
			isDeleted: false,
			OR: [
				{ sectionId: { in: params.sectionIds } },
				{ position: { is: { sectionId: { in: params.sectionIds } } } },
			],
		},
		select: { id: true },
	});
	return members.map((row) => row.id);
}

/** Sections the given employee belongs to (member perspective). */
export async function getSectionIdsForEmployee(
	prisma: PrismaClient,
	organizationId: string,
	employeeId: string,
): Promise<string[]> {
	const employee = await prisma.employee.findFirst({
		where: { id: employeeId, organizationId, isDeleted: false },
		select: {
			sectionId: true,
			position: { select: { sectionId: true } },
		},
	});
	if (!employee) return [];
	const ids = new Set<string>();
	if (employee.sectionId) ids.add(employee.sectionId);
	if (employee.position?.sectionId) ids.add(employee.position.sectionId);
	return Array.from(ids);
}

/**
 * The employee's responsible line leader id, following the confirmed rule:
 * (a) explicit `Employee.lineLeaderId` wins; (b) unset + their section has
 * exactly one leader → that leader; (c) unset + 2+ leaders → null (ambiguous;
 * any section leader may act until admin assigns members).
 */
export async function resolveResponsibleLineLeaderId(
	prisma: PrismaClient,
	params: { organizationId: string; employeeId: string },
): Promise<string | null> {
	const employee = await prisma.employee.findFirst({
		where: { id: params.employeeId, organizationId: params.organizationId, isDeleted: false },
		select: { lineLeaderId: true },
	});
	if (employee?.lineLeaderId) return employee.lineLeaderId;

	const sectionIds = await getSectionIdsForEmployee(prisma, params.organizationId, params.employeeId);
	if (!sectionIds.length) return null;
	const leaders = await prisma.sectionLineLeader.findMany({
		where: { sectionId: { in: sectionIds } },
		select: { employeeId: true },
	});
	const uniqueLeaders = Array.from(new Set(leaders.map((row) => row.employeeId)));
	if (uniqueLeaders.length === 1) return uniqueLeaders[0];
	return null;
}

/**
 * Whether the acting employee may act as line leader for the target employee
 * (file requests, tag day labor). Explicit assignment wins; fallback allows
 * any leader of the target's section when no explicit assignment exists.
 * Acting for oneself is NOT granted here (self-filing is the normal process).
 */
export async function canActAsLineLeaderForEmployee(
	prisma: PrismaClient,
	params: { organizationId: string; leaderEmployeeId: string; targetEmployeeId: string },
): Promise<SectionLeaderScopeResult> {
	const ledSectionIds = await getSectionIdsLedByEmployee(prisma, params.leaderEmployeeId);
	if (!ledSectionIds.length) {
		return { ok: false, reason: "not_a_section_leader", ledSectionIds, targetSectionIds: [] };
	}

	const responsibleId = await resolveResponsibleLineLeaderId(prisma, {
		organizationId: params.organizationId,
		employeeId: params.targetEmployeeId,
	});
	if (responsibleId === params.leaderEmployeeId) {
		const targetSectionIds = await getSectionIdsForEmployee(
			prisma,
			params.organizationId,
			params.targetEmployeeId,
		);
		return { ok: true, ledSectionIds, targetSectionIds };
	}

	// Fallback paths: explicit assignment exists but points elsewhere, OR no
	// explicit assignment with an ambiguous/absent section resolution.
	const targetSectionIds = await getSectionIdsForEmployee(
		prisma,
		params.organizationId,
		params.targetEmployeeId,
	);
	const sharesSection = targetSectionIds.some((sectionId) => ledSectionIds.includes(sectionId));
	if (sharesSection) {
		if (responsibleId) {
			// Explicitly assigned to a different leader in the same section.
			return { ok: false, reason: "target_outside_led_sections", ledSectionIds, targetSectionIds };
		}
		// No explicit assignment: single-leader sections already resolved above,
		// so reaching here means 2+ leaders (ambiguous) — allow until assigned.
		return { ok: true, ledSectionIds, targetSectionIds };
	}
	return { ok: false, reason: "target_outside_led_sections", ledSectionIds, targetSectionIds };
}

/**
 * Resolve assignee ids for a leader-approval step: the leader(s) responsible
 * for the given employees. Returns employee ids (deduped).
 */
export async function resolveLeaderAssigneeIdsForTargets(
	prisma: PrismaClient,
	params: { organizationId: string; targetEmployeeIds: string[] },
): Promise<string[]> {
	const assignees = new Set<string>();
	for (const targetEmployeeId of params.targetEmployeeIds) {
		const responsibleId = await resolveResponsibleLineLeaderId(prisma, {
			organizationId: params.organizationId,
			employeeId: targetEmployeeId,
		});
		if (responsibleId) {
			assignees.add(responsibleId);
			continue;
		}
		const sectionIds = await getSectionIdsForEmployee(prisma, params.organizationId, targetEmployeeId);
		if (!sectionIds.length) continue;
		const leaders = await prisma.sectionLineLeader.findMany({
			where: { sectionId: { in: sectionIds } },
			select: { employeeId: true },
		});
		leaders.forEach((row) => assignees.add(row.employeeId));
	}
	return Array.from(assignees);
}

export type SectionLeaderScopeCheck = Prisma.PrismaPromise<unknown> | unknown;
